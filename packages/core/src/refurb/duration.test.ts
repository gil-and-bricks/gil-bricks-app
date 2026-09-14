/**
 * DP1 — the refurb duration engine.
 *
 * Two things matter more than the arithmetic: it is NEVER a single number, and
 * it always accounts for the whole runway rather than the time on tools. Both
 * are asserted directly.
 */
import { describe, expect, it } from 'vitest';
import {
  bandFor,
  durationForPack,
  partsFor,
  refurbDuration,
  sayMonths,
  sayWeeks,
  totalOf,
  type DurationConfig,
} from './duration';

const CONFIG: DurationConfig = {
  onTools: {
    cosmetic: { from: 2, to: 4 },
    standard: { from: 8, to: 16 },
    structural: { from: 16, to: 30 },
  },
  leadIn: { from: 2, to: 6 },
  snagging: { from: 1, to: 3 },
  voidPeriod: { from: 4, to: 8 },
  structuralItems: ['damp', 'roof'],
  standardItems: ['kitchen', 'bathroom', 'rewire', 'plastering'],
};

describe('the heaviest thing ticked sets the band', () => {
  it('nothing ticked is no duration at all', () => {
    expect(bandFor([], CONFIG)).toBe('none');
    expect(refurbDuration([], CONFIG)).toBeNull();
  });

  it('surfaces alone are cosmetic', () => {
    expect(bandFor(['decoration', 'flooring'], CONFIG)).toBe('cosmetic');
  });

  it('a kitchen makes it standard', () => {
    expect(bandFor(['decoration', 'kitchen'], CONFIG)).toBe('standard');
  });

  /** A roof does not get quicker for being beside a tin of paint. */
  it('one structural item outranks everything else ticked', () => {
    expect(bandFor(['decoration', 'flooring', 'kitchen', 'roof'], CONFIG)).toBe('structural');
  });

  it('ten cosmetic items never add up to a rewire', () => {
    const many = Array.from({ length: 10 }, (_, i) => `cosmetic-${i}`);
    expect(bandFor(many, CONFIG)).toBe('cosmetic');
  });
});

describe('it is the whole runway, not the time on tools', () => {
  it('the total is lead-in + on tools + snagging + void', () => {
    const d = refurbDuration(['kitchen'], CONFIG)!;
    // 2+8+1+4 = 15 low, 6+16+3+8 = 33 high — worked by hand.
    expect(d.total).toEqual({ from: 15, to: 33 });
    expect(totalOf(d.parts)).toEqual(d.total);
  });

  it('the total is always longer than the on-tools time alone', () => {
    for (const scope of [['decoration'], ['kitchen'], ['roof']]) {
      const d = refurbDuration(scope, CONFIG)!;
      expect(d.total.from, `${scope}`).toBeGreaterThan(d.parts.onTools.from);
      expect(d.total.to, `${scope}`).toBeGreaterThan(d.parts.onTools.to);
    }
  });

  it('all four parts are present and none is zero', () => {
    const d = refurbDuration(['kitchen'], CONFIG)!;
    for (const [name, part] of Object.entries(d.parts)) {
      expect(part.from, `${name} from`).toBeGreaterThan(0);
      expect(part.to, `${name} to`).toBeGreaterThanOrEqual(part.from);
    }
  });

  it('a heavier band takes longer than a lighter one', () => {
    const c = refurbDuration(['decoration'], CONFIG)!;
    const s = refurbDuration(['kitchen'], CONFIG)!;
    const x = refurbDuration(['roof'], CONFIG)!;
    expect(s.total.to).toBeGreaterThan(c.total.to);
    expect(x.total.to).toBeGreaterThan(s.total.to);
  });
});

describe("the builder's own figure replaces the on-tools time and nothing else", () => {
  it('takes their number for the work', () => {
    const d = refurbDuration(['kitchen'], CONFIG, { from: 5, to: 6 })!;
    expect(d.parts.onTools).toEqual({ from: 5, to: 6 });
    expect(d.fromBuilder).toBe(true);
  });

  /** A builder quotes their own work, not your lead-in or your void. */
  it('leaves the lead-in, the snagging and the void alone', () => {
    const d = refurbDuration(['kitchen'], CONFIG, { from: 5, to: 6 })!;
    expect(d.parts.leadIn).toEqual(CONFIG.leadIn);
    expect(d.parts.snagging).toEqual(CONFIG.snagging);
    expect(d.parts.voidPeriod).toEqual(CONFIG.voidPeriod);
    expect(d.total).toEqual({ from: 12, to: 23 }); // 2+5+1+4, 6+6+3+8
  });

  it('and says so in the note', () => {
    const d = refurbDuration(['kitchen'], CONFIG, { from: 5, to: 6 })!;
    expect(d.breakdown.note).toMatch(/builder’s figure/);
  });

  it('ignores a nonsense figure rather than using it', () => {
    for (const bad of [{ from: 0, to: 0 }, { from: 8, to: 3 }, null]) {
      const d = refurbDuration(['kitchen'], CONFIG, bad)!;
      expect(d.fromBuilder, JSON.stringify(bad)).toBe(false);
      expect(d.parts.onTools).toEqual(CONFIG.onTools.standard);
    }
  });
});

describe('it is never a single hard number', () => {
  it('every part and the total are ranges', () => {
    const d = refurbDuration(['kitchen'], CONFIG)!;
    for (const part of [...Object.values(d.parts), d.total]) {
      expect(part).toHaveProperty('from');
      expect(part).toHaveProperty('to');
    }
  });

  it('the spoken form says "to", not one figure', () => {
    expect(sayWeeks({ from: 15, to: 33 })).toBe('15 to 33 weeks');
    expect(sayMonths({ from: 15, to: 33 })).toBe('3.5 to 7.6 months');
  });

  it('a genuinely equal range says one figure rather than "6 to 6"', () => {
    expect(sayWeeks({ from: 6, to: 6 })).toBe('6 weeks');
    expect(sayWeeks({ from: 1, to: 1 })).toBe('1 week');
  });

  /** The pack must not be able to print a duration without its basis. */
  it('the pack shape carries the breakdown with the value', () => {
    const packed = durationForPack(refurbDuration(['kitchen'], CONFIG)!);
    expect(packed.value).toEqual({ from: 15, to: 33 });
    expect(packed.breakdown.formula).toBe('lead-in + on tools + snagging + void before rent or sale');
    expect(packed.breakdown.substituted).toContain('+');
  });

  it('the note never states it as a quote', () => {
    const d = refurbDuration(['kitchen'], CONFIG)!;
    expect(d.breakdown.note).toMatch(/estimate/i);
    expect(d.breakdown.note).not.toMatch(/\bquote\b(?!\.)/i);
  });
});

describe('the config alone decides the numbers', () => {
  it('changing a band changes the answer, with no code edit', () => {
    const slower: DurationConfig = { ...CONFIG, onTools: { ...CONFIG.onTools, standard: { from: 20, to: 30 } } };
    expect(refurbDuration(['kitchen'], slower)!.parts.onTools).toEqual({ from: 20, to: 30 });
  });

  it('and so does moving an item between bands', () => {
    const strict: DurationConfig = { ...CONFIG, structuralItems: [...CONFIG.structuralItems, 'kitchen'] };
    expect(bandFor(['kitchen'], strict)).toBe('structural');
  });

  it('partsFor has nothing to say about an empty scope', () => {
    expect(partsFor('none', CONFIG)).toBeNull();
  });
});
