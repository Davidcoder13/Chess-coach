import { describe, it, expect } from 'vitest';
import { grade, accuracyOf, winPct } from '../js/engine-core.js';

describe('engine-core', () => {
  it('grades large evaluation losses as blunders', () => {
    expect(grade(25, false)).toBe('blunder');
    expect(grade(12, false)).toBe('mistake');
    expect(grade(6, false)).toBe('inaccuracy');
    expect(grade(1, true)).toBe('best');
  });

  it('maps evaluation values into a realistic win percentage', () => {
    expect(winPct(0)).toBeCloseTo(50, 0);
    expect(winPct(100)).toBeGreaterThan(50);
    expect(winPct(-100)).toBeLessThan(50);
  });

  it('returns a per-color accuracy summary for analyzed plies', () => {
    const plies = [
      { cp: 0, color: 'w', loss: 1 },
      { cp: -30, color: 'b', loss: 2 },
      { cp: 40, color: 'w', loss: 3 },
      { cp: -20, color: 'b', loss: 4 },
      { cp: 100, color: 'w', loss: 5 }
    ];

    const result = accuracyOf(plies);
    expect(result.w).toBeTypeOf('number');
    expect(result.b).toBeTypeOf('number');
    expect(result.w).toBeGreaterThan(0);
    expect(result.b).toBeGreaterThan(0);
  });
});
