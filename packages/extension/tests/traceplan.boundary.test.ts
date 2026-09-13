/**
 * T1 — THE TWO PROMISES THIS FEATURE RESTS ON.
 *
 *  1. THE AGENT'S FLOORPLAN NEVER REACHES A SERVER. It is their copyright. The
 *     extension may put it on screen because the user's own browser already
 *     fetched it from the portal; that is the whole of what we are entitled to
 *     do with it.
 *
 *  2. THE MODULE IS REPLACEABLE WHOLESALE. Nothing outside src/traceplan/ may
 *     reach inside it, so its UI, maths, storage and words can all be thrown
 *     away and rewritten without touching another file.
 *
 * These are enforced rather than promised, because both are the kind of thing
 * that is true on the day it is written and quietly false a sprint later.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const EXT = resolve(process.cwd());
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);

const MODULE_DIR = join(EXT, 'src/traceplan');
const MODULE_FILES = walk(MODULE_DIR).filter((f) => /\.ts$/.test(f) && !/\.test\./.test(f));
const OUTSIDE_FILES = [...walk(join(EXT, 'src')), ...walk(join(EXT, 'entrypoints'))]
  .filter((f) => /\.ts$/.test(f) && !f.startsWith(MODULE_DIR) && !/\.test\./.test(f));
const rel = (f: string): string => f.replace(`${EXT}/`, '');
/** Code only. A comment NAMING an API it never calls must not read as a call. */
const code = (f: string): string => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the floorplan image cannot leave the browser', () => {
  /**
   * Every API by which a picture becomes BYTES WE HOLD. Holding none of them is
   * stronger than promising not to send them: there is nothing to send.
   */
  const WAYS_TO_CAPTURE_PIXELS = [
    'getImageData', 'toDataURL', 'toBlob', 'drawImage', 'createImageBitmap',
    'OffscreenCanvas', 'captureStream', 'transferToImageBitmap',
  ];

  it('the module never captures the plan\'s pixels by any means', () => {
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      const body = code(f);
      for (const api of WAYS_TO_CAPTURE_PIXELS) if (body.includes(api)) offenders.push(`${rel(f)}: ${api}`);
    }
    expect(offenders).toEqual([]);
  });

  it('and never sends anything anywhere — no fetch, no beacon, no socket, no worker', () => {
    const EGRESS = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource',
      'navigator.clipboard', 'chrome.runtime.sendMessage', 'postMessage('];
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      const body = code(f);
      for (const api of EGRESS) if (body.includes(api)) offenders.push(`${rel(f)}: ${api}`);
    }
    expect(offenders).toEqual([]);
  });

  it('it will not even DISPLAY bytes we are holding — only a portal https URL', async () => {
    const { isDisplayableImageUrl } = await import('../src/traceplan/index.ts');
    // The shapes that mean "these bytes are in our hands"
    for (const bad of [
      'blob:https://example.test/9f2a', 'data:image/png;base64,iVBORw0KGgo=',
      'filesystem:https://x/temporary/a.png', 'http://insecure.test/plan.png', '', '   ',
    ]) {
      expect(isDisplayableImageUrl(bad), bad).toBe(false);
    }
    expect(isDisplayableImageUrl('https://media.rightmove.co.uk/dir/plan_max_600x600.jpeg')).toBe(true);
  });

  it('the only thing that crosses the boundary is names and numbers', async () => {
    const { planFrom } = await import('../src/traceplan/index.ts');
    const t = await import('../src/traceplan/tracer.ts');
    let s = t.initialState({ sqm: 80, source: 'epc-register' });
    for (const p of [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 200 }, { x: 0, y: 200 }]) s = t.tapTrace(s, p);
    s = t.tapTrace(s, { x: 0, y: 0 });
    s = t.useKnownTotal(t.beginScale(s), 'need');
    const plan = planFrom(s);
    expect(plan).not.toBeNull();
    // EXACTLY these keys. A fifth is how an image or the vertices would ride out.
    expect(Object.keys(plan ?? {}).sort()).toEqual(['levels', 'rooms', 'sizedBy', 'totalSqm']);
    expect(Object.keys(plan!.rooms[0]).sort()).toEqual(['areaHighSqm', 'areaLowSqm', 'areaSqm', 'level', 'name']);
    for (const v of Object.values(plan!.rooms[0])) expect(['string', 'number']).toContain(typeof v);
    for (const lv of plan!.levels) expect(Object.keys(lv).sort()).toEqual(['areaSqm', 'name']);
    expect(typeof plan!.totalSqm).toBe('number');

    // and nothing that could carry pixels or reconstruct the drawing
    const serialised = JSON.stringify(plan).toLowerCase();
    for (const shape of ['data:', 'blob:', 'http', 'base64', 'href', 'src', 'image', 'points', 'vertices']) {
      expect(serialised, shape).not.toContain(shape);
    }
    // no raw coordinate pairs — the polygon must not be reconstructible
    expect(JSON.stringify(plan), 'an x key').not.toMatch(/"x"\s*:/);
    expect(JSON.stringify(plan), 'a y key').not.toMatch(/"y"\s*:/);
  });

  it('the traced VERTICES never leave — only the areas they imply', async () => {
    const { planFrom } = await import('../src/traceplan/index.ts');
    const t = await import('../src/traceplan/tracer.ts');
    let s = t.initialState({ sqm: 80, source: 'epc-register' });
    // a deliberately recognisable coordinate
    for (const p of [{ x: 1234, y: 0 }, { x: 1484, y: 0 }, { x: 1484, y: 200 }]) s = t.tapTrace(s, p);
    s = t.tapTrace(s, { x: 1234, y: 0 });
    s = t.useKnownTotal(t.beginScale(s), 'need');
    expect(JSON.stringify(planFrom(s))).not.toContain('1234');
  });

  it('the image URL itself is never put in the result', async () => {
    const { planFrom } = await import('../src/traceplan/index.ts');
    const t = await import('../src/traceplan/tracer.ts');
    let s = t.initialState({ sqm: 40, source: 'epc-register' });
    for (const p of [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]) s = t.tapTrace(s, p);
    s = t.tapTrace(s, { x: 0, y: 0 });
    s = t.useKnownTotal(t.beginScale(s), 'need');
    expect(JSON.stringify(planFrom(s))).not.toContain('rightmove');
  });
});

