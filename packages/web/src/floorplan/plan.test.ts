/**
 * F1 — THE INTERACTION, as a state machine: trace first, size afterwards, and
 * levels that never merge into one another.
 */
import { describe, expect, it } from 'vitest';
import {
  addLevel, backToTrace, beginScale, clearDraft, commitRoom, grab, initialState, lastWallMetres,
  levelSqm, moveHeld, pan, propertySqm, release, renameLevel, renameRoom, roomReading, selectLevel,
  tapScale, tapTrace, tracedPx2, tracedRooms, undo, useDimension, useKnownRoom, useKnownTotal,
  useNothing, zoomAbout, type TracerState,
} from './plan';
import { FLOORPLAN_COPY, FLOORPLAN_LEVELS, FLOORPLAN_TOLERANCES as T } from './config';

const TOO_SHORT = 'too short';
const NEED = 'need';
/** Trace a w×h rectangle (image px) on the active level. */
const traceRect = (s: TracerState, x: number, y: number, w: number, h: number): TracerState => {
  for (const p of [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]) s = tapTrace(s, p);
  return tapTrace(s, { x, y });
};

describe('you trace FIRST — the scale step no longer blocks the door', () => {
  it('opens straight into tracing, with no scale demanded', () => {
    const s = initialState();
    expect(s.phase).toBe('trace');
    expect(s.calibration.kind).toBe('none');
  });

  it('a room can be drawn with no scale at all', () => {
    const s = traceRect(initialState(), 0, 0, 250, 200);
    expect(tracedRooms(s)).toHaveLength(1);
    expect(tracedPx2(s)).toBe(50_000);
    // ...and has no area, because nothing has said how big it is
    expect(roomReading(s, tracedRooms(s)[0])).toBeNull();
    expect(propertySqm(s)).toBeNull();
  });

  it('sizing is refused until something is traced', () => {
    expect(beginScale(initialState()).phase).toBe('trace');
  });
});

describe('the four ways to size it', () => {
  const traced = () => beginScale(traceRect(initialState({ sqm: 80, source: 'epc-register' }), 0, 0, 250, 200));

  it('a printed dimension, when the plan has one', () => {
    let s = traced();
    s = tapScale(s, { x: 0, y: 0 });
    s = tapScale(s, { x: 250, y: 0 });
    s = useDimension(s, 5, TOO_SHORT);
    expect(s.calibration.kind).toBe('dimension');
    expect(s.calibration.metresPerPx).toBeCloseTo(0.02, 6);
    expect(propertySqm(s)).toBe(20);
  });

  it('THE EPC TOTAL — the fallback for the majority of plans with no dimension', () => {
    const s = useKnownTotal(traced(), NEED);
    expect(s.calibration.kind).toBe('epc');
    // scale = sqrt(80 / 50000); the traced total then equals the EPC figure
    expect(s.calibration.metresPerPx).toBeCloseTo(Math.sqrt(80 / 50_000), 9);
    expect(propertySqm(s)).toBe(80);
  });

  it('and it names the figure and where it came from', () => {
    const s = useKnownTotal(traced(), NEED);
    expect(s.calibration.knownSqm).toBe(80);
    expect(s.calibration.knownSource).toBe('epc-register');
  });

  it('a room whose size the user knows', () => {
    const before = traced();
    const s = useKnownRoom(before, tracedRooms(before)[0].id, 20, NEED);
    // that room's own area becomes exactly what they said
    expect(s.calibration.kind).toBe('room');
    expect(propertySqm(s)).toBe(20);
    expect(roomReading(s, tracedRooms(s)[0])!.sqm).toBe(20);
  });

  /**
   * AND IT REMEMBERS THE FIGURE, because the panel says it back on screen:
   * "Sized from Room 1 at 20.0 m²".
   *
   * It did not. `useKnownRoom` never stored the size — the type's own comment
   * said "how big they said it is" and the code did not — so view.ts printed
   * `one((cal.metresPerPx ?? 0) > 0 ? 0 : 0)`, a ternary whose branches are
   * both zero. Every user who sized a plan from a room they knew was told
   * "Sized from Room 1 at 0.0 m²" under a total that was correct.
   *
   * Nothing caught it because every test here read the AREAS, which were right.
   * None read the SENTENCE. So this one reads the sentence.
   */
  it('and remembers the figure, because the panel says it back', () => {
    const before = traced();
    const s = useKnownRoom(before, tracedRooms(before)[0].id, 20, NEED);
    expect(s.calibration.knownSqm).toBe(20);
    const said = FLOORPLAN_COPY.scale.usingRoom(s.calibration.roomName ?? '', s.calibration.knownSqm!.toFixed(1));
    expect(said).toContain('20.0');
    expect(said).toBe('Sized from Room 1 at 20.0 m².');
  });

  it('or nothing at all, which is a real answer and says so', () => {
    const s = useNothing(traced());
    expect(s.calibration.kind).toBe('none');
    expect(s.calibration.metresPerPx).toBeNull();
    expect(propertySqm(s)).toBeNull();
    // the shapes survive — only the areas are absent
    expect(tracedRooms(s)).toHaveLength(1);
  });

  it('a dimension too short to measure from is refused with a reason', () => {
    let s = traced();
    s = tapScale(s, { x: 0, y: 0 });
    s = tapScale(s, { x: 10, y: 0 });
    s = useDimension(s, 5, TOO_SHORT);
    expect(s.calibration.kind).toBe('none');
    expect(s.error).toBe(TOO_SHORT);
  });

  it('the EPC option is simply absent when we hold no figure', () => {
    expect(initialState(null).known).toBeNull();
    expect(useKnownTotal(beginScale(traceRect(initialState(null), 0, 0, 250, 200)), NEED).calibration.kind).toBe('none');
  });

  it('you can go back and size it a different way', () => {
    const s = backToTrace(useKnownTotal(traced(), NEED));
    expect(s.phase).toBe('trace');
  });
});

