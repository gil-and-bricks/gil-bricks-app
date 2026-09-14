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
    const all = [...m.headline, ...m.costs, ...m.returns];
    expect(all.length).toBeGreaterThan(4);
    for (const f of all) {
      expect(f.basis, f.label).not.toBe('');
      // The basis page lists every one of them, so each must be on the page.
      expect(out, f.label).toContain(f.basis);
    }
  });
});
