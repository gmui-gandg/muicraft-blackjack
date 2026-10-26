import { useId } from 'react';
import type { Suit } from '../game/cards';
import type { CardView, HandView, Control, TableProps } from './Table.types';
export type {
  CardView,
  HandView,
  ControlState,
  Control,
  TableProps,
} from './Table.types';
import styles from './Table.module.css';

const suitPaths: Record<Suit, string> = {
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

export function ActionButton({
  control,
  chip,
  descriptionId,
}: {
  control: Control;
  chip?: 10 | 50 | 100;
  descriptionId?: string;
}) {
  const reasonId = useId();
  return (
    <div className={styles.control}>
      <button
        type="button"
        className={chip ? styles.chip : styles.button}
        aria-label={control.label}
        disabled={!control.enabled}
        aria-describedby={
          !control.enabled ? (descriptionId ?? reasonId) : undefined
        }
        onClick={() => control.onActivate()}
      >
        {chip ? <span>{chip}</span> : control.label}
      </button>
      {!control.enabled && !descriptionId && (
        <small id={reasonId}>{control.reason}</small>
      )}
    </div>
  );
}

function ControlGroup({
  controls,
  className,
  label,
}: {
  controls: readonly (Control & { readonly chip?: 10 | 50 | 100 })[];
  className?: string;
  label: string;
}) {
  const id = useId();
  const reasons = [
    ...new Set(
      controls.flatMap((control) => (control.enabled ? [] : [control.reason])),
    ),
  ];
  return (
    <div className={className} role="group" aria-label={label}>
      {controls.map((control) => (
        <ActionButton
          key={control.label}
          control={control}
          chip={control.chip}
          descriptionId={
            control.enabled
              ? undefined
              : `${id}-${reasons.indexOf(control.reason)}`
          }
        />
      ))}
      {reasons.map((reason, index) => (
        <small className={styles.reason} key={reason} id={`${id}-${index}`}>
          {reason}
        </small>
      ))}
    </div>
  );
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
        <ControlGroup
          className={styles.chips}
          label="Wager chips"
          controls={([10, 50, 100] as const).map((value) => ({
            ...('enabled' in chips ? chips : chips[value]),
            chip: value,
            label: `Add ${value} chips`,
            onActivate: () => onChip(value),
          }))}
        />
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
      <ControlGroup
        className={styles.actions}
        label="Table actions"
        controls={actions}
      />
    </section>
  );
}
