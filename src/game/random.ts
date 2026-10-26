export type Uint32Source = () => number;
const UINT32_RANGE = 2 ** 32;

export const cryptoUint32: Uint32Source = () => {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0]!;
};

export function randomIndex(
  exclusiveMax: number,
  nextUint32: Uint32Source = cryptoUint32,
): number {
  if (
    !Number.isInteger(exclusiveMax) ||
    exclusiveMax < 1 ||
    exclusiveMax > UINT32_RANGE
  ) {
    throw new RangeError(
      'Random index bound must be an integer from 1 to 2^32',
    );
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % exclusiveMax);
  for (;;) {
    const value = nextUint32();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) {
      throw new RangeError(
        'Random source must return an unsigned 32-bit integer',
      );
    }
    if (value < limit) return value % exclusiveMax;
  }
}

export function shuffle<T>(
  items: readonly T[],
  nextUint32: Uint32Source = cryptoUint32,
): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1, nextUint32);
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled;
}
