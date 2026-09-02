// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';

/**
 * End-to-end render of the ACTUAL side-panel entrypoint (main.ts): it computes
 * the Deal Score via bundled @gil-bricks/core and paints the DOM. Proves the
 * panel really shows the web-matching score/verdict/headline — not just that
 * core can compute it. Uses happy-dom; no browser, no network.
 */
describe('side panel main.ts renders the shared Deal Score', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('paints 7.5 / marginal / the deal-specific headline into the panel', async () => {
    await import('../entrypoints/sidepanel/main.ts');
    const app = document.getElementById('app')!;
    const chip = app.querySelector('.deal-score')!;
    expect(chip).toBeTruthy();
    expect(chip.querySelector('.ds-score strong')?.textContent).toBe('7.5');
    expect(chip.querySelector('.ds-verdict')?.textContent).toBe('marginal');
    expect(chip.querySelector('.ds-headline')?.textContent).toBe(
      'Just 5.0% back on the cash you’d tie up, short of the 8.0% that makes the risk worth it.',
    );
    // the traffic-light class matches the verdict tier
    expect(chip.classList.contains('ds-marginal')).toBe(true);
    // binding note + full component list are rendered
    expect(app.querySelector('.binding-note')?.textContent).toMatch(/5\.0%/);
    expect(app.querySelectorAll('.component').length).toBe(4);
  });
});
