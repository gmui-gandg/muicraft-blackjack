import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPlaySession } from './app/session';
import { App } from './app/App';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
const session = createPlaySession();
createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
