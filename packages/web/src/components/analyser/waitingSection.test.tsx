/**
 * SAY WHY A SECTION IS NOT THERE (L2).
 *
 * An absent Verdict, Figures or Costs used to be simply hidden, and the chips
 * for them disappeared from the strip. That reads as a broken page — it was
 * read as one for two days. The page now says which field it is waiting for,
 * in that field's own words, and the chips stay and land on the explanation.
 *
 * Rendered, not grepped: the whole point is what appears on the page.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render } from 'preact-render-to-string';
import { strategies, missingForVerdict } from '@gil-bricks/core';
import { VerdictShell } from './VerdictShell';
import { VERDICT_COPY } from '../../config/verdicts';
import { features } from '../../config/features';

const shell = (config: typeof strategies[number], params: Record<string, string>): string =>
  render(
    <VerdictShell config={config} country={null} hasContingency={false} missing={missingForVerdict(config, params)}>
      <div id="body" />
    </VerdictShell>,
  );

beforeEach(() => { features.refurbSection = true; });

describe('a blank form is told what it is waiting for', () => {
  it.each(strategies.map((s) => [s.id, s] as const))('%s names the actual field, not a generic message', (_id, config) => {
    const html = shell(config, {});
    const missing = missingForVerdict(config, {});
    expect(missing.length, `${config.id} should need something`).toBeGreaterThan(0);
    // the FIELD'S OWN LABEL is on the page — so the sentence can never drift
    // from the config that decides which field is required
    for (const f of missing) {
      const lower = f.label.charAt(0).toLowerCase() + f.label.slice(1);
      expect(html, `${config.id} must name "${f.label}"`).toContain(lower);
    }
    expect(html).toContain('waiting-for');
  });

  it.each(strategies.map((s) => [s.id, s] as const))('%s keeps the anchors, so no chip vanishes', (_id, config) => {
    const html = shell(config, {});
    for (const id of ['sec-verdict', ...VERDICT_COPY.waitingAnchors]) {
      expect(html, `${config.id} must still anchor ${id}`).toContain(`id="${id}"`);
    }
  });

  it.each(strategies.map((s) => [s.id, s] as const))('%s says nothing once the fields are filled', (_id, config) => {
    const params = Object.fromEntries(config.requiredForVerdict.map((k) => [k, '900']));
    expect(shell(config, params)).not.toContain('waiting-for');
  });

  it('names only what is still missing, not everything it ever wanted', () => {
    const brrrr = strategies.find((s) => s.id === 'brrrr')!;
    expect(brrrr.requiredForVerdict.length).toBeGreaterThan(1);
    // one of the two supplied: the line must drop it and keep the other
    const [first, second] = brrrr.requiredForVerdict;
    const html = shell(brrrr, { [first]: '140000' });
    const all = [...brrrr.strategyInputs, ...brrrr.assumptions];
    const stillWanted = all.find((f) => f.key === second)!;
    const dropped = all.find((f) => f.key === first)!;
    expect(html).toContain(stillWanted.label.charAt(0).toLowerCase() + stillWanted.label.slice(1));
    expect(html).not.toContain(dropped.label.charAt(0).toLowerCase() + dropped.label.slice(1));
  });

  it('and the four say it in the same shape — one line, one place', () => {
    const shapes = strategies.map((c) => {
      const html = shell(c, {});
      return (html.match(/class="hint waiting-for" id="sec-verdict"/g) ?? []).length;
    });
    expect(shapes).toEqual([1, 1, 1, 1]);
  });
});
