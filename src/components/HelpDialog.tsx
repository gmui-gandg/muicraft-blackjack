import { useRef } from 'react';
import type { ReactNode } from 'react';
import { CLASSIC_RULES } from '../game/rules';
import { WAGER_LIMITS } from '../game/round';
import styles from './HelpDialog.module.css';

export function HelpDialog({
  shortcuts,
  onOpenChange,
}: {
  shortcuts: ReactNode;
  onOpenChange: (open: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={opener}
        className={styles.button}
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          onOpenChange(true);
          close.current?.focus();
        }}
      >
        Help
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="help-title"
        onClose={() => {
          onOpenChange(false);
          opener.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            close.current?.focus();
          }
        }}
      >
        <h2 id="help-title">Rules and keyboard controls</h2>
        <button
          ref={close}
          className={styles.button}
          type="button"
          onClick={() => dialog.current?.close()}
        >
          Close Help
        </button>
        <p>For entertainment only — virtual chips, no cash value</p>
        <p>
          Local balances are editable by the player and are not verified scores.
        </p>
        <h3>{CLASSIC_RULES.id}</h3>
        <ul>
          <li>
            {CLASSIC_RULES.deckCount} standard decks (312 cards). Shuffle at
            start; reshuffle before a new round at{' '}
            {CLASSIC_RULES.reshuffleAtRemaining} or fewer cards remaining, never
            intentionally mid-round.
          </li>
          <li>
            Dealer hits through 16 and stands on all 17, including soft 17
            (S17). Opening peeks check for dealer blackjack with an Ace or
            ten-value upcard before player actions.
          </li>
          <li>
            Aces count as 11 or 1; face cards count as 10. An unsplit opening
            Ace and ten-value card is a natural blackjack paying 3:2. Ordinary
            wins pay 1:1; losses forfeit the stake; pushes return it. Both
            opening naturals push; with only a dealer natural, the player loses.
          </li>
          <li>
            One funded same-rank split only, at most two hands. Q + Q qualifies;
            10 + J does not. Split aces receive one card each then automatically
            stand. Split 21 pays ordinary 1:1, never natural 3:2.
          </li>
          <li>
            Double on the first two cards with funds for an equal additional
            stake, including non-ace split hands: draw exactly one card then
            automatically stand. Each split hand settles independently.
          </li>
          <li>
            Start with 1,000 virtual chips. Wagers: {WAGER_LIMITS.min}–
            {WAGER_LIMITS.max} in multiples of {WAGER_LIMITS.step}, capped by
            available balance. Presets add 10, 50 or 100 chips. No insurance,
            surrender or side bets.
          </li>
          <li>
            21 or bust ends the hand. Next Hand is explicit. A depleted bankroll
            requires confirmed Reset Virtual Bankroll.
          </li>
        </ul>
        <h3>Keyboard</h3>
        {shortcuts}
        <p>
          Enter on the page uses the primary action: Deal, then Hit, then Next
          Hand. Enter on a focused button activates that button instead. Selects
          and editable fields keep their native keys. Shortcuts require an
          eligible action and a fresh key press, without modifiers; they pause
          in Help and reset confirmation. Escape closes Help; Tab and Shift+Tab
          stay on Close Help.
        </p>
        <p>
          Motion uses the saved system, reduced or full preference. Audio stays
          muted. Reload restores only settled chips and preferences; unfinished
          rounds are discarded with an explanation. Use one active session per
          browser storage key; simultaneous tabs can overwrite local progress.
        </p>
      </dialog>
    </>
  );
}
