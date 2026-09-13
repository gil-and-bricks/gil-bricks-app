/**
 * T1 — THE INTERACTION, as a state machine. Every "what happens when I tap
 * there" answered without a browser or a finger.
 */
import { describe, expect, it } from 'vitest';
import {
  closeRoom, grab, initialState, lastWallMetres, moveHeld, pan, reading, redoScale,
  release, restart, screenPoints, setScale, tapScale, tapTrace, undo, zoomAbout,
} from '../src/traceplan/tracer.ts';
import { TRACEPLAN_TOLERANCES as T } from '../src/traceplan/config.ts';

const TOO_SHORT = 'too short';
/** A calibrated tracer: 250 px of plan = 5 m, so 0.02 m per px. */
const calibrated = () => {
  let s = initialState();
  s = tapScale(s, { x: 0, y: 0 });
  s = tapScale(s, { x: 250, y: 0 });
  return setScale(s, 5, TOO_SHORT);
};
/** A closed 5 m × 4 m room. */
const room = () => {
  let s = calibrated();
  for (const p of [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 200 }, { x: 0, y: 200 }]) s = tapTrace(s, p);
  return tapTrace(s, { x: 0, y: 0 });
};

describe('setting the scale', () => {
  it('takes two taps, then the typed length, then moves on to tracing', () => {
    const s = calibrated();
    expect(s.phase).toBe('trace');
    expect(s.metresPerPx).toBeCloseTo(0.02, 6);
    expect(s.scaleMetres).toBe(5);
  });

  it('refuses a reference too short, and SAYS so instead of guessing', () => {
    let s = initialState();
    s = tapScale(s, { x: 0, y: 0 });
    s = tapScale(s, { x: T.minScalePx - 5, y: 0 });
    s = setScale(s, 5, TOO_SHORT);
    expect(s.phase).toBe('scale');
    expect(s.metresPerPx).toBeNull();
    expect(s.error).toBe(TOO_SHORT);
  });

  it('a third tap starts the reference again rather than adding a third end', () => {
    let s = initialState();
    s = tapScale(s, { x: 0, y: 0 });
    s = tapScale(s, { x: 250, y: 0 });
    s = tapScale(s, { x: 90, y: 90 });
    expect(s.scalePoints).toHaveLength(1);
  });

  it('the scale can be redone later without losing the tracer', () => {
    const s = redoScale(room());
    expect(s.phase).toBe('scale');
    expect(s.metresPerPx).toBeNull();
  });
});

describe('placing corners', () => {
  it('each tap adds one, and the live wall length reads in metres', () => {
    let s = calibrated();
    s = tapTrace(s, { x: 0, y: 0 });
    s = tapTrace(s, { x: 250, y: 0 });
    expect(s.points).toHaveLength(2);
    expect(lastWallMetres(s)).toBeCloseTo(5, 6);
  });

  it('tapping the first corner closes the room — once there are enough', () => {
    const s = room();
    expect(s.closed).toBe(true);
    expect(s.phase).toBe('done');
    expect(s.points).toHaveLength(4);
  });

  it('but an early tap near the first corner places a corner, it does not close', () => {
    let s = calibrated();
    s = tapTrace(s, { x: 100, y: 100 });
    s = tapTrace(s, { x: 105, y: 100 });
    expect(s.closed).toBe(false);
    expect(s.points).toHaveLength(2);
  });

  it('and WHILE OPEN a tap near a placed corner places, never drags it', () => {
    // Tracing is building. If a near-tap grabbed, a genuine tight corner would
    // silently drag the previous one and the room would deform under you.
    let s = calibrated();
    s = tapTrace(s, { x: 100, y: 100 });
    s = tapTrace(s, { x: 260, y: 100 });
    s = tapTrace(s, { x: 262, y: 103 });
    expect(s.dragging).toBeNull();
    expect(s.points).toHaveLength(3);
  });

  it('grabbing does nothing at all until the room is closed', () => {
    let s = calibrated();
    s = tapTrace(s, { x: 100, y: 100 });
    expect(grab(s, { x: 100, y: 100 }).dragging).toBeNull();
  });

  it('the area only exists once the room is closed', () => {
    let s = calibrated();
    for (const p of [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 200 }]) s = tapTrace(s, p);
    expect(reading(s)).toBeNull();
    expect(reading(closeRoom(s))).not.toBeNull();
  });

  it('and reads 20 m² for a 5 × 4 room, with its range', () => {
    const r = reading(room());
    expect(r?.sqm).toBe(20);
    expect(r?.lowSqm).toBe(18);
    expect(r?.highSqm).toBe(22);
  });
});

describe('correcting a mistake', () => {
  it('undo removes the last corner', () => {
    let s = calibrated();
    s = tapTrace(s, { x: 0, y: 0 });
    s = tapTrace(s, { x: 250, y: 0 });
    expect(undo(s).points).toHaveLength(1);
  });

  it('undo after closing REOPENS the room — that is what it obviously means', () => {
    const s = undo(room());
    expect(s.closed).toBe(false);
    expect(s.phase).toBe('trace');
    expect(s.points).toHaveLength(4);
  });

  it('undo on an empty trace does nothing rather than erroring', () => {
    expect(undo(calibrated()).points).toEqual([]);
  });

  it('a placed corner can be grabbed and dragged, and the area follows', () => {
    let s = room();
    const before = reading(s)!.sqm;
    s = grab(s, { x: 250, y: 200 });
    expect(s.dragging).toBe(2);
    s = moveHeld(s, { x: 125, y: 200 });
    s = release(s);
    expect(s.dragging).toBeNull();
    expect(reading(s)!.sqm).toBeLessThan(before);
  });

  it('start again clears the corners but KEEPS the scale — it was set separately', () => {
    const s = restart(room());
    expect(s.points).toEqual([]);
    expect(s.closed).toBe(false);
    expect(s.metresPerPx).toBeCloseTo(0.02, 6);
  });
});

describe('zoom and pan', () => {
  it('panning moves what you see, never what you traced', () => {
    const s = pan(room(), 40, -25);
    expect(s.points[1]).toEqual({ x: 250, y: 0 });
    expect(reading(s)!.sqm).toBe(20);
    expect(screenPoints(s)[1]).toEqual({ x: 290, y: -25 });
  });

  it('pinching keeps the plan under the fingers put', () => {
    const centre = { x: 180, y: 300 };
    const s = zoomAbout(initialState(), centre, 2);
    // the point under the pinch is still under the pinch
    const before = { x: (centre.x - 0) / 1, y: (centre.y - 0) / 1 };
    const after = { x: before.x * s.view.scale + s.view.tx, y: before.y * s.view.scale + s.view.ty };
    expect(after.x).toBeCloseTo(centre.x, 6);
    expect(after.y).toBeCloseTo(centre.y, 6);
  });

  it('zoom is clamped at both ends', () => {
    let s = initialState();
    for (let i = 0; i < 20; i++) s = zoomAbout(s, { x: 0, y: 0 }, 2);
    expect(s.view.scale).toBe(T.maxZoom);
    for (let i = 0; i < 40; i++) s = zoomAbout(s, { x: 0, y: 0 }, 0.5);
    expect(s.view.scale).toBe(T.minZoom);
  });

  it('the area is unchanged by any amount of zooming', () => {
    let s = room();
    for (let i = 0; i < 5; i++) s = zoomAbout(s, { x: 100, y: 100 }, 1.4);
    s = pan(s, 60, 60);
    expect(reading(s)!.sqm).toBe(20);
  });
});
