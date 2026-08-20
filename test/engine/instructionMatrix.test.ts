import { describe, expect, it } from 'vitest';
import { INSTRUCTION_MATRIX_SIZE, wrapMatrixIndex } from '../../src/engine/types';

describe('wrapMatrixIndex', () => {
  it('leaves an in-range index plus a small positive offset unchanged', () => {
    expect(wrapMatrixIndex(0, 4)).toBe(4);
    expect(wrapMatrixIndex(10, 5)).toBe(15);
  });

  it('wraps forward past the end of the ring', () => {
    expect(wrapMatrixIndex(24, 1)).toBe(0);
    expect(wrapMatrixIndex(20, 10)).toBe(5);
  });

  it('wraps backward past the start of the ring for negative offsets', () => {
    expect(wrapMatrixIndex(0, -1)).toBe(24);
    expect(wrapMatrixIndex(3, -5)).toBe(23);
  });

  it('wraps an offset larger than one full lap of the ring', () => {
    expect(wrapMatrixIndex(0, 25)).toBe(0);
    expect(wrapMatrixIndex(0, 30)).toBe(5);
    expect(wrapMatrixIndex(0, -25)).toBe(0);
    expect(wrapMatrixIndex(0, -30)).toBe(20);
  });

  it('advancing by 1 from the last state wraps to state 0, matching the false-branch rule', () => {
    expect(wrapMatrixIndex(INSTRUCTION_MATRIX_SIZE - 1, 1)).toBe(0);
  });

  it('always returns a value within [0, INSTRUCTION_MATRIX_SIZE)', () => {
    for (let index = 0; index < INSTRUCTION_MATRIX_SIZE; index++) {
      for (let offset = -60; offset <= 60; offset++) {
        const result = wrapMatrixIndex(index, offset);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(INSTRUCTION_MATRIX_SIZE);
      }
    }
  });
});