describe('levels on ONE image never merge', () => {
  const twoLevels = (): TracerState => {
    // ground: 250 × 200 on the left of the image; first: 250 × 160 on the right
    let s = initialState({ sqm: 90, source: 'epc-register' });
    s = traceRect(s, 0, 0, 250, 200);
    s = addLevel(s);
    s = traceRect(s, 400, 0, 250, 160);
    return s;
  };

  it('starts on the ground floor, named from config', () => {
    expect(initialState().levels[0].name).toBe(FLOORPLAN_LEVELS[0]);
  });

  it('a second level is the next standard UK one, not a number', () => {
    expect(addLevel(initialState()).levels[1].name).toBe('First floor');
  });

  it('each level keeps its OWN rooms', () => {
    const s = twoLevels();
    expect(s.levels).toHaveLength(2);
    expect(s.levels[0].rooms).toHaveLength(1);
    expect(s.levels[1].rooms).toHaveLength(1);
  });

  it('and its own total', () => {
    const s = useKnownTotal(beginScale(twoLevels()), NEED);
    const ground = levelSqm(s, 0) as number;
    const first = levelSqm(s, 1) as number;
    expect(ground).toBeGreaterThan(first); // 50,000 px² vs 40,000 px²
    expect(Math.round((ground + first) * 10) / 10).toBe(90);
  });

  it('THE PROPERTY TOTAL IS THE SUM, and that is what the EPC is solved against', () => {
    const s = useKnownTotal(beginScale(twoLevels()), NEED);
    expect(propertySqm(s)).toBe(90);
    // proof it used BOTH levels: solving against one alone would not land on 90
    expect(tracedPx2(s)).toBe(90_000);
  });

  it('switching level clears the draft, so half a room cannot land on the wrong floor', () => {
    let s = initialState();
    s = tapTrace(s, { x: 10, y: 10 });
    s = addLevel(s);
    expect(s.draft).toEqual([]);
    s = selectLevel(s, 0);
    expect(s.draft).toEqual([]);
  });

  it('a level can be renamed', () => {
    expect(renameLevel(initialState(), 0, 'Annexe').levels[0].name).toBe('Annexe');
  });

  it('and a room can be renamed', () => {
    const s = traceRect(initialState(), 0, 0, 100, 100);
    const r = tracedRooms(s)[0];
    expect(renameRoom(s, r.id, 'Lounge').levels[0].rooms[0].name).toBe('Lounge');
  });
});

