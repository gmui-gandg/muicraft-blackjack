import type { IntegrationEvidence } from './integration-evidence';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../app/App';
import { createPlaySession } from '../app/session';
import { dispatchRound } from '../app/dispatch';
import { eligibility } from '../game/round';
import type { Rank } from '../game/cards';
import { createSessionStorage } from '../storage/session';
import { roundState } from './round-fixtures';
import '../styles/global.css';

const cases: Record<string, readonly Rank[]> = {
  ordinary: ['10', '10', '8', '7'],
  keyboard: ['2', '10', '3', '7', '2', '2', '2'],
  split: ['Q', 'A', 'Q', '6', '2', '3', '8', '7'],
  aces: ['A', '10', 'A', '7', 'K', '9'],
  'split-21': ['Q', '10', 'Q', '7', 'A', 'A'],
  'different-ranks': ['10', '10', 'J', '7'],
  insufficient: ['Q', '10', 'Q', '7'],
  mixed: ['Q', '6', 'Q', '5', '7', '6', '6'],
};
const params = new URLSearchParams(location.search);
const ranks = cases[params.get('scenario') ?? 'ordinary'] ?? cases.ordinary!;
const evidence: IntegrationEvidence = {
  writes: [],
  attempts: [],
  transitions: [],
  controls: [],
};
window.integrationEvidence = evidence;
const adapter = createSessionStorage(() => {
  const storage = window.localStorage;
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      storage.setItem(key, value);
      evidence.writes.push(value);
    },
  };
});
const session = createPlaySession(
  adapter,
  (saved) => ({
    ...roundState(ranks),
    balance: saved.settledBankroll,
    wager: saved.dealWager ?? 0,
  }),
  (state, event) => {
    evidence.attempts.push(event.type);
    if (event.type === 'DEAL' && params.get('interrupt') === 'DEALING')
      throw new Error('Test-only simulated unload: DEALING');
    return dispatchRound(state, event, (next) => {
      evidence.transitions.push({
        phase: next.phase,
        balance: next.balance,
        history: next.history.map((event) => event.type),
        hands: next.round?.hands.map((hand) => hand.cards.length) ?? [],
        dealer: next.round?.dealer.length ?? 0,
      });
      if (next.phase === params.get('interrupt'))
        throw new Error(`Test-only simulated unload: ${next.phase}`);
    });
  },
);
const events = [
  'DEAL',
  'HIT',
  'STAND',
  'DOUBLE',
  'SPLIT',
  'NEXT_HAND',
] as const;
new MutationObserver(() => {
  const state = session.getSnapshot().result.state;
  for (const type of events) {
    const label = {
      DEAL: 'Deal',
      HIT: 'Hit',
      STAND: 'Stand',
      DOUBLE: 'Double',
      SPLIT: 'Split',
      NEXT_HAND: 'Next Hand',
    }[type];
    const button = document.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (button)
      evidence.controls.push({
        type,
        allowed: eligibility(state, { type }).allowed,
        disabled: button.disabled,
      });
  }
}).observe(document.getElementById('root')!, {
  subtree: true,
  childList: true,
  attributes: true,
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
