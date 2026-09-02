import { describe, expect, it } from 'vitest';
import { microcopy, tip } from './microcopy';

describe('microcopy consistency (S8.1 glossary check)', () => {
  it('every tooltip is at most ~20 words', () => {
    for (const [key, text] of Object.entries(microcopy)) {
      const words = text.trim().split(/\s+/).length;
      expect(words, `${key} is ${words} words: "${text}"`).toBeLessThanOrEqual(22);
    }
  });
  it('acronyms are expanded on first use in their tooltip', () => {
    // where an acronym appears, its expansion (or a bracketed gloss) must be present
    const rules: [string, RegExp][] = [
      ['subject.area', /Energy Performance Certificate/],
      ['comps.typical', /interquartile mean/],
    ];
    for (const [key, re] of rules) expect(microcopy[key], key).toMatch(re);
  });
  it('a missing key falls back to the key, never a blank tooltip', () => {
    expect(tip('does.not.exist')).toBe('does.not.exist');
    expect(tip('subject.postcode')).toContain('postcode');
  });
});
