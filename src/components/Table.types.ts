import type { Rank, Suit } from '../game/cards.js';

export const chipDenominations = [10, 50, 100] as const;
export type ChipDenomination = (typeof chipDenominations)[number];

export type CardView =
  | { readonly concealed: true }
  | {
      readonly concealed: false;
      readonly rank: Rank;
      readonly suit: Suit;
    };

export interface HandView {
  readonly label: string;
  readonly cards: readonly CardView[];
  readonly total: string;
  readonly stake?: number;
  readonly outcome?: {
    readonly label: 'Win' | 'Loss' | 'Push';
    readonly returned: number;
    readonly net: number;
  };
}

export type ControlState =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: string };
export type Control = ControlState & {
  readonly label: string;
  readonly onActivate: () => void;
};

export interface TableProps {
  readonly balance: number;
  readonly wager: number;
  readonly dealer: HandView;
  readonly players: readonly [HandView] | readonly [HandView, HandView];
  readonly activeHand: 0 | 1 | null;
  readonly chips:
    ControlState | Readonly<Record<ChipDenomination, ControlState>>;
  readonly onChip: (value: ChipDenomination) => void;
  readonly actions: readonly Control[];
}
