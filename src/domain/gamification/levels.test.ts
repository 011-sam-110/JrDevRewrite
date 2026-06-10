import { describe, expect, it } from 'vitest';
import { LEVEL_BASE, levelForXp, levelProgress, xpForLevel } from './levels';

/**
 * The boundary cases are everything for a level curve: the exact XP that tips
 * you into the next level must be right, and the curve must be monotonic (more
 * XP never lowers your level). The triangular thresholds are pinned explicitly
 * so a constant change can't silently move the curve.
 */

describe('xpForLevel', () => {
  it('starts at zero and grows triangularly', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(LEVEL_BASE); // 100
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(4)).toBe(600);
    expect(xpForLevel(5)).toBe(1000);
  });

  it('treats levels below 1 as the floor', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-3)).toBe(0);
  });

  it('charges a bigger step for each successive level', () => {
    const steps = [2, 3, 4, 5, 6].map((l) => xpForLevel(l) - xpForLevel(l - 1));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    }
  });
});

describe('levelForXp', () => {
  it('is level 1 from zero up to (but not including) the level-2 threshold', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2); // exactly on the threshold tips over
  });

  it('lands exactly on each threshold boundary', () => {
    for (let level = 1; level <= 20; level++) {
      const at = xpForLevel(level);
      expect(levelForXp(at)).toBe(level);
      if (level > 1) expect(levelForXp(at - 1)).toBe(level - 1);
    }
  });

  it('is monotonic non-decreasing in xp', () => {
    let prev = 1;
    for (let xp = 0; xp <= 5000; xp += 37) {
      const lvl = levelForXp(xp);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });

  it('rejects negative xp (corrupt input, not silently level 1)', () => {
    expect(() => levelForXp(-1)).toThrow(RangeError);
  });
});

describe('levelProgress', () => {
  it('reports zero progress exactly on a threshold', () => {
    const p = levelProgress(xpForLevel(3));
    expect(p.level).toBe(3);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.xpForNextLevel).toBe(xpForLevel(4) - xpForLevel(3)); // 300
    expect(p.fraction).toBe(0);
  });

  it('reports the fraction of the way through the current level', () => {
    const floor = xpForLevel(2); // 100
    const span = xpForLevel(3) - floor; // 200
    const p = levelProgress(floor + span / 2);
    expect(p.level).toBe(2);
    expect(p.xpIntoLevel).toBe(span / 2);
    expect(p.fraction).toBeCloseTo(0.5);
  });
});
