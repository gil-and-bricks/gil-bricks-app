/**
 * TRACEPLAN — EVERY WORD AND EVERY NUMBER THE FEATURE USES.
 *
 * One file, so the module can be reworded or re-tuned without opening any other,
 * and so a reader can see the whole of what it says in one place.
 *
 * THE TOLERANCES ARE JUDGMENT CALLS, not measurements. The sprint's own
 * specification did not arrive, so each one below was chosen and is justified
 * where it sits. They are here rather than in the code precisely so they can be
 * overruled without touching logic. See docs/DECISIONS_LOG.md (T1).
 */

export const TRACEPLAN_TOLERANCES = {
  /**
   * How far above the finger the loupe sits, in CSS px, measured to the near
   * edge. An adult fingertip covers roughly 45-50px on a phone; 72 clears it
   * with room to spare, and any less puts the magnifier back under the thumb,
   * which is the one thing this control exists to avoid.
   */
  loupeOffsetPx: 72,
  /** Loupe diameter. Big enough to show context around the crosshair. */
  loupeSizePx: 104,
  /**
   * Magnification. 2.5× is enough to separate two wall lines a few pixels apart
   * on a typical plan; much more and the loupe shows texture rather than shape.
   */
  loupeZoom: 2.5,
  /**
   * Tap-to-close radius, screen px. Generous, because closing is the action
   * people fumble; but it only applies once there are enough corners for a
   * room, so it cannot swallow an ordinary second tap.
   */
  closeRadiusPx: 22,
  /** Grab radius for picking up a placed corner. Matches the close radius. */
  grabRadiusPx: 22,
  /** Fewest corners that make a room. Three: a triangle is a real shape. */
  minPoints: 3,
  /**
   * Shortest on-screen reference we will calibrate from. Error in the scale is
   * amplified by the ratio of the room to the reference, so a 40px line across
   * a whole plan is a guess wearing a number. This refuses it and says why.
   */
  minScalePx: 40,
  /**
   * The range printed around the area, as a percentage either way. The brief
   * puts a finger-traced room calibrated off a printed dimension at "about 5 to
   * 10 per cent"; this takes the WORSE end, because a range that turns out too
   * narrow is the one that misleads.
   */
  areaTolerancePct: 10,
  /** Zoom limits for the backdrop. */
  minZoom: 0.5,
  maxZoom: 8,
} as const;

export const TRACEPLAN_COPY = {
  title: 'Trace a room',
  /** Said once, at the top. What this is and what it is not. */
  intro: 'Tap each corner of one room. We work out its size.',
  imageNote: 'The plan stays on your phone. Only the measurement is kept.',

  scale: {
    heading: 'First, set the scale',
    /** Why the longest dimension, in one line. */
    prompt: 'Tap both ends of the longest printed dimension you can read.',
    why: 'A longer line gives a more accurate scale.',
    lengthLabel: 'How long is it, in metres?',
    lengthPlaceholder: 'e.g. 4.2',
    tapFirst: 'Tap one end of the dimension.',
    tapSecond: 'Now tap the other end.',
    tooShort: 'That is too short to measure from. Pick a longer dimension.',
    needLength: 'Type the real length in metres.',
    set: 'Set the scale',
    redo: 'Change the scale',
    done: (metres: string): string => `Scale set from ${metres} m.`,
  },

  trace: {
    heading: 'Now trace the room',
    first: 'Tap the first corner.',
    next: 'Tap the next corner. Tap the first one again to finish.',
    closeHint: 'Tap the first corner, or use Close room.',
    close: 'Close room',
    undo: 'Undo',
    restart: 'Start again',
    /** The live wall length while placing. */
    wall: (metres: string): string => `${metres} m`,
  },

  result: {
    heading: 'This room',
    /** The headline. One decimal, and never without its range. */
    area: (sqm: string): string => `${sqm} m²`,
    range: (low: string, high: string): string => `Somewhere between ${low} and ${high} m²`,
    /** The honesty line. It is not a survey and must not read like one. */
    caveat: 'Traced by hand off a printed plan, so treat it as close, not exact.',
    nameLabel: 'What is this room?',
    namePlaceholder: 'e.g. Lounge',
    save: 'Use this measurement',
    again: 'Trace another room',
  },

  /** Nothing is stored this sprint, and the screen says so rather than implying it. */
  nothingSaved: 'Nothing is saved yet. Write the number down if you need it.',
  close: 'Close',
  unavailable: 'This listing has no floor plan to trace.',
} as const;