describe('the module is replaceable wholesale', () => {
  it('nothing outside it reaches inside it — only the one door', () => {
    const offenders: string[] = [];
    for (const f of OUTSIDE_FILES) {
      const body = readFileSync(f, 'utf8');
      // `from '.../traceplan'` is the door. `.../traceplan/anything` is not.
      for (const m of body.matchAll(/from\s+'([^']*traceplan[^']*)'/g)) {
        if (/traceplan\/.+/.test(m[1])) offenders.push(`${rel(f)} imports ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and it reaches out to nothing but its own files', () => {
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1];
        if (spec.startsWith('./') || spec.startsWith('../traceplan/')) continue;
        offenders.push(`${rel(f)} imports ${spec}`);
      }
    }
    // A module that imports nothing outside itself can be deleted in one go.
    expect(offenders).toEqual([]);
  });

  it('its public door exports only what the rest of the product may know', async () => {
    const mod = await import('../src/traceplan/index.ts');
    expect(Object.keys(mod).sort()).toEqual(['isDisplayableImageUrl', 'mountTraceplan', 'planFrom'].sort());
  });

  it('every one of its strings lives in its own config, not in its code', () => {
    // A sentence-shaped literal anywhere but config.ts means the words escaped.
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      if (f.endsWith('config.ts')) continue;
      const body = code(f);
      for (const m of body.matchAll(/'([A-Z][a-z]+ [a-z]+[^']*)'/g)) offenders.push(`${rel(f)}: ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('its CSS is namespaced, so deleting the block removes the whole design', () => {
    const css = readFileSync(join(EXT, 'entrypoints/sidepanel/style.css'), 'utf8');
    const block = css.slice(css.indexOf('/* ---------- T1: the room tracer'));
    expect(block.length).toBeGreaterThan(100);
    for (const m of block.matchAll(/^\.([a-z-]+)/gm)) {
      expect(m[1], `${m[1]} is not namespaced`).toMatch(/^(tp-|traceplan)/);
    }
  });
});
