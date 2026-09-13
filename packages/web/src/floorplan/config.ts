/**
 * FLOOR PLAN — EVERY WORD AND EVERY NUMBER THE FEATURE USES.
 *
 * One file, so the module can be reworded or re-tuned without opening any other,
 * and so a reader can see the whole of what it says in one place.
 *
 * THE TOLERANCES ARE JUDGMENT CALLS, not measurements. The sprint's own
 * specification did not arrive, so each one below was chosen and is justified
 * where it sits. They are here rather than in the code precisely so they can be
 * overruled without touching logic. See docs/DECISIONS_LOG.md (T1).
 */

export const FLOORPLAN_TOLERANCES = {
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
  /**
   * T2 — below this zoom the plan is too small to trace accurately, and the
   * surface says so once. At 1× a room corner is two or three pixels and a
   * fingertip is fifty; the loupe makes the corner visible but cannot place it
   * finer than one screen pixel, which on a small room is several per cent.
   * 2× is where a corner becomes a thing you can aim at rather than guess.
   */
  traceZoomPrompt: 2,
  /**
   * T2 — how near a tap must be to a corner to ADJUST it mid-trace rather than
   * place a new one. Deliberately tighter than `grabRadiusPx`: while tracing,
   * placing is the common act and adjusting the rare one, so the rare one has to
   * be asked for precisely. 14 px is about a deliberate press on a visible dot,
   * and is comfortably smaller than the shortest wall anyone traces.
   */
  adjustRadiusPx: 14,
  /**
   * T2 — how near a new corner must be to a corner of a FINISHED room to snap
   * onto it exactly. Adjacent rooms share walls, so this is the normal case,
   * not an edge case: without it the party wall between a lounge and a kitchen
   * gets traced twice, a few pixels apart, and the two rooms overlap or gap.
   * Snapping also removes the thing that made this worse — a press near a
   * finished corner used to PICK IT UP, so starting the next room on a shared
   * corner silently dragged the previous room out of shape.
   */
  snapRadiusPx: 18,
} as const;

/**
 * T2 — THE LEVELS A UK PLAN PUTS ON ONE IMAGE. Agent floorplans nearly always
 * show ground, first and sometimes a loft side by side on a single picture.
 * The user says which one they are tracing; nothing is detected from the image.
 * OCR was cut on this project because agent plans are not reliably readable,
 * and a wrongly-detected level is worse than a question.
 */
export const FLOORPLAN_LEVELS: readonly string[] = [
  'Ground floor', 'First floor', 'Second floor', 'Loft', 'Basement',
];

/** Where a total floor area we already hold came from, in words. */
export const AREA_SOURCE_LABELS: Record<string, string> = {
  'epc-register': 'the EPC register',
  'epc-sector': 'a past sale in our data',
  listing: 'the listing',
  manual: 'you',
};

