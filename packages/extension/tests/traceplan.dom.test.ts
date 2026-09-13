// @vitest-environment happy-dom
/**
 * T1 — THE SURFACE, DRIVEN. Real pointer events through the real mount, so the
 * wiring between the state machine and the SVG is proved rather than assumed.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mountTraceplan } from '../src/traceplan/index.ts';
import { TRACEPLAN_TOLERANCES as T } from '../src/traceplan/config.ts';

const PLAN = 'https://media.rightmove.co.uk/dir/plan_max_600x600.jpeg';

/** happy-dom has no PointerEvent; the module only reads these fields. */
const pointer = (type: string, id: number, x: number, y: number): Event => {
  const e = new Event(type, { bubbles: true }) as Event & Record<string, unknown>;
  e.pointerId = id; e.clientX = x; e.clientY = y; e.pointerType = 'touch';
  return e;
};

let host: HTMLElement;
let svg: SVGSVGElement;
const mount = (): (() => void) => {
  host = document.createElement('div');
  document.body.append(host);
  const teardown = mountTraceplan({
    container: host, imageUrl: PLAN, known: { sqm: 80, source: 'epc-register' },
    onPlan: () => {}, onClose: () => {},
  });
  svg = host.querySelector('svg') as SVGSVGElement;
  // happy-dom gives zero-size boxes; the module falls back, but pin it anyway.
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 480, right: 360, bottom: 480, x: 0, y: 0, toJSON: () => ({}) });
  (svg as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
  return teardown;
};
const tap = (x: number, y: number, id = 1): void => {
  svg.dispatchEvent(pointer('pointerdown', id, x, y));
  svg.dispatchEvent(pointer('pointerup', id, x, y));
};

beforeEach(() => { document.body.innerHTML = ''; });

