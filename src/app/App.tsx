import styles from './App.module.css';

export function App() {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="title">
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
        <p className={styles.eyebrow}>The MuiCraft collection</p>
        <h1 id="title">
          MuiCraft <span>Blackjack</span>
        </h1>
        <p className={styles.intro}>A little room for a good hand.</p>
        <div className={styles.preview}>
          <h2>Scaffold preview</h2>
          <p>
            The table is taking shape. Gameplay is coming in a later milestone.
          </p>
        </div>
        <p className={styles.notice}>
          For entertainment only — virtual chips, no cash value.
        </p>
      </section>
    </main>
  );
}
