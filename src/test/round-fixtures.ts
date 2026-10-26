import { createCards, type Rank } from '../game/cards.js';
import { createGame } from '../game/round.js';
import { Shoe } from '../game/shoe.js';

export const roundCases = [
  {
    name: 'win',
    ranks: ['10', '10', '5', '7', '5'],
    hit: true,
    balance: 1010,
    returned: 20,
    net: 10,
  },
  {
    name: 'loss',
    ranks: ['10', '10', '6', '7'],
    hit: false,
    balance: 990,
    returned: 0,
    net: -10,
  },
  {
    name: 'push',
    ranks: ['10', '10', '7', '7'],
    hit: false,
    balance: 1000,
    returned: 10,
    net: 0,
  },
  {
    name: 'dealer-bust',
    ranks: ['10', '10', '8', '6', 'K'],
    hit: false,
    balance: 1010,
    returned: 20,
    net: 10,
  },
  {
    name: 'player-natural',
    ranks: ['A', '9', 'K', '7'],
    hit: false,
    balance: 1015,
    returned: 25,
    net: 15,
  },
  {
    name: 'both-natural',
    ranks: ['A', 'A', 'K', 'K'],
    hit: false,
    balance: 1000,
    returned: 10,
    net: 0,
  },
  {
    name: 'dealer-natural',
    ranks: ['10', 'A', '8', 'K'],
    hit: false,
    balance: 990,
    returned: 0,
    net: -10,
  },
] satisfies {
  name: string;
  ranks: Rank[];
  hit: boolean;
  balance: number;
  returned: number;
  net: number;
}[];

export function roundState(ranks: readonly Rank[], balance = 1000) {
  const remaining = createCards();
  const opening = ranks.map((rank) => {
    const index = remaining.findIndex((card) => card.rank === rank);
    return remaining.splice(index, 1)[0]!;
  });
  return { ...createGame(new Shoe([...opening, ...remaining])), balance };
}
