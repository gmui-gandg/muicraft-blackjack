import { createRoot } from 'react-dom/client';
import { Table } from '../components/Table';
import { presentationFixtures } from './table-fixtures';
import '../styles/global.css';

const scenario =
  new URLSearchParams(location.search).get('scenario') ?? 'two-hands';
const entry = presentationFixtures.find(
  (entry) => entry.scenario === scenario,
)!;

createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1200, margin: 'auto', padding: 12 }}>
    <h1>Presentation fixture: {scenario}</h1>
    <p>Test data only. No playable round or engine connection.</p>
    <Table {...entry.fixture} />
  </main>,
);
