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
  const teardown = mountTraceplan({ container: host, imageUrl: PLAN, onRoom: () => {}, onClose: () => {} });
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

describe('a whole room, tapped', () => {
  const calibrate = (): void => {
    tap(40, 400);
    tap(290, 400);
    const input = host.querySelector('#tp-length') as HTMLInputElement;
    input.value = '5';
    (host.querySelector('.tp-btn-primary') as HTMLButtonElement).click();
  };

  it('scale, four corners, close — and the area appears with its range', () => {
    mount();
    calibrate();
    for (const [x, y] of [[60, 80], [310, 80], [310, 280], [60, 280]]) tap(x, y);
    expect(svg.querySelectorAll('.tp-dot')).toHaveLength(4);
    tap(60, 80); // the first corner again
    expect(svg.querySelector('.tp-room')).toBeTruthy();
    const area = host.querySelector('.tp-area')?.textContent ?? '';
    const range = host.querySelector('.tp-range')?.textContent ?? '';
    // 250px = 5m, so 0.02 m/px; 250 × 200 px = 5 m × 4 m = 20 m²
    expect(area).toBe('20.0 m²');
    expect(range).toContain('18.0');
    expect(range).toContain('22.0');
  });

  it('a wall shows its live length while you place', () => {
    mount();
    calibrate();
    tap(60, 80);
    tap(310, 80);
    expect(svg.querySelector('.tp-wall-len')?.textContent).toBe('5.0 m');
  });

  it('the commit happens on LIFT, not on touch', () => {
    mount();
    calibrate();
    svg.dispatchEvent(pointer('pointerdown', 1, 60, 80));
    expect(svg.querySelectorAll('.tp-dot')).toHaveLength(0);
    svg.dispatchEvent(pointer('pointerup', 1, 60, 80));
    expect(svg.querySelectorAll('.tp-dot')).toHaveLength(1);
  });

  it('and at the CROSSHAIR — sliding before lifting moves the corner', () => {
    mount();
    calibrate();
    svg.dispatchEvent(pointer('pointerdown', 1, 60, 80));
    svg.dispatchEvent(pointer('pointermove', 1, 140, 160));
    svg.dispatchEvent(pointer('pointerup', 1, 140, 160));
    const dot = svg.querySelector('.tp-dot') as SVGCircleElement;
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(140, 0);
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(160, 0);
  });

  it('two fingers pan, and lifting them leaves NO stray corner behind', () => {
    // The bug this pins: the first finger's lift used to clear the pinch state,
    // so the second finger's lift read as a tap and every zoom dropped a dot.
    mount();
    calibrate();
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
    calibrate();
    tap(60, 80);
    tap(310, 80);
    const undo = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Undo') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(svg.querySelectorAll('.tp-dot')).toHaveLength(1);
  });

  it('a refused scale says why instead of producing a number', () => {
    mount();
    tap(40, 400);
    tap(60, 400); // 20px — under the minimum
    (host.querySelector('#tp-length') as HTMLInputElement).value = '5';
    (host.querySelector('.tp-btn-primary') as HTMLButtonElement).click();
    expect(host.querySelector('.tp-error')?.textContent ?? '').toContain('too short');
  });

  it('a HIDDEN row is really hidden — display:flex beats the browser\'s [hidden]', () => {
    const sheet = require('node:fs').readFileSync('entrypoints/sidepanel/style.css', 'utf8');
    // Without this rule the scale controls stayed on screen under the result.
    expect(sheet).toMatch(/\.traceplan \[hidden\][^}]*display:\s*none\s*!important/);
  });

  it('and the scale row IS marked hidden once the scale is set', () => {
    mount();
    calibrate();
    expect((host.querySelector('.tp-scale-row') as HTMLElement).hidden).toBe(true);
    expect((host.querySelector('.tp-trace-row') as HTMLElement).hidden).toBe(false);
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
    mountTraceplan({ container: box, imageUrl: 'blob:https://x/9f2a', onRoom: () => {}, onClose: () => {} });
    expect(box.querySelector('svg')).toBeNull();
    expect(box.textContent ?? '').toContain('no floor plan');
  });
});
