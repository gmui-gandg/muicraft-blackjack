import type { HandView, TableProps } from '../components/Table.types.js';

const first: HandView = {
  label: 'Hand 1',
  cards: [
    { concealed: false, rank: '8', suit: 'hearts' },
    { concealed: false, rank: 'K', suit: 'clubs' },
  ],
  total: 'Total: 18',
  stake: 50,
};
const second: HandView = {
  label: 'Hand 2',
  cards: [
    { concealed: false, rank: '8', suit: 'spades' },
    { concealed: false, rank: '3', suit: 'diamonds' },
  ],
  total: 'Total: 11',
  stake: 50,
};
export const splitFixture: TableProps = {
  balance: 900,
  wager: 100,
  dealer: {
    label: 'Dealer',
    total: 'Visible total: 6',
    cards: [
      { concealed: false, rank: '6', suit: 'clubs' },
      { concealed: true },
    ],
  },
  players: [first, second],
  activeHand: 1,
  chips: { enabled: false, reason: 'Wagers are closed for this hand.' },
  onChip: () => {},
  actions: ['Hit', 'Stand', 'Double'].map((label) => ({
    label,
    enabled: true,
    onActivate: () => {},
  })),
};
export const bettingFixture: TableProps = {
  balance: 1000,
  wager: 50,
  dealer: { label: 'Dealer', total: 'Waiting for a deal', cards: [] },
  players: [{ label: 'Your hand', total: 'Ready to deal', cards: [] }],
  activeHand: null,
  chips: { enabled: true },
  onChip: () => {},
  actions: [{ label: 'Deal', enabled: true, onActivate: () => {} }],
};
type Outcome = NonNullable<HandView['outcome']>;
export const outcomeValues = {
  Win: { returned: 100, net: 50 },
  Loss: { returned: 0, net: -50 },
  Push: { returned: 50, net: 0 },
} satisfies Record<Outcome['label'], Omit<Outcome, 'label'>>;

export function isOutcomeLabel(label: string): label is Outcome['label'] {
  return Object.hasOwn(outcomeValues, label);
}
export const outcomeLabels = Object.keys(outcomeValues).filter(isOutcomeLabel);

export function outcomeFixture(label: Outcome['label']): TableProps {
  return {
    ...splitFixture,
    dealer: {
      label: 'Dealer',
      total: 'Total: 17',
      cards: [
        { concealed: false, rank: '7', suit: 'clubs' },
        { concealed: false, rank: 'K', suit: 'spades' },
      ],
    },
    players: [
      {
        label: 'Your hand',
        total:
          label === 'Win'
            ? 'Total: 18'
            : label === 'Loss'
              ? 'Total: 16'
              : 'Total: 17',
        cards: [
          { concealed: false, rank: '10', suit: 'hearts' },
          {
            concealed: false,
            rank: label === 'Win' ? '8' : label === 'Loss' ? '6' : '7',
            suit: 'clubs',
          },
        ],
        stake: 50,
        outcome: { label, ...outcomeValues[label] },
      },
    ],
    activeHand: null,
    actions: [{ label: 'Next Hand', enabled: true, onActivate: () => {} }],
  };
}

export const presentationFixtures = [
  { scenario: 'betting', fixture: bettingFixture },
  { scenario: 'two-hands', fixture: splitFixture },
  ...outcomeLabels.map((label) => ({
    scenario: label,
    fixture: outcomeFixture(label),
  })),
];
