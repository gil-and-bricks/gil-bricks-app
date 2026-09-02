/**
 * Side-panel UI (E4 scaffold). Imports @gil-bricks/core and renders a real Deal
 * Score chip + deal-specific headline from the hardcoded sample inputs. This
 * proves the shared library + E2.1 copy templates run inside the extension and
 * produce the same numbers the web app does. No extractor yet.
 */
import { scoreDeal, type DealScore } from '@gil-bricks/core';
import { SAMPLE_STRATEGY, SAMPLE_INPUTS, SAMPLE_LABEL } from '../../src/sample';

const LIGHT: Record<DealScore['verdict'], string> = {
  good: 'ds-good',
  marginal: 'ds-marginal',
  'walk away': 'ds-walk',
};
const PILL: Record<string, string> = { green: 'st-green', amber: 'st-amber', red: 'st-red', unknown: 'st-unknown' };

function e(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function render(deal: DealScore): void {
  const app = document.getElementById('app')!;
  app.textContent = '';

  const card = e('section', 'glass card');
  card.append(e('p', 'eyebrow', 'Deal Score'));

  // Verdict chip: score + traffic light + verdict word + deal-specific headline.
  const chip = e('div', `deal-score ${LIGHT[deal.verdict]}`);
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', `Deal score ${deal.score.toFixed(1)} out of 10 — ${deal.verdict}. ${deal.headline}`);
  const score = e('span', 'ds-score');
  score.append(e('strong', undefined, deal.score.toFixed(1)), e('span', 'ds-outof', '/10'));
  const dot = e('span', 'ds-light', '●');
  dot.setAttribute('aria-hidden', 'true');
  chip.append(score, dot, e('span', 'ds-verdict', deal.verdict), e('span', 'ds-headline', deal.headline));
  card.append(chip);

  // The single binding constraint (what's holding it back), when present.
  if (deal.bindingConstraint) {
    const note = e('p', 'binding-note');
    note.append(e('span', 'binding-label', 'What’s holding it back: '));
    note.append(document.createTextNode(deal.bindingConstraint.plainExplanation));
    card.append(note);
  }

  // Component breakdown — shows the shared scoring is really running.
  const ul = e('ul', 'components');
  for (const c of deal.components) {
    const li = e('li', 'component');
    li.append(e('span', 'c-name', c.name));
    li.append(e('span', `c-status ${PILL[c.status] ?? 'st-unknown'}`, c.status));
    li.append(e('span', 'c-points', `${c.points.toFixed(2)} / ${c.max.toFixed(1)}`));
    ul.append(li);
  }
  card.append(ul);

  card.append(e('p', 'sample-note', `${SAMPLE_LABEL} — a built-in example. The live extractor arrives in a later sprint.`));
  app.append(card);
}

try {
  render(scoreDeal(SAMPLE_STRATEGY, SAMPLE_INPUTS));
} catch (err) {
  const app = document.getElementById('app')!;
  app.textContent = '';
  app.append(e('section', 'glass card', `Couldn’t render the Deal Score: ${(err as Error).message}`));
  console.error('[gil&bricks] render failed', err);
}
