import { expect, test } from 'vitest';
import { outcomeLabels, stressFixtures } from '../src/test/table-fixtures.js';

test('stress fixtures cover every outcome exactly once', () => {
  expect(stressFixtures.map(({ outcome }) => outcome).sort()).toEqual(
    [...outcomeLabels].sort(),
  );
});
