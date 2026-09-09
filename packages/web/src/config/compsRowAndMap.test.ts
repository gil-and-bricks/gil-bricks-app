import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COPY } from './copy';
import { COMPARABLES } from './comparables';

/**
 * The comparables row and the map (C3), pinned.
 *
 * All four came from the operator using the list and the map properly: buttons
 * that landed somewhere different on every row, buttons that did not look
 * pressable until hovered — which on a phone is never — a map that vanished
 * when he zoomed, and zoom controls he could not see.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string): string => readFileSync(`${src}${p}`, 'utf8');
const css = read('styles/analyser.css');
const mod = read('components/analyser/CompsModule.tsx');
const compMap = read('components/analyser/CompMap.tsx');
const mapImpl = read('components/analyser/mapImpl.ts');
const style = read('lib/map/style.ts');
const headers = readFileSync(fileURLToPath(new URL('../../public/_headers', import.meta.url)), 'utf8');

/** Prose that explains a rule must be free to quote the thing it forbids. */
const strip = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('1. the row actions line up down the whole list', () => {
  it('they are a table column, so their left edge cannot depend on an address', () => {
    const head = mod.slice(mod.indexOf('<thead>'), mod.indexOf('</thead>'));
    expect(head, 'a heading cell of its own').toContain('<th class="comp-links-col">{COMPARABLES.table.actions}</th>');
    const body = mod.slice(mod.indexOf('<tbody>'), mod.indexOf('</tbody>'));
    expect(body).toContain('<td class="comp-links-col"><CompActions c={c} /></td>');
  });

  it('the column sits straight after the address, NOT at the far right', () => {
    // C1's Links column was last, and the table is wider than its wrapper, so
    // it was scrolled off the card at every width. Order is the whole fix.
    const head = mod.slice(mod.indexOf('<thead>'), mod.indexOf('</thead>'));
    const at = (needle: string) => head.indexOf(needle);
    expect(at('COMPARABLES.table.actions')).toBeGreaterThan(at('COMPARABLES.table.address'));
    expect(at('COMPARABLES.table.actions')).toBeLessThan(at('COMPARABLES.table.postcode'));
    expect(at('COMPARABLES.table.actions'), 'never the last column').toBeLessThan(at('COMPARABLES.table.miles'));
  });

  it('the column shrinks to its buttons and never wraps them into a stack', () => {
    expect(css).toMatch(/\.comps-table \.comp-links-col \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.comps-table \.comp-actions \{[^}]*flex-wrap: nowrap/);
    // A four-deep stack is what took a row from 31px to 161px in C1.
    expect(css).not.toMatch(/\.comps-table \.comp-actions \{[^}]*flex-wrap: wrap/);
  });

  it('the address cell no longer carries them, so it sizes to addresses', () => {
    const at = mod.indexOf('<td class="comp-address-cell">');
    const cell = mod.slice(at, mod.indexOf('</td>', at));
    expect(cell).not.toContain('CompActions');
  });

  it('the phone still gets them at the foot of the card, full-width', () => {
    const cards = mod.slice(mod.indexOf('comp-cards'), mod.indexOf('table-wrap'));
    expect(cards, 'the card keeps its own copy').toContain('<CompActions c={c} />');
    expect(css).toMatch(/\.comp-actions a \{ min-height: 2\.75rem/);
  });
});

describe('2. the actions look pressable BEFORE you touch them', () => {
  const rest = css.slice(css.indexOf('.comp-actions a {'), css.indexOf('.comp-actions a:hover'));

  it('they carry a fill and a boundary at rest, not only on hover', () => {
    expect(rest, 'a fill, so it reads as a control').toContain('background: rgba(255, 255, 255, 0.08)');
    expect(rest, 'a boundary that clears the 3:1 non-text minimum')
      .toContain('border: 1px solid rgba(255, 255, 255, 0.55)');
    // 0.4 white was the old value and it is the thing that failed.
    expect(rest).not.toContain('rgba(255, 255, 255, 0.4)');
  });

  it('the boundary is the SAME reasoning C1 applied to the list/map toggle', () => {
    const toggle = css.slice(css.indexOf('.view-toggle .pill:not(.pill-current)'), css.indexOf('.view-toggle .pill:not(.pill-current):active'));
    expect(toggle).toContain('rgba(255, 255, 255, 0.55)');
  });

  it('hover and focus still say lime, and a press still answers', () => {
    expect(css).toMatch(/\.comp-actions a:hover, \.comp-actions a:focus-visible \{[^}]*border-color: var\(--accent\)/);
    expect(css).toMatch(/\.comp-actions a:active \{[^}]*background: rgba\(255, 255, 255, 0\.2\)/);
  });
});

describe('3. the map says what it is doing, and stops disappearing', () => {
  it('it says it is loading rather than showing an empty box', () => {
    expect(compMap).toContain("const loading = status === 'loading';");
    expect(compMap).toContain('{loading && (');
    expect(compMap).toContain('{COPY.comps.mapLoading}');
    expect(compMap, 'and a screen reader hears it').toContain('role="status"');
    expect(COPY.comps.mapLoading).toBe('Loading the map…');
  });

  it('a map that dies AFTER it painted is not left silent', () => {
    // The old code logged the error and returned, so the fallback never showed:
    // healthy was already true and nothing else ever asked the question.
    expect(mapImpl).toContain('basemapGone');
    expect(mapImpl).toMatch(/if \(healthy && deathCheck === null\)/);
    expect(mapImpl).toContain("opts.onBlank?.('basemap-stopped-loading')");
    expect(compMap, 'and the retry says it is trying').toContain("setStatus('loading'); //");
  });

  it('the archive uses the cache that lets go of a failure', () => {
    expect(mapImpl).toContain('new PMTiles(tilesHttpUrl(), new HealingPmtilesCache())');
  });

  it('the watchdog is longer than a real phone takes to paint', () => {
    // 12s fired on a map that was merely slow — measured 12.1s on 4G — and the
    // remount it triggered started the whole wait again.
    const at = mapImpl.indexOf('const watchdog = setTimeout');
    expect(mapImpl.slice(at, at + 160)).toContain('20000');
  });

  it('the death check is cleared when the map is torn down', () => {
    expect(mapImpl).toContain('if (deathCheck !== null) clearTimeout(deathCheck);');
  });
});

describe('3b. the first load carries less', () => {
  it('the italic glyph stack is folded away — 80KB the map used to wait for', () => {
    expect(style).toContain('foldItalicLabels');
    expect(style).toContain("layers: foldItalicLabels(");
  });

  it('the stylesheet and the first glyph range start with the map, not after it', () => {
    expect(compMap, 'warmed by the LIGHT half, before the 270KB import').toContain('warmMapAssets();');
    const at = compMap.indexOf('warmMapAssets();');
    expect(compMap.indexOf("import('./mapImpl')"), 'and warmed FIRST').toBeGreaterThan(at);
  });

  it('hashed and versioned assets are cached instead of revalidated every visit', () => {
    expect(headers).toContain('/_astro/*');
    expect(headers).toContain('max-age=31536000, immutable');
    expect(headers).toContain('/map/sprites/v4/*');
    // maplibre's worker sits at a stable path and must match the bundle beside
    // it, so it is deliberately NOT cached long.
    const rules = headers.replace(/^#.*$/gm, '');
    expect(rules, 'never the vendor folder').not.toContain('/map/vendor');
  });
});

/** a/b/c per the selectors spec: ids, then classes/attrs/pseudo-classes, then
 *  elements and pseudo-elements. Enough for the flat selectors in play here. */
function specificity(sel: string): [number, number, number] {
  const t = sel.trim();
  const a = (t.match(/#[\w-]+/g) ?? []).length;
  const b = (t.match(/\.[\w-]+|\[[^\]]+\]|(?<!:):[\w-]+(?!:)/g) ?? []).length;
  const c = (t.match(/(^|[\s>+~])([a-z][\w-]*)/g) ?? []).length + (t.match(/::[\w-]+/g) ?? []).length;
  return [a, b, c];
}
const beats = (x: [number, number, number], y: [number, number, number]): boolean =>
  x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];

describe('4. the map controls are visible', () => {
  it('the zoom glyphs are masked and painted from the token, not left #333', () => {
    const shared = css.slice(css.indexOf('.comp-map .maplibregl-ctrl button .maplibregl-ctrl-icon {'), css.indexOf('.comp-map .maplibregl-ctrl button.maplibregl-ctrl-zoom-in'));
    expect(shared).toContain('background-color: var(--accent)');
    expect(css).toMatch(/zoom-in \.maplibregl-ctrl-icon \{\s*background-image: none;/);
    expect(css).toMatch(/zoom-out \.maplibregl-ctrl-icon \{\s*background-image: none;/);
    expect(css).toContain('mask-image: url("data:image/svg+xml');
    expect(strip(css), 'ours, drawn here — no icon library, no CDN').not.toMatch(/cdn|unpkg|jsdelivr|fontawesome/i);
  });

  it('and our rule OUTRANKS maplibre’s, which is appended after ours at map mount', () => {
    // The first attempt at this tied on specificity (0,3,1 vs 0,3,1) and lost on
    // source order: the lime painted, maplibre's #333 glyph painted over it, the
    // mask clipped both to the same shape, and the control measured 1.53:1 —
    // exactly as invisible as before, with every source-text assertion green.
    // From node_modules, NOT public/map/vendor: that copy is made by
    // scripts/copy-map-worker.mjs at build time and is gitignored, so reading it
    // passes on a machine that has built and fails in CI, which is what it did.
    const vendor = readFileSync(fileURLToPath(new URL('../../../../node_modules/maplibre-gl/dist/maplibre-gl.css', import.meta.url)), 'utf8');
    const theirs = vendor
      .split('}')
      .find((r) => r.includes('maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon') && r.includes('%23333'));
    expect(theirs, 'maplibre still ships a #333 zoom glyph — if not, revisit this').toBeTruthy();
    const theirSelector = String(theirs).split('{')[0].split(',').pop() as string;
    expect(theirSelector.trim()).toBe('.maplibregl-ctrl button.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon');

    for (const ours of [
      '.comp-map .maplibregl-ctrl button.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon',
      '.comp-map .maplibregl-ctrl button.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon',
    ]) {
      expect(css, `${ours} must exist`).toContain(`${ours} {`);
      expect(
        beats(specificity(ours), specificity(theirSelector)),
        `${ours} (${specificity(ours)}) must outrank ${theirSelector.trim()} (${specificity(theirSelector)})`,
      ).toBe(true);
    }
  });

  it('the specificity helper is NOT vacuous', () => {
    expect(specificity('.a .b button.c .d')).toEqual([0, 4, 1]);
    expect(specificity('.maplibregl-ctrl button.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon')).toEqual([0, 3, 1]);
    expect(beats([0, 4, 1], [0, 3, 1])).toBe(true);
    expect(beats([0, 3, 1], [0, 3, 1]), 'a tie is NOT a win — that was the bug').toBe(false);
  });

  it('the Reset label is lime, not the near-black it inherited from a white group', () => {
    expect(css).toMatch(/\.map-reset-btn \{[^}]*color: var\(--accent\)/);
    expect(css).not.toMatch(/\.map-reset-btn \{[^}]*color: var\(--accent-ink\)/);
  });

  it('the divider between the stacked buttons is not maplibre’s bright #ddd', () => {
    expect(css).toMatch(/\.comp-map \.maplibregl-ctrl-group button \+ button \{[^}]*rgba\(255, 255, 255, 0\.18\)/);
  });

  it('the colour comes from the token — no brand hex retyped into a data URI', () => {
    // This slice ran BACKWARDS at first (the end marker is 750 lines EARLIER in
    // the file), so it asserted against an empty string and could never fail.
    const from = css.indexOf('The zoom controls you can actually see');
    const to = css.indexOf('.comp-map .maplibregl-ctrl-attrib', from);
    expect(from, 'the block is still there').toBeGreaterThan(-1);
    expect(to, 'and the end marker comes AFTER it').toBeGreaterThan(from);
    const icons = css.slice(from, to);
    expect(icons.length).toBeGreaterThan(500);
    expect(icons.toLowerCase()).not.toContain('dcff00');
    // percent-encoded is the same hex wearing a hat
    expect(icons.toLowerCase()).not.toContain('%23dcff00');
    expect(icons, 'the accent still comes from the token').toContain('var(--accent)');
  });
});

describe('nothing here invented a word that config does not own', () => {
  it('every label the row and the map show still comes from config', () => {
    expect(COMPARABLES.table.actions).toBe('Links');
    for (const s of [COPY.comps.mapLoading, COPY.comps.mapBroken, COPY.comps.mapRetry]) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });
});
