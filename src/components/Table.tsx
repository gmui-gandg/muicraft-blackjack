import { useId } from 'react';
import styles from './Table.module.css';

export type CardView =
  | { readonly concealed: true }
  | {
      readonly concealed: false;
      readonly rank: string;
      readonly suit: 'clubs' | 'diamonds' | 'hearts' | 'spades';
    };

const suitPaths = {
  spades:
    'M40 5C31 20 7 34 7 53c0 17 20 24 30 11-1 12-5 21-12 27h30c-7-6-11-15-12-27 10 13 30 6 30-11C73 34 49 20 40 5Z',
  hearts: 'M40 87 9 52C-10 26 22 2 40 25 58 2 90 26 71 52Z',
  diamonds: 'M40 5 73 48 40 91 7 48Z',
  clubs:
    'M40 8c-20 0-23 24-12 32C3 28-4 64 16 70c9 3 17-2 21-8-1 13-6 23-12 29h30c-6-6-11-16-12-29 4 6 12 11 21 8 20-6 13-42-12-30C63 32 60 8 40 8Z',
};

export function PlayingCard({ card }: { card: CardView }) {
  if (card.concealed) {
    return (
      <div
        className={`${styles.card} ${styles.back}`}
        role="img"
        aria-label="Concealed card"
      >
        <span aria-hidden="true">◇</span>
      </div>
    );
  }
  return (
    <div
      className={`${styles.card} ${card.suit === 'hearts' || card.suit === 'diamonds' ? styles.red : ''}`}
      role="img"
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <span aria-hidden="true" className={styles.rank}>
        {card.rank}
      </span>
      <svg viewBox="0 0 80 96" aria-hidden="true" focusable="false">
        <path d={suitPaths[card.suit]} fill="currentColor" />
      </svg>
    </div>
  );
}

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

function Hand({ hand, active = false }: { hand: HandView; active?: boolean }) {
  const headingId = useId();
  return (
    <section
      className={`${styles.hand} ${active ? styles.active : ''}`}
      aria-labelledby={headingId}
    >
      <h3 id={headingId}>
        {hand.label}{' '}
        {active && <span className={styles.badge}>Active hand</span>}
      </h3>
      <p className={styles.total}>{hand.total}</p>
      <div className={styles.cards}>
        {hand.cards.map((card, index) => (
          <PlayingCard key={index} card={card} />
        ))}
      </div>
      {hand.stake !== undefined && <p>Stake: {hand.stake}</p>}
      {hand.outcome && (
        <p role="status">
          <strong>{hand.outcome.label}</strong> · Return:{' '}
          {hand.outcome.returned} · Net: {hand.outcome.net}
        </p>
      )}
    </section>
  );
}

export type ControlState =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: string };
export type Control = ControlState & {
  readonly label: string;
  readonly onActivate: () => void;
};

export function ActionButton({
  control,
  chip,
}: {
  control: Control;
  chip?: 10 | 50 | 100;
}) {
  const reasonId = useId();
  return (
    <div className={styles.control}>
      <button
        type="button"
        className={chip ? styles.chip : styles.button}
        aria-label={control.label}
        disabled={!control.enabled}
        aria-describedby={!control.enabled ? reasonId : undefined}
        onClick={() => control.onActivate()}
      >
        {chip ? <span>{chip}</span> : control.label}
      </button>
      {!control.enabled && <small id={reasonId}>{control.reason}</small>}
    </div>
  );
}

export interface TableProps {
  readonly balance: number;
  readonly wager: number;
  readonly dealer: HandView;
  readonly players: readonly [HandView] | readonly [HandView, HandView];
  readonly activeHand: 0 | 1 | null;
  readonly chips: ControlState;
  readonly onChip: (value: 10 | 50 | 100) => void;
  readonly actions: readonly Control[];
}

export function Table({
  balance,
  wager,
  dealer,
  players,
  activeHand,
  chips,
  onChip,
  actions,
}: TableProps) {
  return (
    <section className={styles.table} aria-label="Blackjack table">
      <aside className={styles.rail} aria-label="Virtual chips">
        <dl>
          <div>
            <dt>Balance</dt>
            <dd>{balance}</dd>
          </div>
          <div>
            <dt>Wager</dt>
            <dd>{wager}</dd>
          </div>
        </dl>
        <div className={styles.chips} aria-label="Wager chips">
          {([10, 50, 100] as const).map((value) => (
            <ActionButton
              key={value}
              chip={value}
              control={{
                ...chips,
                label: `Add ${value} chips`,
                onActivate: () => onChip(value),
              }}
            />
          ))}
        </div>
      </aside>
      <div className={styles.surface}>
        <div>
          <Hand hand={dealer} />
        </div>
        <p className={styles.tableMark}>
          MuiCraft Blackjack <span>Virtual chips · No cash value</span>
        </p>
        <div className={styles.players}>
          {players.map((hand, index) => (
            <Hand key={index} hand={hand} active={activeHand === index} />
          ))}
        </div>
      </div>
      <div className={styles.actions} role="group" aria-label="Table actions">
        {actions.map((control) => (
          <ActionButton key={control.label} control={control} />
        ))}
      </div>
    </section>
  );
}
