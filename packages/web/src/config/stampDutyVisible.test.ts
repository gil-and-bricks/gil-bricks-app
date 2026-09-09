import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stampDuty } from '@gil-bricks/core';
import { STAMP_DUTY_COPY } from './verdicts';

/**
 * THE TAX MUST BE FINDABLE (E9).
 *
 * Stamp duty is the biggest acquisition cost after the deposit and it is inside
 * cash-in on every strategy — but it was only VISIBLE on buy-to-let. On flip,
 * BRRRR and HMO the words appeared solely inside a collapsed maths accordion,
 * mid-way through a chain of additions, attached to no figure of its own. The
 * operator went looking and could not find it. These tests are that search,
 * written down.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string): string => readFileSync(`${src}${p}`, 'utf8');
const VERDICTS = ['BtlVerdict', 'FlipVerdict', 'BrrrrVerdict', 'HmoVerdict'] as const;

describe('every analyser names the tax and gives it its own figure', () => {
  for (const v of VERDICTS) {
    it(`${v} renders the cost tile`, () => {
      const s = read(`components/analyser/${v}.tsx`);
      expect(s, 'the shared tile, so the four cannot drift apart').toContain('<StampDutyCost id="sec-costs" sdlt={analysis.stampDuty}');
      expect(s, 'and it knows when a company purchase took the choice away').toMatch(/viaCompany=\{p\.(buyingAs|flipAs) === 'ltd'\}/);
      expect(s).toContain("import { StampDutyCost } from './StampDutyCost';");
    });
  }

  it('and the Costs chip lands ON it, not past it', () => {
    for (const v of VERDICTS) {
      const s = read(`components/analyser/${v}.tsx`);
      const tile = s.indexOf('<StampDutyCost id="sec-costs"');
      expect(tile, `${v}`).toBeGreaterThan(-1);
      // the tile that used to own the anchor must give it up while the flag is on
      expect(s, `${v} must not have two sec-costs`).toContain("id={features.stampDutyCost ? undefined : 'sec-costs'}");
    }
  });

  it('the figure is on the tile itself, NOT only inside the accordion', () => {
    const s = read('components/analyser/StampDutyCost.tsx');
    const beforeAccordion = s.slice(0, s.indexOf('<MathsAccordion'));
    expect(beforeAccordion, 'the amount is visible without opening anything').toContain('<p class="tile-value">{fmtMoney(v.tax)}</p>');
    expect(beforeAccordion, 'and so is the name').toContain('STAMP_DUTY_COPY.name(v.country)');
    expect(beforeAccordion, 'and which rules applied').toContain('STAMP_DUTY_COPY.rules(');
    expect(beforeAccordion, 'and what changes it').toContain('STAMP_DUTY_COPY.changesWith');
    expect(s.slice(s.indexOf('<MathsAccordion')), 'the bands stay on demand, as everywhere else').toContain('v.bands');
  });

  it('the component formats and never computes (charter rule 3)', () => {
    const s = read('components/analyser/StampDutyCost.tsx');
    expect(s, 'no arithmetic on the tax').not.toMatch(/tax\s*[*+/-]|\*\s*0\.|\/\s*100/);
    expect(s).toContain('sdlt.value');
  });
});

describe('what the tile says about the rules', () => {
  const england = 'E92000001';
  const wales = 'W92000004';

  it('names the tax by the country whose rules were applied', () => {
    expect(STAMP_DUTY_COPY.name(england)).toBe('Stamp Duty');
    expect(STAMP_DUTY_COPY.name(wales)).toBe('Land Transaction Tax');
  });

  it('says the surcharge IS included when it is', () => {
    const r = stampDuty({ price: 250_000, country: england, buyerType: 'additional' });
    expect(r.value.surchargeApplied).toBe(true);
    const line = STAMP_DUTY_COPY.rules(england, r.value.buyerType, r.value.surchargeApplied);
    expect(line).toBe('England, higher rates. The additional-property surcharge is included.');
  });

  it('and says why it is NOT, when the price is under the threshold', () => {
    const r = stampDuty({ price: 30_000, country: england, buyerType: 'additional' });
    expect(r.value.surchargeApplied).toBe(false);
    expect(STAMP_DUTY_COPY.rules(england, r.value.buyerType, r.value.surchargeApplied))
      .toBe('England, standard rates. This price is under the surcharge threshold.');
  });

  it('Wales gets its own words, and its own standalone higher table', () => {
    const r = stampDuty({ price: 250_000, country: wales, buyerType: 'additional' });
    expect(r.value.surchargeApplied).toBe(true);
    expect(r.value.regime).toContain('LTT higher');
    expect(STAMP_DUTY_COPY.rules(wales, r.value.buyerType, r.value.surchargeApplied)).toContain('Wales, higher rates');
  });

  it('and Wales never claims a first-time-buyer relief it does not have', () => {
    expect(STAMP_DUTY_COPY.rules(wales, 'firstTimeBuyer', false))
      .toBe('Wales has no first-time-buyer relief. Main rates apply.');
    expect(STAMP_DUTY_COPY.rules(england, 'firstTimeBuyer', false)).toBe('England, first-time-buyer rates.');
  });

  it('points at the control that ACTUALLY changes it', () => {
    // "Buying as" is a different field. Buying through a company forces the
    // higher rates, but the choice itself is "Purchase tax basis", and sending
    // somebody to the wrong control is worse than saying nothing.
    expect(STAMP_DUTY_COPY.changesWith).toContain('Purchase tax basis');
    expect(STAMP_DUTY_COPY.changesWith).not.toContain('Buying as');
    expect(STAMP_DUTY_COPY.forcedByCompany).toContain('company');
  });

  it('the control it names is a real field on every strategy', () => {
    const strategies = readFileSync(fileURLToPath(new URL('../../../core/src/strategies/index.ts', import.meta.url)), 'utf8');
    const label = STAMP_DUTY_COPY.changesWith.replace(/^.*“(.+)”.*$/, '$1');
    expect(label).toBe('Purchase tax basis');
    expect((strategies.match(new RegExp(`label: '${label}'`, 'g')) ?? []).length,
      'one per strategy, so the tile never points at a field this page lacks').toBeGreaterThanOrEqual(4);
  });

  it('every line obeys the copy rules', () => {
    const lines = [
      STAMP_DUTY_COPY.rules(england, 'additional', true),
      STAMP_DUTY_COPY.rules(england, 'additional', false),
      STAMP_DUTY_COPY.rules(wales, 'firstTimeBuyer', false),
      STAMP_DUTY_COPY.rules(england, 'standard', false),
      STAMP_DUTY_COPY.changesWith,
      STAMP_DUTY_COPY.forcedByCompany,
    ];
    for (const l of lines) {
      expect(l.split(/(?<=[.!?])\s/).length, `two sentences max: "${l}"`).toBeLessThanOrEqual(2);
      expect(l.split(/\s+/).length, `under 30 words: "${l}"`).toBeLessThan(30);
    }
  });
});

describe('the fact the page relies on comes from the engine, not from the page', () => {
  it('surchargeApplied is a field, so nothing has to re-derive the threshold', () => {
    expect(stampDuty({ price: 250_000, country: 'E92000001', buyerType: 'additional' }).value.surchargeApplied).toBe(true);
    expect(stampDuty({ price: 250_000, country: 'E92000001', buyerType: 'standard' }).value.surchargeApplied).toBe(false);
    expect(stampDuty({ price: 250_000, country: 'W92000004', buyerType: 'additional' }).value.surchargeApplied).toBe(true);
    expect(stampDuty({ price: 250_000, country: 'W92000004', buyerType: 'standard' }).value.surchargeApplied).toBe(false);
  });

  it('the country on the result is the RULES used, echoed back for the label', () => {
    expect(stampDuty({ price: 200_000, country: 'W92000004', buyerType: 'standard' }).value.country).toBe('W92000004');
  });
});

describe('the extension panel says it too', () => {
  const panel = readFileSync(fileURLToPath(new URL('../../../extension/entrypoints/sidepanel/main.ts', import.meta.url)), 'utf8');

  it('renders the note under the tax amount', () => {
    expect(panel).toContain("line.note !== undefined");
    expect(panel).toContain("costs-note");
  });
});
