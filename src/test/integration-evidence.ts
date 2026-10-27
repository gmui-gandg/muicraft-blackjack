import type { GameEvent, GameState } from '../game/round.js';

export interface IntegrationEvidence {
  writes: string[];
  attempts: GameEvent['type'][];
  transitions: {
    phase: GameState['phase'];
    balance: number;
    history: string[];
    hands: number[];
    dealer: number;
  }[];
  controls: { type: GameEvent['type']; allowed: boolean; disabled: boolean }[];
}
declare global {
  interface Window {
    integrationEvidence: IntegrationEvidence;
  }
}
