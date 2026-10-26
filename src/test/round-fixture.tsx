import { createRoot } from 'react-dom/client';
import { PlayableRound } from '../app/PlayableRound';
import { roundCases, roundState } from './round-fixtures';
import '../styles/global.css';

const scenario = new URLSearchParams(location.search).get('scenario');
const fixture =
  roundCases.find((entry) => entry.name === scenario) ?? roundCases[0]!;
createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1200, margin: 'auto', padding: 12 }}>
    <h1>Development gameplay fixture: {scenario}</h1>
    <PlayableRound
      initialState={() =>
        roundState(
          fixture.ranks,
          scenario === 'reset' ? 5 : scenario === 'low' ? 60 : 1000,
        )
      }
    />
  </main>,
);
