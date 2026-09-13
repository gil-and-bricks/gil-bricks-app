/**
 * R3 — THE PHOTOS NEVER REACH OUR SERVERS, proven the way F1 proved it.
 *
 * They are the agent's copyright. The browser renders them from the PORTAL'S
 * own server, addressed by a URL the handoff carried; we hold no bytes, so
 * there is nothing to send.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { isDisplayablePhotoUrl, photosFromParam } from './index';
import { REFURB_PHOTOS } from '../config/refurb';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const MODULE_DIR = join(SRC, 'refurbcues');
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);
const MODULE_FILES = walk(MODULE_DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
const rel = (f: string): string => f.replace(SRC, 'src/');
const code = (f: string): string => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the listing photos cannot reach our servers', () => {
  const CAPTURE = ['getImageData', 'toDataURL', 'toBlob', 'drawImage', 'createImageBitmap',
    'OffscreenCanvas', 'captureStream', 'transferToImageBitmap'];

  it('the module never captures a photo\'s pixels by any means', () => {
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      const body = code(f);
      for (const api of CAPTURE) if (body.includes(api)) offenders.push(`${rel(f)}: ${api}`);
    }
    expect(offenders).toEqual([]);
  });

  it('and makes no network call of its own at all', () => {
    for (const f of MODULE_FILES) {
      const body = code(f);
      for (const api of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) {
        expect(body, `${rel(f)}: ${api}`).not.toContain(api);
      }
    }
  });

  it('the section that hosts it only ever calls OUR OWN endpoint', () => {
    const host = code(join(SRC, 'components/analyser/RefurbSection.tsx'));
    for (const m of host.matchAll(/fetch\(\s*'([^']*)'/g)) {
      expect(m[1], 'fetch target').toMatch(/^\/api\//);
    }
  });

  it('it will not display bytes we are holding — only a portal https URL', () => {
    for (const bad of ['blob:https://x/9f2a', 'data:image/png;base64,iVBOR', 'filesystem:https://x/a.png',
      'http://insecure.test/p.jpg', '', '   ']) {
      expect(isDisplayablePhotoUrl(bad), bad).toBe(false);
    }
    expect(isDisplayablePhotoUrl('https://media.rightmove.co.uk/p.jpeg')).toBe(true);
  });

  it('and the handoff param is filtered on the way in', () => {
    const raw = 'https://media.rightmove.co.uk/a.jpeg data:image/png;base64,AAA blob:https://x/1 https://lid.zoocdn.com/u/480/360/b.jpg';
    expect(photosFromParam(raw)).toEqual([
      'https://media.rightmove.co.uk/a.jpeg',
      'https://lid.zoocdn.com/u/480/360/b.jpg',
    ]);
    expect(photosFromParam(null)).toEqual([]);
  });

  it('THE SERVER stores cue KEYS only — never a URL, never bytes', () => {
    const worker = readFileSync(join(SRC, 'worker/index.ts'), 'utf8');
    const fn = worker.slice(worker.indexOf('async function handlePostCuesSeen'));
    // a key is a short slug; anything URL-shaped fails the pattern outright
    expect(fn).toMatch(/\^\[a-z0-9\]\[a-z0-9-\]\{0,63\}\$/);
    expect(fn).toContain('MAX_CUE_KEYS');
  });

  it('the photo element asks the browser not to leak a referrer either', () => {
    const carousel = readFileSync(join(MODULE_DIR, 'carousel.tsx'), 'utf8');
    expect(carousel).toContain('referrerPolicy="no-referrer"');
  });
});

describe('the module is replaceable wholesale', () => {
  it('it imports nothing from the rest of the web app but its own config', () => {
    const offenders: string[] = [];
    for (const f of MODULE_FILES) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1];
        if (spec.startsWith('./') || spec === 'preact/hooks' || spec === '../config/refurb') continue;
        offenders.push(`${rel(f)} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('nothing outside reaches inside it — only the door', () => {
    const outside = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith(MODULE_DIR) && !/\.test\./.test(f));
    const offenders: string[] = [];
    for (const f of outside) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([^']*refurbcues[^']*)'/g)) {
        if (/refurbcues\/./.test(m[1])) offenders.push(`${rel(f)} imports ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('its CSS is namespaced, so deleting the block removes the design', () => {
    const css = readFileSync(join(SRC, 'styles/analyser.css'), 'utf8');
    const block = css.slice(css.indexOf('/* ---------- R3: the listing photo carousel'));
    expect(block.length).toBeGreaterThan(100);
    for (const m of block.matchAll(/^\.([a-z-]+)/gm)) expect(m[1], m[1]).toMatch(/^rc-|^rc$/);
  });
});

describe('the honesty position is on the page, once', () => {
  it('says photos are wide-angle, staged, chosen and sometimes old — and not a survey', () => {
    const said = REFURB_PHOTOS.caveat.toLowerCase();
    for (const word of ['wide-angle', 'staged', 'chosen', 'old', 'not a survey']) {
      expect(said, word).toContain(word);
    }
  });

  it('and the carousel renders it, not a tooltip', () => {
    const carousel = readFileSync(join(MODULE_DIR, 'carousel.tsx'), 'utf8');
    expect(carousel).toContain('{P.caveat}');
  });
});
