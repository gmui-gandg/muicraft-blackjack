import { cardValue, type Card } from './cards.js';
import type { Uint32Source } from './random.js';
import { CLASSIC_RULES } from './rules.js';
import { isNatural, scoreHand } from './scoring.js';
import { Shoe } from './shoe.js';

export type GameEvent =
  | Readonly<{ type: 'PLACE_BET'; amount: number }>
  | Readonly<{
      type:
        | 'DEAL'
        | 'HIT'
        | 'STAND'
        | 'DEALER_TURN'
        | 'SETTLE'
        | 'NEXT_HAND'
        | 'DOUBLE'
        | 'SPLIT';
    }>;
export type RejectionReason =
  | 'WRONG_PHASE'
  | 'INVALID_WAGER'
  | 'INSUFFICIENT_FUNDS'
  | 'WAGER_REQUIRED'
  | 'NOT_IMPLEMENTED'
  | 'SHOE_EXHAUSTED';
export type Eligibility =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reason: RejectionReason }>;
export type Outcome = 'blackjack' | 'win' | 'push' | 'loss';
export type PlayerHand = Readonly<{
  cards: readonly Card[];
  stake: number;
  complete: boolean;
}>;
type Round = Readonly<{
  hands: readonly [PlayerHand];
  dealer: readonly Card[];
  peeked: boolean;
}>;
type Common = Readonly<{
  balance: number;
  wager: number;
  shoe: readonly Card[];
  discards: readonly Card[];
  history: readonly GameEvent[];
}>;
export type GameState = Common &
  (
    | Readonly<{ phase: 'BETTING'; round: null; activeHandIndex: null }>
    | Readonly<{ phase: 'PLAYER_TURN'; round: Round; activeHandIndex: 0 }>
    | Readonly<{
        phase: 'DEALER_TURN' | 'SETTLEMENT';
        round: Round;
        activeHandIndex: null;
      }>
    | Readonly<{
        phase: 'ROUND_COMPLETE';
        round: Round;
        activeHandIndex: null;
        outcome: Outcome;
        returned: number;
      }>
  );
export type Transition =
  | Readonly<{ accepted: true; state: GameState }>
  | Readonly<{
      accepted: false;
      state: GameState;
      reason: RejectionReason;
    }>;

export function createGame(shoe: Shoe = new Shoe()): GameState {
  return {
    phase: 'BETTING',
    balance: 1000,
    wager: 0,
    shoe: shoe.snapshot(),
    discards: [],
    round: null,
    activeHandIndex: null,
    history: [],
  };
}

function wagerEligibility(balance: number, amount: number): Eligibility {
  if (!Number.isInteger(amount) || amount < 10 || amount > 500 || amount % 10)
    return { allowed: false, reason: 'INVALID_WAGER' };
  if (amount > balance) return { allowed: false, reason: 'INSUFFICIENT_FUNDS' };
  return { allowed: true };
}

export function eligibility(state: GameState, event: GameEvent): Eligibility {
  if (event.type === 'DOUBLE' || event.type === 'SPLIT')
    return { allowed: false, reason: 'NOT_IMPLEMENTED' };
  switch (event.type) {
    case 'PLACE_BET':
      if (state.phase === 'BETTING')
        return wagerEligibility(state.balance, event.amount);
      break;
    case 'DEAL':
      if (state.phase === 'BETTING') {
        if (state.wager === 0)
          return { allowed: false, reason: 'WAGER_REQUIRED' };
        return wagerEligibility(state.balance, state.wager);
      }
      break;
    case 'HIT':
      if (state.phase === 'PLAYER_TURN')
        return state.shoe.length > 0
          ? { allowed: true }
          : { allowed: false, reason: 'SHOE_EXHAUSTED' };
      break;
    case 'STAND':
      if (state.phase === 'PLAYER_TURN') return { allowed: true };
      break;
    case 'DEALER_TURN':
      if (state.phase === 'DEALER_TURN') return { allowed: true };
      break;
    case 'SETTLE':
      if (state.phase === 'SETTLEMENT') return { allowed: true };
      break;
    case 'NEXT_HAND':
      if (state.phase === 'ROUND_COMPLETE') return { allowed: true };
  }
  return { allowed: false, reason: 'WRONG_PHASE' };
}

