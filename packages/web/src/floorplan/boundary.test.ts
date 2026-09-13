/**
 * F1 — THE PROMISES THIS FEATURE RESTS ON, enforced rather than stated.
 *
 *  1. THE AGENT'S FLOORPLAN NEVER REACHES OUR SERVERS. It is their copyright.
 *     The browser displays it from THEIR server while the user draws, and that
 *     is the whole of what we are entitled to do with it.
 *  2. WHAT IS STORED, PRINTED AND SHARED IS OUR GEOMETRY. Points, walls, rooms,
 *     names, numbers. Never pixels, never their URL.
 *  3. THE MODULE IS REPLACEABLE WHOLESALE.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as door from './index';
import { initialState, tapTrace, beginScale, useKnownTotal, toSaved, fromSaved } from './plan';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const MODULE_DIR = join(SRC, 'floorplan');
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);
const MODULE_FILES = walk(MODULE_DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
const OUTSIDE_FILES = walk(SRC).filter((f) => /\.(ts|tsx|astro)$/.test(f) && !f.startsWith(MODULE_DIR) && !/\.test\./.test(f));
const rel = (f: string): string => f.replace(SRC, 'src/');
/** Code only. A comment NAMING an API it never calls must not read as a call. */
const code = (f: string): string => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** A room traced and sized, for the checks below. */
const sized = () => {
  let s = initialState({ sqm: 80, source: 'epc-register' });
  for (const p of [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 200 }, { x: 0, y: 200 }]) s = tapTrace(s, p);
  s = tapTrace(s, { x: 0, y: 0 });
  return useKnownTotal(beginScale(s), 'need');
};

describe('the floorplan image cannot reach our servers', () => {
  /** Every API by which a picture becomes BYTES WE HOLD. */
  const CAPTURE = ['getImageData', 'toDataURL', 'toBlob', 'drawImage', 'createImageBitmap',
    'OffscreenCanvas', 'captureStream', 'transferToImageBitmap'];

  it('the module never captures the plan\'s pixels by any means', () => {
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      const body = code(f);
      for (const api of CAPTURE) if (body.includes(api)) offenders.push(`${rel(f)}: ${api}`);
    }
    expect(offenders).toEqual([]);
  });

  it('and neither does the one component that mounts it', () => {
    const card = code(join(SRC, 'components/analyser/FloorPlanCard.tsx'));
    for (const api of CAPTURE) expect(card, api).not.toContain(api);
  });

  it('the module sends the image nowhere — and its only fetches are our own API', () => {
    for (const f of MODULE_FILES) {
      const body = code(f);
      for (const api of ['XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) {
        expect(body, `${rel(f)}: ${api}`).not.toContain(api);
      }
      // the module itself makes no network call at all
      expect(body, `${rel(f)} fetches`).not.toContain('fetch(');
    }
  });

  it('the mount only ever calls OUR OWN endpoint, never the portal', () => {
    const card = code(join(SRC, 'components/analyser/FloorPlanCard.tsx'));
    for (const m of card.matchAll(/fetch\(\s*`?([^,`)]*)/g)) {
      expect(m[1], 'fetch target').toMatch(/^(`?\/api\/|\/api\/)/);
    }
  });

  it('it will not even DISPLAY bytes we are holding — only a portal https URL', () => {
    for (const bad of ['blob:https://x/9f2a', 'data:image/png;base64,iVBOR', 'filesystem:https://x/a.png',
      'http://insecure.test/p.png', '', '  ']) {
      expect(door.isDisplayableImageUrl(bad), bad).toBe(false);
    }
    expect(door.isDisplayableImageUrl('https://media.rightmove.co.uk/p.jpeg')).toBe(true);
  });

  it('THE SERVER REFUSES anything image-shaped, so it cannot arrive by the back door', () => {
    const worker = readFileSync(join(SRC, 'worker/index.ts'), 'utf8');
    // the guard, and what it bans
    expect(worker).toContain('function looksLikeGeometry');
    expect(worker).toMatch(/data:\|blob:\|filesystem:\|base64/);
    expect(worker).toContain('MAX_PLAN_BYTES');
  });
});

describe('what is stored, printed and shared is geometry', () => {
  it('the saved shape holds points and names — no image, no URL', () => {
    const saved = toSaved(sized());
    const raw = JSON.stringify(saved);
    for (const shape of ['data:', 'blob:', 'base64', 'href', 'src', 'http', 'image']) {
      expect(raw.toLowerCase(), shape).not.toContain(shape);
    }
    expect(saved.levels[0].rooms[0].points.length).toBeGreaterThan(2);
  });

  it('and it round-trips: saved, reloaded, same areas — WITHOUT any backdrop', () => {
    const before = sized();
    const back = fromSaved(toSaved(before), { sqm: 80, source: 'epc-register' });
    expect(door.planFrom(back)?.totalSqm).toBe(door.planFrom(before)?.totalSqm);
    // nothing about an image was needed to do that
    expect(JSON.stringify(toSaved(before))).not.toContain('http');
  });

  it('the SHARE message carries our numbers and nothing of theirs', () => {
    const plan = door.planFrom(sized())!;
    const text = door.shareText(plan, '12 Test Street, CF24 4AA');
    expect(text).toContain('80.0');
    expect(text).toContain('12 Test Street');
    for (const shape of ['http', 'rightmove', 'zoopla', 'data:', 'blob:', '.jpeg', '.png']) {
      expect(text.toLowerCase(), shape).not.toContain(shape);
    }
  });

  it('the PRINT sheet is our outline and our labels — never their picture', () => {
    const sheet = door.printSheet(sized())!;
    expect(sheet.levels[0].rooms[0].points.length).toBeGreaterThan(2);
    const raw = JSON.stringify(sheet).toLowerCase();
    for (const shape of ['http', 'data:', 'blob:', 'base64', 'href', 'image']) {
      expect(raw, shape).not.toContain(shape);
    }
  });

  it('and the print markup contains no <img> at all', () => {
    const card = readFileSync(join(SRC, 'components/analyser/FloorPlanCard.tsx'), 'utf8');
    const printFn = card.slice(card.indexOf('function PrintSheet'));
    expect(printFn).not.toContain('<img');
    expect(printFn).not.toContain('<image');
    expect(printFn).toContain('<polygon');
  });
});

describe('the module is replaceable wholesale', () => {
  it('nothing outside it reaches inside it except through the door', () => {
    const offenders: string[] = [];
    for (const f of OUTSIDE_FILES) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([^']*floorplan[^']*)'/g)) {
        // the door is `.../floorplan`; anything deeper is reaching inside
        if (/floorplan\/./.test(m[1])) offenders.push(`${rel(f)} imports ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and it imports nothing from the rest of the web app', () => {
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1];
        // its own files, or the shared maths package every surface already has
        if (spec.startsWith('./') || spec === '@gil-bricks/core') continue;
        offenders.push(`${rel(f)} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every string lives in its own config, not in its code', () => {
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      if (f.endsWith('config.ts')) continue;
      for (const m of code(f).matchAll(/'([A-Z][a-z]+ [a-z]+[^']*)'/g)) offenders.push(`${rel(f)}: ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('its CSS is one file, entirely namespaced', () => {
    const css = readFileSync(join(SRC, 'styles/floorplan.css'), 'utf8');
    for (const m of css.matchAll(/^\.([a-z-]+)/gm)) {
      expect(m[1], `${m[1]} is not namespaced`).toMatch(/^(tp-|fp-|traceplan|floorplan)/);
    }
  });
});