describe('it renders an SVG surface, not a canvas', () => {
  it('an <svg> with the plan as an <image>, and no canvas anywhere', () => {
    mount();
    expect(svg).toBeTruthy();
    expect(host.querySelector('canvas')).toBeNull();
    const img = svg.querySelector('image');
    expect(img?.getAttribute('href')).toBe(PLAN);
  });

  it('the surface declares touch-action none, so the browser does not steal the gesture', () => {
    mount();
    const css = svg.getAttribute('class') ?? '';
    expect(css).toContain('tp-svg');
    // the rule itself lives in the stylesheet; assert it is really there
    const sheet = require('node:fs').readFileSync('entrypoints/sidepanel/style.css', 'utf8');
    expect(sheet).toMatch(/\.tp-svg[^}]*touch-action:\s*none/);
  });

  it('and carries an accessible name and role', () => {
    mount();
    expect(svg.getAttribute('role')).toBe('application');
    expect(svg.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('the loupe', () => {
  it('is hidden until a finger is down', () => {
    mount();
    expect(svg.querySelector('.tp-loupe')?.getAttribute('display')).toBe('none');
  });

  it('appears on finger-down, ABOVE the finger, with a crosshair', () => {
    mount();
    svg.dispatchEvent(pointer('pointerdown', 1, 180, 300));
    const loupe = svg.querySelector('.tp-loupe') as SVGGElement;
    expect(loupe.getAttribute('display')).not.toBe('none');
    const ring = svg.querySelector('.tp-loupe-ring') as SVGCircleElement;
    const cy = Number(ring.getAttribute('cy'));
    const r = Number(ring.getAttribute('r'));
    // its lowest edge sits clear above the touch point
    expect(300 - (cy + r)).toBeGreaterThanOrEqual(T.loupeOffsetPx - 0.001);
    expect(svg.querySelectorAll('.tp-cross')).toHaveLength(2);
  });

  it('and goes away when the system cancels the gesture', () => {
    mount();
    svg.dispatchEvent(pointer('pointerdown', 1, 180, 300));
    svg.dispatchEvent(pointer('pointercancel', 1, 180, 300));
    expect(svg.querySelector('.tp-loupe')?.getAttribute('display')).toBe('none');
  });
});

/** Click a button by its visible words. */
const click = (text: string): void => {
  const b = [...host.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes(text));
  if (!b) throw new Error(`no button matching "${text}"`);
  (b as HTMLButtonElement).click();
};
const rect = (x: number, y: number, w: number, h: number): void => {
  for (const [px, py] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) tap(px, py);
  tap(x, y);
};

describe('a plan with NO printed dimensions can still be traced and sized', () => {
  it('trace first, then size from the EPC total we already hold', () => {
    mount();
    rect(60, 60, 200, 160);
    expect(svg.querySelectorAll('.tp-room')).toHaveLength(1);
    click('Set the size');
    // the EPC option names the figure AND where it came from
    const epc = [...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('80.0 m²'));
    expect(epc?.textContent).toContain('the EPC register');
    (epc as HTMLButtonElement).click();
    expect(host.querySelector('.tp-sized-by')?.textContent).toContain('80.0 m²');
    expect(host.querySelector('.tp-area')?.textContent).toContain('80.0');
  });

  it('and says plainly that the total matches but rooms still carry error', () => {
    mount();
    rect(60, 60, 200, 160);
    click('Set the size');
    (([...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('80.0 m²'))) as HTMLButtonElement).click();
    expect(host.querySelector('.tp-sized-by + .tp-caveat')?.textContent ?? host.textContent ?? '')
      .toContain('Individual rooms still carry tracing error');
  });

  it('skipping leaves the shapes drawn and says it is unmeasured', () => {
    mount();
    rect(60, 60, 200, 160);
    click('Set the size');
    click('Skip');
    expect(host.textContent ?? '').toContain('Not measured');
    expect(svg.querySelectorAll('.tp-room')).toHaveLength(1);
  });
});

describe('TWO LEVELS ON ONE IMAGE stay two levels', () => {
  it('each level holds its own rooms, and the total is the sum', () => {
    mount();
    rect(40, 40, 200, 160);           // ground: 32,000 px²
    click('Trace another level');
    rect(300, 40, 200, 120);          // first: 24,000 px²
    // only THIS level's rooms are drawn — the other storey is not part of it
    expect(svg.querySelectorAll('.tp-room')).toHaveLength(1);
    click('Set the size');
    (([...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('80.0 m²'))) as HTMLButtonElement).click();
    const text = host.textContent ?? '';
    expect(text).toContain('Ground floor');
    expect(text).toContain('First floor');
    // 80 split by area: 32/56 → 45.7, 24/56 → 34.3
    expect(text).toContain('45.7');
    expect(text).toContain('34.3');
    expect(host.querySelector('.tp-area')?.textContent).toContain('80.0');
  });

  it('and says why the whole-dwelling figure is matched against every level', () => {
    mount();
    rect(40, 40, 200, 160);
    click('Trace another level');
    rect(300, 40, 200, 120);
    click('Set the size');
    (([...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('80.0 m²'))) as HTMLButtonElement).click();
    expect(host.textContent ?? '').toContain('covers the whole dwelling');
  });

  it('switching back shows the first level\'s rooms again', () => {
    mount();
    rect(40, 40, 200, 160);
    click('Trace another level');
    rect(300, 40, 200, 120);
    click('Ground floor');
    expect(svg.querySelectorAll('.tp-room')).toHaveLength(1);
  });
});

describe('tracing mechanics', () => {
  it('the commit happens on LIFT, not on touch', () => {
    mount();
    svg.dispatchEvent(pointer('pointerdown', 1, 60, 80));
    expect(svg.querySelectorAll('.tp-dot')).toHaveLength(0);
    svg.dispatchEvent(pointer('pointerup', 1, 60, 80));
    expect(svg.querySelectorAll('.tp-dot')).toHaveLength(1);
  });

  it('and at the CROSSHAIR — sliding before lifting moves the corner', () => {
    mount();
    svg.dispatchEvent(pointer('pointerdown', 1, 60, 80));
    svg.dispatchEvent(pointer('pointermove', 1, 140, 160));
    svg.dispatchEvent(pointer('pointerup', 1, 140, 160));
    const dot = svg.querySelector('.tp-dot') as SVGCircleElement;
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(140, 0);
  });

  it('two fingers pan, and lifting them leaves NO stray corner behind', () => {
    mount();
    svg.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    svg.dispatchEvent(pointer('pointerdown', 2, 200, 100));
    svg.dispatchEvent(pointer('pointermove', 1, 140, 100));
    svg.dispatchEvent(pointer('pointermove', 2, 240, 100));
    svg.dispatchEvent(pointer('pointerup', 1, 140, 100));
    svg.dispatchEvent(pointer('pointerup', 2, 240, 100));
    expect(svg.querySelectorAll('.tp-dot')).toHaveLength(0);
  });

  it('Undo is always there and takes the last corner back', () => {
    mount();
    tap(60, 80);
    tap(310, 80);
    const undo = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Undo') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(svg.querySelectorAll('.tp-dot')).toHaveLength(1);
  });

  it('T2 — the zoom nudge is shown once, and goes when you zoom', () => {
    mount();
    expect((host.querySelector('.tp-zoom-note') as HTMLElement).hidden).toBe(false);
    svg.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    svg.dispatchEvent(pointer('pointerdown', 2, 200, 100));
    svg.dispatchEvent(pointer('pointermove', 1, 80, 100));
    svg.dispatchEvent(pointer('pointermove', 2, 300, 100));
    svg.dispatchEvent(pointer('pointerup', 1, 80, 100));
    svg.dispatchEvent(pointer('pointerup', 2, 300, 100));
    expect((host.querySelector('.tp-zoom-note') as HTMLElement).hidden).toBe(true);
  });

  it('a HIDDEN row is really hidden — display:flex beats the browser\'s [hidden]', () => {
    const sheet = require('node:fs').readFileSync('entrypoints/sidepanel/style.css', 'utf8');
    expect(sheet).toMatch(/\.traceplan \[hidden\][^}]*display:\s*none\s*!important/);
  });

  it('teardown leaves nothing behind', () => {
    const destroy = mount();
    destroy();
    expect(host.querySelector('.traceplan')).toBeNull();
  });
});

describe('a plan we would be holding the bytes of is refused outright', () => {
  it('a blob: URL shows the unavailable line and builds no surface', () => {
    const box = document.createElement('div');
    document.body.append(box);
    mountTraceplan({ container: box, imageUrl: 'blob:https://x/9f2a', onPlan: () => {}, onClose: () => {} });
    expect(box.querySelector('svg')).toBeNull();
    expect(box.textContent ?? '').toContain('no floor plan');
  });
});
