// @vitest-environment happy-dom
/**
 * DP1 — NO DEAL SCORE AND NO VERDICT REACHES A RENDERED PACK.
 *
 * THE RULE THIS HOLDS. The Deal Score is our opinion of somebody's deal,
 * calibrated to THEIR stated minimums. Printed in a document sent to a third
 * party it becomes an endorsement of the deal to a person whose criteria we
 * have never seen, carrying our name. It never goes in. Nor does the verdict
 * sentence, the binding constraint or the lever, for the same reason.
 *
 * HOW IT IS CHECKED, and why this shape rather than reading the model. The
 * analyser's OWN verdict for this exact deal is computed here, from the same
 * parameters, and then looked for in the rendered pack. If the pack ever
 * carried it — by a new field, a spread, or somebody adding a line — the string
 * would be there and this fails. Reading the model instead would only prove the
 * model has no such key, which is the thing that is easy to change by accident.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { NEVER_IN_A_PACK } from '@gil-bricks/core';
import { scoreFromParams } from '../../lib/deals/scoreFromParams';
import { PACK_COPY } from '../../config/pack';
import { PackDocument } from './PackDocument';
import { BRRRR_PARAMS, packModel } from '../../fixtures/packModel';

/** What the analyser says about this deal. None of it may reach the pack. */
const opinion = scoreFromParams('brrrr', BRRRR_PARAMS);
const html = (): string => render(<PackDocument model={packModel()} />);

describe('the analyser has an opinion about this deal', () => {
  it('really does produce a score and a verdict for these parameters', () => {
    // Without this the rest of the file could pass on an empty verdict.
    expect(opinion.score).toBeGreaterThanOrEqual(0);
    expect(opinion.score).toBeLessThanOrEqual(10);
    expect(opinion.verdict.length).toBeGreaterThan(10);
    expect(opinion.figure.length).toBeGreaterThan(3);
  });
});

describe('and the pack prints none of it', () => {
  it('never prints the verdict sentence', () => {
    expect(html()).not.toContain(opinion.verdict);
  });

  it('never prints the board headline the score produced', () => {
    expect(html()).not.toContain(opinion.figure);
  });

  it('never prints the score, in any of the shapes it is written in', () => {
    const out = html();
    for (const shape of [`${opinion.score}/10`, `${opinion.score} out of 10`, 'Deal score', 'Deal Score']) {
      expect(out, shape).not.toContain(shape);
    }
  });

  it('never carries a banned key, whatever is put in the model', () => {
    // The model is walked as data: a field smuggled in under one of these names
    // fails here even if nothing renders it today.
    const seen = JSON.stringify(packModel());
    for (const key of NEVER_IN_A_PACK) expect(seen, key).not.toContain(`"${key}"`);
  });

  it('prints every figure it does show with a basis under it', () => {
    const m = packModel();
    const out = html();
    const all = [m.hero, ...m.strip, ...m.costs, ...m.returns].filter((f) => f !== null);
    expect(all.length).toBeGreaterThan(4);
    for (const f of all) {
      expect(f.basis, f.label).not.toBe('');
      // The basis page lists every one of them, so each must be on the page.
      expect(out, f.label).toContain(f.basis);
    }
  });
});

/**
 * DP2 — THE COST CHART MAY NOT IMPLY ARITHMETIC THAT DOES NOT HOLD.
 *
 * Caught by looking at the printed page, not by a test: the waterfall stacked
 * £120,000 + £6,000 + £35,000 + £1,500 and labelled the result £78,890, because
 * a BRRRR's purchase is mostly borrowed. A chart that asserts a false sum is
 * worse than the table it replaced.
 */
describe('the cost chart only claims the parts add up when they do', () => {
  it('this fixture is a financed deal, so the parts do NOT sum', () => {
    // Guards the test itself: if the fixture ever became a cash purchase, the
    // assertions below would pass for the wrong reason.
    const m = packModel();
    const parts = m.waterfall.slice(0, -1).reduce((sum, s) => sum + s.value, 0);
    const total = m.waterfall[m.waterfall.length - 1]?.value ?? 0;
    expect(parts).toBeGreaterThan(total);
    expect(m.waterfallStacks).toBe(false);
  });

  it('says so in words on the page, rather than drawing a stack anyway', () => {
    const out = render(<PackDocument model={packModel()} />);
    expect(out).toContain('do not add up to the total');
    expect(out).not.toContain(PACK_COPY.numbers.chartNote);
  });

  it('would stack, and say so, when the figures genuinely do sum', () => {
    const cash = packModel({
      waterfallStacks: true,
      waterfall: [
        { label: 'Purchase price', value: 150000, display: '£150,000', kind: 'base' },
        { label: 'Stamp duty', value: 7500, display: '£7,500', kind: 'add' },
        { label: 'Total going in', value: 157500, display: '£157,500', kind: 'total' },
      ],
    });
    const out = render(<PackDocument model={cash} />);
    expect(out).toContain(PACK_COPY.numbers.chartNote);
    expect(out).not.toContain('do not add up to the total');
  });
});

/**
 * DP2 — the property the pack is ABOUT must appear in its own comparison.
 *
 * Found on the printed page: on a cheap purchase the subject sorted below eight
 * dearer sales and the list's own cap dropped it, so the page showed eight
 * homes and nothing to compare them with.
 */
describe('the subject property is never cut from the comparables', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    address: `${i} Dearer Street`, value: 900000 - i * 1000,
    display: `£${900 - i}k`, note: 'T', subject: false,
  }));
  const withSubject = [...many, { address: 'This one', value: 120000, display: '£120,000', note: '', subject: true }];

  it('keeps it even when it is the cheapest of thirteen', () => {
    const out = render(<PackDocument model={packModel({ comps: withSubject })} />);
    expect(out).toContain('This one');
  });

  it('and still shows eight rows, not nine', () => {
    const box = document.createElement('div');
    box.innerHTML = render(<PackDocument model={packModel({ comps: withSubject })} />);
    expect(box.querySelectorAll('.pk-comps li')).toHaveLength(8);
  });
});

/**
 * DP2 — the comparables page holds the map OR a long list, not both.
 */
describe('the list makes room for the map', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    address: `${i} Road`, value: 900000 - i * 1000, display: `£${900 - i}k`, note: 'T', subject: false,
  }));
  const withSubject = [...rows, { address: 'This one', value: 1000, display: '£1,000', note: '', subject: true }];
  const count = (m: Parameters<typeof PackDocument>[0]['model']): number => {
    const box = document.createElement('div');
    box.innerHTML = render(<PackDocument model={m} />);
    return box.querySelectorAll('.pk-comps li').length;
  };

  it('shows eight rows with no map', () => {
    expect(count(packModel({ comps: withSubject, mapImage: null }))).toBe(8);
  });

  it('and six when a map is on the same sheet', () => {
    expect(count(packModel({ comps: withSubject, mapImage: 'data:image/png;base64,iVBORw0KGgo=' }))).toBe(6);
  });

  it('keeps the subject in both — it is the thing being compared', () => {
    for (const map of [null, 'data:image/png;base64,iVBORw0KGgo=']) {
      const out = render(<PackDocument model={packModel({ comps: withSubject, mapImage: map })} />);
      expect(out, String(map)).toContain('This one');
    }
  });
});