export const FLOORPLAN_COPY = {
  /**
   * F1 — THE NAMES. "Tracing" is the chore, not the point: the point is
   * redrawing a layout to see whether it holds another bedroom, to move rooms
   * about, or just to keep a clean copy of the plan with the deal.
   */
  section: 'Floor plan',
  title: 'Reconfigure',
  /** Said once, at the top. What this is for, not how it works. */
  intro: 'Redraw the layout to test a room, or keep a clean copy with the deal.',
  imageNote: 'The plan image stays on the agent’s server. We only keep your drawing.',
  /** F1 — no plan came over with the listing. Honest, and not a dead end. */
  noBackdrop: 'No floor plan came with this listing. You can still draw one.',
  /** F1 — the backdrop was there but the agent’s server would not serve it. */
  backdropFailed: 'The plan image would not load. Your drawing is unaffected.',
  open: 'Reconfigure the plan',
  saving: 'Saving…',
  saved: 'Saved with this deal.',
  saveFailed: 'That did not save. Your drawing is still on screen.',

  /**
   * T2 — CALIBRATION COMES AFTER TRACING, not before. Over half of UK agent
   * plans have no printed dimension, so asking for one first stopped most
   * people before they could draw anything.
   */
  scale: {
    heading: 'Now set the size',
    /** Said before any option is chosen. */
    prompt: 'Your plan is drawn. Now tell us how big it really is.',
    /** The four ways, best first. */
    optionDimension: 'Tap a printed dimension',
    optionDimensionWhy: 'Most accurate, if the plan shows one.',
    optionEpc: (sqm: string, source: string): string => `Use ${sqm} m² from ${source}`,
    optionEpcWhy: 'Anchors the whole property to a figure we already hold.',
    optionRoom: 'Type a room size I know',
    optionRoomWhy: 'If you know one room, everything else follows.',
    optionNone: 'Skip — leave it unmeasured',
    optionNoneWhy: 'Keeps the shapes. No areas.',

    tapFirst: 'Tap one end of the dimension.',
    tapSecond: 'Now tap the other end.',
    lengthLabel: 'How long is it, in metres?',
    lengthPlaceholder: 'e.g. 4.2',
    longest: 'Pick the longest one you can read.',
    why: 'A longer line gives a more accurate scale.',
    tooShort: 'That is too short to measure from. Pick a longer dimension.',
    needLength: 'Type the real length in metres.',
    set: 'Set the size',
    redo: 'Change how it is sized',

    /** Known-room calibration. */
    roomPick: 'Which room do you know the size of?',
    roomArea: 'How big is it, in square metres?',
    roomAreaPlaceholder: 'e.g. 16',
    needRoom: 'Pick a room and type its size.',

    /** Named on screen, always, so nobody wonders where the number came from. */
    usingDimension: (metres: string): string => `Sized from a ${metres} m dimension you tapped.`,
    usingEpc: (sqm: string, source: string): string => `Sized so the whole property matches ${sqm} m² from ${source}.`,
    usingRoom: (room: string, sqm: string): string => `Sized from ${room} at ${sqm} m².`,
    /**
     * The honest limit of an area-solved scale. It fits the TOTAL exactly by
     * construction, which looks authoritative; it does nothing for how the
     * error is shared between rooms.
     */
    epcCaveat: 'This makes the total match. Individual rooms still carry tracing error.',
    /** Nothing chosen. The plan is drawn and says so rather than pretending. */
    unmeasured: 'Not measured. The shapes are drawn but there are no areas.',
    needTrace: 'Trace at least one room first.',
  },

  /** T2 — which storey is being traced. Never guessed from the image. */
  level: {
    heading: 'Which level is this?',
    /** Said once, because one image usually holds several storeys. */
    why: 'Most plans show every floor on one image. Trace them one at a time.',
    add: 'Trace another level',
    rename: 'Rename',
    renameLabel: 'What is this level called?',
    current: (name: string): string => `Tracing ${name}`,
    roomsOn: (n: number, name: string): string => `${name}: ${n} ${n === 1 ? 'room' : 'rooms'}`,
    /** Why the total is what the EPC is solved against. */
    totalNote: 'The EPC figure covers the whole dwelling, so it is matched against every level together.',
  },

  /** T2 — said once, early, and then not again. */
  zoom: {
    prompt: 'Pinch to zoom in before you trace. A corner is a few pixels at this size.',
    dismiss: 'Got it',
  },

  trace: {
    heading: 'Now trace the room',
    first: 'Tap the first corner.',
    next: 'Tap the next corner. Tap the first one again to finish.',
    closeHint: 'Tap the first corner, or use Close room.',
    close: 'Close room',
    undo: 'Undo',
    restart: 'Start again',
    /** F1 — a partition splits a room in two, to test a layout change. */
    partition: 'Add a partition',
    partitionHint: 'Tap two points on opposite walls to split a room.',
    partitionDone: 'Split.',
    partitionFailed: 'That did not cross a room. Try two points on opposite walls.',
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
    /** T2 — the property total, across every level. */
    propertyTotal: (sqm: string): string => `Whole property: ${sqm} m²`,
    levelTotal: (name: string, sqm: string): string => `${name}: ${sqm} m²`,
    nameLabel: 'What is this room?',
    namePlaceholder: 'e.g. Lounge',
    save: 'Use this measurement',
    again: 'Trace another room',
    /** T2 — a room is added to the level, not replaced. */
    added: (name: string): string => `${name} added.`,
    /**
     * F1 — against the HMO single-adult minimum the product already uses. Said
     * per room, quietly, because it is the question most of these drawings are
     * being made to answer.
     */
    hmoPass: 'Over the HMO single-adult minimum.',
    hmoFail: 'Under the HMO single-adult minimum.',
  },

  /** Nothing is stored this sprint, and the screen says so rather than implying it. */
  nothingSaved: 'Nothing is saved yet. Write the number down if you need it.',
  close: 'Close',
  unavailable: 'No floor plan to work from.',

  /** F1 — the print sheet, which is the thing a builder actually receives. */
  print: {
    open: 'Print or save as PDF',
    title: 'Floor plan',
    /** Said on the sheet itself, so a printout can never pass as a survey. */
    caveat: 'Drawn by hand from the agent’s plan. Sizes are estimates, not a survey.',
    levelHeading: (name: string): string => name,
    totalLine: (sqm: string): string => `Total ${sqm} m²`,
    dated: (when: string): string => `Drawn ${when}`,
    /** Where the size came from, carried onto the sheet. */
    sizedBy: (how: string): string => `Sized from ${how}.`,
  },

  share: {
    button: 'Share on WhatsApp',
    /** The message. Our numbers only — never the agent's image. */
    message: (address: string, total: string, rooms: string): string =>
      `${address} — floor plan\n\nTotal ${total} m²\n${rooms}\n\nDrawn from the agent's plan. Estimates, not a survey.`,
    room: (name: string, sqm: string): string => `${name}: ${sqm} m²`,
  },
} as const;
