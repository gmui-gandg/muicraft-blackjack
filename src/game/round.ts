import type { Card } from './cards.js';
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
  | 'PAIR_REQUIRED'
  | 'ALREADY_SPLIT'
  | 'SHOE_EXHAUSTED'
  | 'HAND_COMPLETE'
  | 'TWO_CARDS_REQUIRED'
  | 'SPLIT_ACES';
export type Eligibility =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reason: RejectionReason }>;
export type Outcome = 'blackjack' | 'win' | 'push' | 'loss';
export type PlayerHand = Readonly<{
  cards: readonly Card[];
  stake: number;
  complete: boolean;
  splitAces: boolean;
}>;
type Hands =
  | readonly [PlayerHand & { readonly splitAces: false }]
  | readonly [PlayerHand, PlayerHand];
type Round = Readonly<{
  hands: Hands;
  dealer: readonly Card[];
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
        phase: 'PLAYER_TURN';
        round: Round & { readonly hands: readonly [PlayerHand, PlayerHand] };
        activeHandIndex: 1;
      }>
    | Readonly<{
        phase: 'DEALER_TURN' | 'SETTLEMENT';
        round: Round;
        activeHandIndex: null;
      }>
    | Readonly<{
        phase: 'ROUND_COMPLETE';
        round: Round;
        activeHandIndex: null;
        outcome: Outcome | 'mixed';
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
    case 'STAND':
    case 'DOUBLE':
    case 'SPLIT':
      if (state.phase === 'PLAYER_TURN') {
        const hand =
          state.activeHandIndex === 0
            ? state.round.hands[0]
            : state.round.hands[1];
        if (hand.complete) return { allowed: false, reason: 'HAND_COMPLETE' };
        if (hand.splitAces) return { allowed: false, reason: 'SPLIT_ACES' };
        if (event.type === 'SPLIT' && state.round.hands.length === 2)
          return { allowed: false, reason: 'ALREADY_SPLIT' };
        if (event.type === 'DOUBLE' || event.type === 'SPLIT') {
          if (hand.cards.length !== 2)
            return { allowed: false, reason: 'TWO_CARDS_REQUIRED' };
          if (
            event.type === 'SPLIT' &&
            hand.cards[0]!.rank !== hand.cards[1]!.rank
          )
            return { allowed: false, reason: 'PAIR_REQUIRED' };
          if (state.balance < hand.stake)
            return { allowed: false, reason: 'INSUFFICIENT_FUNDS' };
        }
        return event.type === 'STAND' ||
          state.shoe.length >= (event.type === 'SPLIT' ? 2 : 1)
          ? { allowed: true }
          : { allowed: false, reason: 'SHOE_EXHAUSTED' };
      }
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

function updateHand(
  hands: Hands,
  index: 0 | 1,
  changes: Partial<Omit<PlayerHand, 'splitAces'>>,
): Hands {
  return hands.length === 1
    ? [{ ...hands[0], ...changes }]
    : index === 0
      ? [{ ...hands[0], ...changes }, hands[1]]
      : [hands[0], { ...hands[1], ...changes }];
}

function handOutcome(
  hand: PlayerHand,
  dealerCards: readonly Card[],
  split: boolean,
): Outcome {
  const player = scoreHand(hand.cards);
  const dealer = scoreHand(dealerCards);
  const playerNatural = isNatural(hand.cards, split ? 'split' : 'original');
  const dealerNatural = isNatural(dealerCards, 'original');
  if (player.bust || (dealerNatural && !playerNatural)) return 'loss';
  if (playerNatural && !dealerNatural) return 'blackjack';
  if (playerNatural || player.total === dealer.total) return 'push';
  if (dealer.bust || player.total > dealer.total) return 'win';
  return 'loss';
}

function settle(state: Common, round: Round): GameState {
  const outcomes = round.hands.map((hand) =>
    handOutcome(hand, round.dealer, round.hands.length === 2),
  );
  const returned = round.hands.reduce(
    (total, hand, index) =>
      total +
      hand.stake *
        (
          { blackjack: 2.5, win: 2, push: 1, loss: 0 } satisfies Record<
            Outcome,
            number
          >
        )[outcomes[index]!],
    0,
  );
  let hands = round.hands;
  for (const index of [0, 1] as const) {
    const hand = hands[index];
    if (hand) hands = updateHand(hands, index, { complete: true });
  }
  const outcome = outcomes.every((value) => value === outcomes[0])
    ? outcomes[0]!
    : 'mixed';
  return {
    ...state,
    phase: 'ROUND_COMPLETE',
    round: { ...round, hands },
    activeHandIndex: null,
    balance: state.balance + returned,
    outcome,
    returned,
  };
}

function advancePlayer(state: Common, round: Round): GameState {
  const hands = round.hands;
  if (!hands[0].complete)
    return { ...state, phase: 'PLAYER_TURN', round, activeHandIndex: 0 };
  if (hands.length === 2 && !hands[1].complete)
    return {
      ...state,
      phase: 'PLAYER_TURN',
      round: { ...round, hands },
      activeHandIndex: 1,
    };
  return hands.every((hand) => scoreHand(hand.cards).bust)
    ? settle(state, round)
    : { ...state, phase: 'DEALER_TURN', round, activeHandIndex: null };
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
          splitAces: false,
        },
      ],
      dealer: [upcard, hole],
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
  } else if (event.type === 'SPLIT' && state.phase === 'PLAYER_TURN') {
    const hand = state.round.hands[0];
    const splitAces = hand.cards[0]!.rank === 'A';
    const splitHand = (index: 0 | 1): PlayerHand => {
      const cards = [hand.cards[index]!, state.shoe[index]!];
      return {
        cards,
        stake: hand.stake,
        splitAces,
        complete: splitAces || scoreHand(cards).total === 21,
      };
    };
    next = advancePlayer(
      {
        ...common,
        balance: state.balance - hand.stake,
        shoe: state.shoe.slice(2),
      },
      { ...state.round, hands: [splitHand(0), splitHand(1)] },
    );
  } else if (
    (event.type === 'HIT' ||
      event.type === 'STAND' ||
      event.type === 'DOUBLE') &&
    state.phase === 'PLAYER_TURN'
  ) {
    const index = state.activeHandIndex;
    const hand =
      state.activeHandIndex === 0 ? state.round.hands[0] : state.round.hands[1];
    const draws = event.type !== 'STAND';
    const cards = draws ? [...hand.cards, state.shoe[0]!] : hand.cards;
    const complete = event.type !== 'HIT' || scoreHand(cards).total >= 21;
    const round: Round = {
      ...state.round,
      hands: updateHand(state.round.hands, index, {
        cards,
        complete,
        stake: event.type === 'DOUBLE' ? hand.stake * 2 : hand.stake,
      }),
    };
    const drawn = {
      ...common,
      balance: common.balance - (event.type === 'DOUBLE' ? hand.stake : 0),
      shoe: draws ? state.shoe.slice(1) : state.shoe,
    };
    next = advancePlayer(drawn, round);
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
        ...state.round.hands.flatMap((hand) => hand.cards),
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
