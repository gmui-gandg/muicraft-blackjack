import type { PlaySession } from './session';
import { PlayableRound } from './PlayableRound';
import styles from './App.module.css';

export function App({ session }: { session: PlaySession }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <svg
          className={styles.spade}
          viewBox="0 0 80 96"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M40 5C31 20 7 34 7 53c0 17 20 24 30 11-1 12-5 21-12 27h30c-7-6-11-15-12-27 10 13 30 6 30-11C73 34 49 20 40 5Z"
            fill="currentColor"
          />
        </svg>
        <div>
          <p className={styles.eyebrow}>The MuiCraft collection</p>
          <h1>MuiCraft Blackjack</h1>
        </div>
      </header>
      <section className={styles.preview} aria-labelledby="play-title">
        <h2 id="play-title">Take a seat</h2>
        <p>
          Choose a wager, then Deal. Reload restores settled chips and
          preferences; unfinished hands are discarded. Use one active tab per
          browser session.
        </p>
        <PlayableRound session={session} />
      </section>
      <p className={styles.notice}>
        For entertainment only — virtual chips, no cash value.
      </p>
    </main>
  );
}
