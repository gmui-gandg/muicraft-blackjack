export const CLASSIC_DECKS = Object.freeze([0, 1, 2, 3, 4, 5] as const);

export const CLASSIC_RULES = Object.freeze({
  id: 'classic-six-deck-s17-v1',
  deckCount: CLASSIC_DECKS.length,
  reshuffleAtRemaining: 78,
} as const);
