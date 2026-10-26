import { createRoot } from 'react-dom/client';
import { Table } from '../components/Table';
import { bettingFixture, outcomeFixture, splitFixture } from './table-fixtures';
import '../styles/global.css';

const scenario = new URLSearchParams(location.search).get('scenario');
const fixture =
  scenario === 'betting'
    ? bettingFixture
    : scenario === 'Win' || scenario === 'Loss' || scenario === 'Push'
      ? outcomeFixture(scenario)
      : splitFixture;

createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1200, margin: 'auto', padding: 12 }}>
    <h1>Presentation fixture: {scenario ?? 'two hands'}</h1>
    <p>Test data only. No playable round or engine connection.</p>
    <Table {...fixture} />
  </main>,
);
