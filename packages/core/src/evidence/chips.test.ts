/**
 * Evidence chips (P7): the states, the strategy sets, and the weakest input.
 * These are the rules all three surfaces share, so they are tested once here.
 */
import { describe, expect, it } from 'vitest';
import { CHIPS_BY_STRATEGY, CHIP_SPECS, evidenceChips, evidenceLine, weakestEvidence } from './chips';
import { strategies } from '../strategies';

const state = (chips: { key: string; state: string }[], key: string): string | undefined =>
  chips.find((c) => c.key === key)?.state;

describe('what a chip rests on', () => {
  it('a fact evidences its input; a value alone is only an assumption; nothing is unknown', () => {
    const none = evidenceChips('brrrr', {});
    expect(state(none, 'refurb')).toBe('unknown');
    expect(state(none, 'endValue')).toBe('unknown');
    expect(state(none, 'rent')).toBe('unknown');

    const typed = evidenceChips('brrrr', { present: ['refurbCost', 'arv', 'rent'] });
    expect(state(typed, 'refurb')).toBe('assumed');
    expect(state(typed, 'endValue')).toBe('assumed');
    expect(state(typed, 'rent')).toBe('assumed');

    const evidenced = evidenceChips('brrrr', {
      present: ['refurbCost', 'arv', 'rent'],
      facts: ['builder-quote', 'down-valuation', 'rent-agreed'],
    });
    expect(state(evidenced, 'refurb')).toBe('evidenced');
    expect(state(evidenced, 'endValue')).toBe('evidenced');
    expect(state(evidenced, 'rent')).toBe('evidenced');
  });

  it('a refurb typed as zero is an assumption, not a blank — presence, never size', () => {
    expect(state(evidenceChips('btl', { present: ['refurbCost'] }), 'refurb')).toBe('assumed');
  });

  it('a survey finding does NOT evidence the refurb — it adds to a guess', () => {
    expect(state(evidenceChips('btl', { facts: ['survey-finding'], present: ['refurbCost'] }), 'refurb')).toBe('assumed');
    // the quote replaces the guess, so it does
    expect(state(evidenceChips('btl', { facts: ['builder-quote'] }), 'refurb')).toBe('evidenced');
  });

  it('comps and room sizes are evidenced or unknown — never assumed', () => {
    expect(CHIP_SPECS.comps.neverAssumed).toBe(true);
    expect(CHIP_SPECS.roomSizes.neverAssumed).toBe(true);
    expect(state(evidenceChips('btl', { comps: true }), 'comps')).toBe('evidenced');
    expect(state(evidenceChips('btl', {}), 'comps')).toBe('unknown');
    expect(state(evidenceChips('hmo', { roomsMeasured: true }), 'roomSizes')).toBe('evidenced');
    expect(state(evidenceChips('hmo', {}), 'roomSizes')).toBe('unknown');
  });

  it('no strategy shows a floor-area chip: no Deal Score reads one', () => {
    for (const keys of Object.values(CHIPS_BY_STRATEGY)) expect(keys).not.toContain('area');
    expect(evidenceChips('btl', { present: ['area'] }).map((c) => c.key)).not.toContain('area');
  });
});

describe('which chips a strategy shows', () => {
  it('never one that could not be filled: an HMO gets no comps chip', () => {
    const hmo = strategies.find((s) => s.id === 'hmo');
    expect(hmo?.score.map((c) => c.key)).not.toContain('evidence');
    expect(CHIPS_BY_STRATEGY.hmo).not.toContain('comps');
    expect(evidenceChips('hmo', { comps: true }).map((c) => c.key)).not.toContain('comps');
  });

  it('every strategy that scores sold evidence shows the comps chip', () => {
    for (const s of strategies) {
      const scoresEvidence = s.score.some((c) => c.key === 'evidence');
      expect(CHIPS_BY_STRATEGY[s.id as 'btl'].includes('comps'), s.id).toBe(scoresEvidence);
    }
  });

  it('only strategies with an end value show one', () => {
    expect(CHIPS_BY_STRATEGY.brrrr).toContain('endValue');
    expect(CHIPS_BY_STRATEGY.flip).toContain('endValue');
    expect(CHIPS_BY_STRATEGY.btl).not.toContain('endValue');
    expect(CHIPS_BY_STRATEGY.hmo).not.toContain('endValue');
  });

  it('a flip is sold, not let, so it has no rent chip', () => {
    expect(CHIPS_BY_STRATEGY.flip).not.toContain('rent');
  });

  it('every chip a strategy shows has a spec, and every spec is used', () => {
    const used = new Set(Object.values(CHIPS_BY_STRATEGY).flat());
    for (const key of used) expect(CHIP_SPECS[key], key).toBeTruthy();
    for (const key of Object.keys(CHIP_SPECS)) expect([...used], key).toContain(key);
  });
});

describe('naming the weakest thing', () => {
  it('unknown comes before assumed, and the strategy order breaks ties', () => {
    const chips = evidenceChips('brrrr', { present: ['refurbCost'], facts: [] });
    const weak = weakestEvidence(chips).map((c) => c.key);
    expect(weak[0]).toBe('endValue'); // unknown, and first of the unknowns
    expect(weak).toContain('refurb'); // assumed, so it comes after the unknowns
    expect(weak.indexOf('refurb')).toBeGreaterThan(weak.indexOf('endValue'));
  });

  it('names at most two, and the fix belongs to the weakest of them', () => {
    const line = evidenceLine(evidenceChips('brrrr', { present: ['refurbCost', 'arv', 'rent'] }));
    expect(line.weak.length).toBe(2);
    expect(line.weak[0]).toBe('no sold-price check');
    expect(line.action).toBe(CHIP_SPECS.comps.action);
    expect(line.weakest).toBe('comps');
  });

  it('the line names the SPECIFIC input, never a generic caution', () => {
    // refurb was never entered (unknown), the rent was estimated (assumed)
    const line = evidenceLine(evidenceChips('btl', { present: ['rent'], comps: true }));
    expect(line.weak).toEqual(['no refurb figure', 'a rent you estimated']);
    expect(line.action).toBe('Get a builder’s number');
    // and with a refurb typed in, it is named as the guess it is
    const guessed = evidenceLine(evidenceChips('btl', { present: ['refurbCost', 'rent'], comps: true }));
    expect(guessed.weak).toEqual(['a guessed refurb', 'a rent you estimated']);
  });

  it('a fully evidenced deal has nothing weak to say', () => {
    const line = evidenceLine(evidenceChips('hmo', {
      present: ['refurbCost', 'roomRent'], facts: ['builder-quote', 'rent-agreed'], roomsMeasured: true,
    }));
    expect(line.weak).toEqual([]);
    expect(line.action).toBeNull();
    expect(line.weakest).toBeNull();
  });

  it('every action reads as a sentence with the line’s own ending', () => {
    for (const spec of Object.values(CHIP_SPECS)) {
      const sentence = `${spec.action} to trust it.`;
      expect(sentence.split(' ').length, spec.key).toBeLessThanOrEqual(9);
      expect(spec.action[0], spec.key).toBe(spec.action[0].toUpperCase());
    }
  });

  it('a chip is a label, never a judgement', () => {
    for (const spec of Object.values(CHIP_SPECS)) {
      expect(spec.label.split(' ').length, spec.key).toBeLessThanOrEqual(2);
      expect(spec.label).not.toMatch(/bad|poor|weak|risk|warning/i);
    }
  });
});
