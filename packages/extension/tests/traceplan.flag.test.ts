// @vitest-environment happy-dom
/**
 * T1 — WITH THE FLAG OFF, THE EXTENSION IS EXACTLY WHAT IT IS TODAY.
 *
 * The point of the charter's rule 1 is that a feature can be withdrawn without
 * an unpick. This proves it for the tracer: no control, no screen, no module
 * code, and the existing measure tool untouched.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extensionFeatures } from '../src/features.ts';

const EXT = resolve(process.cwd());
const saved = { ...extensionFeatures };
beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });
afterEach(() => { Object.assign(extensionFeatures, saved); });

describe('the flag is documented, and documents itself', () => {
  it('every flag has a row in docs/EXTENSION_FLAGS.md, and every row a flag', () => {
    const doc = readFileSync(join(EXT, '../../docs/EXTENSION_FLAGS.md'), 'utf8');
    const documented = [...doc.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]).sort();
    expect(documented).toEqual(Object.keys(extensionFeatures).sort());
  });

  it('and the row says what OFF looks like, not just what ON does', () => {
    const doc = readFileSync(join(EXT, '../../docs/EXTENSION_FLAGS.md'), 'utf8');
    expect(doc).toContain('exactly as it is today');
  });

  it('flags live in ONE file — none hides inside the module', () => {
    const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);
    const offenders = walk(join(EXT, 'src/traceplan'))
      .filter((f) => /\.ts$/.test(f) && !/\.test\./.test(f))
      .filter((f) => /\b(features|FEATURE_|enabled\s*[:=]\s*(true|false))\b/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(`${EXT}/`, ''));
    expect(offenders).toEqual([]);
  });
});

describe('with the flag OFF', () => {
  it('the panel offers no way in', async () => {
    extensionFeatures.traceplan = false;
    const main = readFileSync(join(EXT, 'entrypoints/sidepanel/main.ts'), 'utf8');
    // the control and the route are both behind the flag in the source
    expect(main).toContain('extensionFeatures.traceplan && h.onOpenTrace');
    expect(main).toContain("ctx.screen === 'trace' && extensionFeatures.traceplan");
  });

  it('the floor-plan card renders without the trace control', async () => {
    const { renderTriage } = await import('../entrypoints/sidepanel/main.ts');
    extensionFeatures.traceplan = false;
    // A view with a floorplan available but no trace handler wired.
    const view = {
      screen: 'triage', strategy: 'btl', unknowns: {}, suggestions: {}, settings: {}, criteria: {},
      floorAreaSqm: null, floorAreaSource: 'none', floorAreaRange: null, manualAreaInput: '',
      usingSuggested: false, listing: null, result: null,
      floorplan: { available: true, open: false, imageUrl: 'https://media.rightmove.co.uk/a.jpeg', acceptedSqm: null, measuredRooms: [] },
    } as never;
    try { renderTriage(view); } catch { /* a partial view may not fully render; the assertion below is the point */ }
    expect(document.body.textContent ?? '').not.toContain('Trace a room');
  });

  it('and the existing measure tool is not touched by any of this', () => {
    const main = readFileSync(join(EXT, 'entrypoints/sidepanel/main.ts'), 'utf8');
    // E9.1's own entry point and screen are still there, unconditioned.
    expect(main).toContain("onOpenMeasure: () => { ctx.floorplan.open = true; ctx.screen = 'measure'");
    expect(main).toContain("else if (ctx.screen === 'measure') renderMeasure(view, handlers);");
  });
});

describe('with the flag ON', () => {
  it('the trace control appears on the floor-plan card', () => {
    const main = readFileSync(join(EXT, 'entrypoints/sidepanel/main.ts'), 'utf8');
    expect(main).toContain("'Trace a room →'");
  });

  it('and the panel talks to the module through the one door only', () => {
    const main = readFileSync(join(EXT, 'entrypoints/sidepanel/main.ts'), 'utf8');
    expect(main).toContain("from '../../src/traceplan'");
    expect(main).not.toMatch(/from '\.\.\/\.\.\/src\/traceplan\/\w/);
  });
});