function settle(state: Common, round: Round): GameState {
  const hand = round.hands[0];
  const player = scoreHand(hand.cards);
  const dealer = scoreHand(round.dealer);
  const playerNatural = isNatural(hand.cards, 'original');
  const dealerNatural = isNatural(round.dealer, 'original');
  let outcome: Outcome;
  if (player.bust || (dealerNatural && !playerNatural)) outcome = 'loss';
  else if (playerNatural && !dealerNatural) outcome = 'blackjack';
  else if (playerNatural || player.total === dealer.total) outcome = 'push';
  else if (dealer.bust || player.total > dealer.total) outcome = 'win';
  else outcome = 'loss';
  const returned =
    hand.stake *
    (
      { blackjack: 2.5, win: 2, push: 1, loss: 0 } satisfies Record<
        Outcome,
        number
      >
    )[outcome];
  return {
    ...state,
    phase: 'ROUND_COMPLETE',
    round: { ...round, hands: [{ ...hand, complete: true }] },
    activeHandIndex: null,
    balance: state.balance + returned,
    outcome,
    returned,
  };
}

export function transition(
  state: GameState,
  event: GameEvent,
  nextUint32?: Uint32Source,
): Transition {
  const permission = eligibility(state, event);
  if (!permission.allowed)
    return { accepted: false, state, reason: permission.reason };
  const common: Common = { ...state, history: [...state.history, event] };
  let next: GameState;
  if (event.type === 'PLACE_BET') {
    next = { ...state, history: common.history, wager: event.amount };
  } else if (event.type === 'DEAL' && state.phase === 'BETTING') {
    const shoe = new Shoe(state.shoe);
    shoe.prepareForRound(nextUint32);
    const playerFirst = shoe.draw()!;
    const upcard = shoe.draw()!;
    const playerSecond = shoe.draw()!;
    const hole = shoe.draw()!;
    const round: Round = {
      hands: [
        {
          cards: [playerFirst, playerSecond],
          stake: state.wager,
          complete: false,
        },
      ],
      dealer: [upcard, hole],
      peeked: cardValue(upcard.rank) === 10 || upcard.rank === 'A',
    };
    const committed = {
      ...common,
      balance: state.balance - state.wager,
      shoe: shoe.snapshot(),
      discards:
        state.shoe.length <= CLASSIC_RULES.reshuffleAtRemaining
          ? []
          : state.discards,
    };
    next =
      isNatural(round.hands[0].cards, 'original') ||
      isNatural(round.dealer, 'original')
        ? settle(committed, round)
        : { ...committed, phase: 'PLAYER_TURN', round, activeHandIndex: 0 };
  } else if (
    (event.type === 'HIT' || event.type === 'STAND') &&
    state.phase === 'PLAYER_TURN'
  ) {
    const hand = state.round.hands[0];
    const cards =
      event.type === 'HIT' ? [...hand.cards, state.shoe[0]!] : hand.cards;
    const complete = event.type === 'STAND' || scoreHand(cards).total >= 21;
    const round: Round = {
      ...state.round,
      hands: [{ ...hand, cards, complete }],
    };
    const drawn = {
      ...common,
      shoe: event.type === 'HIT' ? state.shoe.slice(1) : state.shoe,
    };
    next = scoreHand(cards).bust
      ? settle(drawn, round)
      : complete
        ? { ...drawn, phase: 'DEALER_TURN', round, activeHandIndex: null }
        : { ...drawn, phase: 'PLAYER_TURN', round, activeHandIndex: 0 };
  } else if (event.type === 'DEALER_TURN' && state.phase === 'DEALER_TURN') {
    const dealer = [...state.round.dealer];
    let consumed = 0;
    while (scoreHand(dealer).total < 17) {
      const card = state.shoe[consumed];
      if (!card) return { accepted: false, state, reason: 'SHOE_EXHAUSTED' };
      dealer.push(card);
      consumed += 1;
    }
    next = {
      ...common,
      phase: 'SETTLEMENT',
      round: { ...state.round, dealer },
      activeHandIndex: null,
      shoe: state.shoe.slice(consumed),
    };
  } else if (event.type === 'SETTLE' && state.phase === 'SETTLEMENT') {
    next = settle(common, state.round);
  } else if (event.type === 'NEXT_HAND' && state.phase === 'ROUND_COMPLETE') {
    next = {
      balance: common.balance,
      shoe: common.shoe,
      discards: [
        ...state.discards,
        ...state.round.hands[0].cards,
        ...state.round.dealer,
      ],
      history: common.history,
      phase: 'BETTING',
      wager: 0,
      round: null,
      activeHandIndex: null,
    };
  } else {
    return { accepted: false, state, reason: 'WRONG_PHASE' };
  }
  return { accepted: true, state: next };
}