describe('tracing, corner by corner', () => {
  it('closing on the first corner commits the room and clears the draft', () => {
    const s = traceRect(initialState(), 0, 0, 100, 100);
    expect(s.draft).toEqual([]);
    expect(tracedRooms(s)).toHaveLength(1);
  });

  it('rooms are auto-named so nothing is ever nameless', () => {
    let s = traceRect(initialState(), 0, 0, 100, 100);
    s = traceRect(s, 200, 0, 100, 100);
    expect(tracedRooms(s).map((r) => r.name)).toEqual(['Room 1', 'Room 2']);
  });

  it('A CORNER CAN BE ADJUSTED MID-TRACE NOW — a fumble no longer means undo', () => {
    let s = initialState();
    s = tapTrace(s, { x: 100, y: 100 });
    s = tapTrace(s, { x: 300, y: 100 });
    // a deliberate press ON the dot picks it up
    s = tapTrace(s, { x: 302, y: 101 });
    expect(s.dragging).toEqual({ room: null, index: 1 });
    s = moveHeld(s, { x: 320, y: 120 });
    s = release(s);
    expect(s.draft[1]).toEqual({ x: 320, y: 120 });
    expect(s.draft).toHaveLength(2);
  });

  it('but an ordinary tap a finger away still PLACES, it does not drag', () => {
    let s = initialState();
    s = tapTrace(s, { x: 100, y: 100 });
    s = tapTrace(s, { x: 300, y: 100 });
    s = tapTrace(s, { x: 300 + T.adjustRadiusPx + 4, y: 100 });
    expect(s.dragging).toBeNull();
    expect(s.draft).toHaveLength(3);
  });

  it('undo takes back a corner, then the whole last room — as a draft, not a deletion', () => {
    let s = traceRect(initialState(), 0, 0, 100, 100);
    expect(tracedRooms(s)).toHaveLength(1);
    s = undo(s);
    expect(tracedRooms(s)).toHaveLength(0);
    expect(s.draft).toHaveLength(4);
    s = undo(s);
    expect(s.draft).toHaveLength(3);
  });

  it('the corner that CLOSES the room is never grabbed instead', () => {
    // Adding mid-trace adjusting broke closing: pressing the first corner picked
    // it up, so the closing tap was swallowed and the room could not be finished.
    let s = initialState();
    for (const p of [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]) s = tapTrace(s, p);
    s = grab(s, { x: 0, y: 0 });
    expect(s.dragging).toBeNull();
    s = tapTrace(s, { x: 0, y: 0 });
    expect(tracedRooms(s)).toHaveLength(1);
  });

  it('but before there are enough corners, the first one is still adjustable', () => {
    let s = initialState();
    s = tapTrace(s, { x: 0, y: 0 });
    s = tapTrace(s, { x: 100, y: 0 });
    s = grab(s, { x: 0, y: 0 });
    expect(s.dragging).toEqual({ room: null, index: 0 });
  });

  it('ADJACENT ROOMS SHARE CORNERS — a new corner snaps onto a finished one', () => {
    // The party wall between a lounge and a kitchen is traced twice; without
    // snapping the two copies sit a few pixels apart and the rooms overlap.
    let s = traceRect(initialState(), 0, 0, 200, 160);
    s = tapTrace(s, { x: 204, y: 3 });   // near the finished corner at (200, 0)
    expect(s.draft[0]).toEqual({ x: 200, y: 0 });
  });

  it('and a finished corner is never picked up by starting the next room on it', () => {
    let s = traceRect(initialState(), 0, 0, 200, 160);
    s = grab(s, { x: 200, y: 0 });
    expect(s.dragging).toBeNull();
    expect(tracedRooms(s)[0].points[1]).toEqual({ x: 200, y: 0 });
  });

  it('to change a finished room you Undo it back to a draft, where corners move', () => {
    let s = traceRect(initialState(), 0, 0, 200, 160);
    s = undo(s);
    expect(tracedRooms(s)).toHaveLength(0);
    expect(s.draft).toHaveLength(4);
    s = grab(s, { x: 200, y: 160 });
    expect(s.dragging).toEqual({ room: null, index: 2 });
    s = release(moveHeld(s, { x: 100, y: 160 }));
    expect(s.draft[2]).toEqual({ x: 100, y: 160 });
  });

  it('clearing the draft leaves finished rooms alone', () => {
    let s = traceRect(initialState(), 0, 0, 100, 100);
    s = tapTrace(s, { x: 400, y: 400 });
    s = clearDraft(s);
    expect(s.draft).toEqual([]);
    expect(tracedRooms(s)).toHaveLength(1);
  });

  it('the live wall length appears only once there IS a scale to say it in', () => {
    let s = initialState();
    s = tapTrace(s, { x: 0, y: 0 });
    s = tapTrace(s, { x: 250, y: 0 });
    expect(lastWallMetres(s)).toBeNull();
  });
});

describe('zoom and pan never move what was traced', () => {
  it('the property total survives any amount of zooming and panning', () => {
    let s = useKnownTotal(beginScale(traceRect(initialState({ sqm: 80, source: 'epc-register' }), 0, 0, 250, 200)), NEED);
    for (let i = 0; i < 4; i++) s = zoomAbout(s, { x: 100, y: 100 }, 1.5);
    s = pan(s, 90, -40);
    expect(propertySqm(s)).toBe(80);
  });

  it('zooming marks the nudge as seen — it is advice, not a nag', () => {
    expect(zoomAbout(initialState(), { x: 0, y: 0 }, 2).zoomPrompted).toBe(true);
  });
});
