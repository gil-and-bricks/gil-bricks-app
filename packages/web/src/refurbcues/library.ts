/**
 * ███ THE CUE LIBRARY — THIS FILE IS THE RESEARCH'S, NOT CLAUDE'S ███
 *
 * Forty visual refurbishment cues for England and Wales, from the operator's
 * research document, current at 13 September 2026. Every regulation reference,
 * confidence level and date is the research's, and 36 of the 40 `means` lines
 * are its `tip_text` VERBATIM — including the lower-case caveats, which are
 * written that way in the source and read correctly after "To be sure:".
 *
 * FOUR ARE REWORDED, on the operator's instruction. Two at the opening only,
 * two more deeply — said precisely, because provenance is this file's contract:
 *
 *   #1  fuse-box-rewireable   "The fuse box looks old. That does not always
 *                             mean…" → "An old fuse box does not always mean…".
 *   #2  consumer-unit-plastic "This plastic fuse box is legal…" → "A plastic
 *                             fuse box FITTED UNDER THE OLD RULES is legal…".
 *       Both asserted the photograph contained the thing. We cannot see a
 *       photograph. #1 lost only its demonstrative. #2 needed four words more:
 *       "this plastic fuse box is legal" was true of one already-installed
 *       board, because Reg 421.1.201 is not retrospective — "a plastic fuse box
 *       is legal" would have been false of anything fitted since 1 Jan 2016.
 *
 *   #19 bedroom-ceiling-stain — WHOLE `means` AND CAVEAT REPLACED, not just the
 *       opening. "A brown ceiling stain means water got in at some point" was a
 *       diagnosis nothing supports. The three alternatives it now names —
 *       nicotine, rust, old adhesive — are the OPERATOR'S, from the instruction
 *       that ordered this change; they are not in the research and are not
 *       invented here. Its caveat no longer presupposes water either: it used to
 *       admit the timing was unknown while taking the cause for granted.
 *
 *   #40 no-kitchen-bathroom-photo — WHOLE `means` REPLACED. "expect it to need
 *       work" told someone to assume a defect in a room nobody has seen, and it
 *       carried a KITCHEN cost item, so an absent photo could tick a line into a
 *       budget. The cost item is now null and the wording matches its sibling
 *       #36, which handled the identical situation correctly from the start.
 *
 * WHAT IS NOT THE RESEARCH'S, so nobody has to guess:
 *   - `look` renders the research's `cue` field ("Old fuse box / rewireable
 *     fuses") into this schema's sentence form ("Look for an old fuse box…").
 *     The observation is the research's; the sentence is not.
 *   - `room` maps the research's eleven rooms onto the eight the user can
 *     actually tap: living_room→living, hallway_stairs→hall, exterior_front and
 *     garage_outbuilding→outside, exterior_rear→outside or garden.
 *   - `costItem` maps onto REFURB_ITEMS: boiler→heating, insulation→decoration,
 *     fire doors→other. Five are NULL, and only two of those for the reason you
 *     would guess: #18 and #39 say "cost: none direct", #21 says "cost: minor"
 *     and #36 "cost: unknown" — neither of which is a REFURB_ITEMS row — and #40
 *     had "cost: kitchen/bathroom" taken OFF it on the operator's instruction,
 *     because a photograph nobody has seen is a question to ask, not a budget
 *     line. A null means no tick button, never a nothing added to a total.
 *
 * ALL FORTY ARE SERVED. `WITHHELD` at the bottom is empty and stays as the
 * mechanism: an entry there is an honest "we have this, we are not showing it,
 * here is why" rather than a silent deletion, and the next paste may need it.
 *
 * FOUR INSTRUMENTS ARE ENGLAND-ONLY and now say so in their name, exactly as
 * the research's own text writes them — "(England) Regulations", "Part P of the
 * Building Regulations (England)". The app serves England AND Wales, and a
 * Welsh user shown "Boiler Plus · The law" with no qualifier is being told
 * something untrue. See docs/DECISIONS_LOG.md (R3.1) for what this does NOT
 * fix: cue #18's own wording states the 6.51 m² England figure flat, and
 * rewording the research's tip text is not this session's to do.
 *
 * FIVE CITATIONS WERE NOT CARRIED, and none was replaced by an invented one —
 * the cue simply cites the research's other reference, or none:
 *   - #11 black mould: HHSRS carried, Awaab's Law not. Its PRS extension runs
 *     through the Renters' Rights Act, and CLAUDE.md permanently excludes
 *     Renters' Rights content ("evolving law; summarising it risks giving
 *     outdated legal advice").
 *   - #13, #14, #23 (radiators, storage heaters, loft insulation) and #15's
 *     second reference: MEES / EPC C by 2030. CLAUDE.md permanently excludes
 *     "EPC-C / MEES warnings — proposed rules unsettled; stale compliance
 *     warnings are worse than none". The research types all three as partly
 *     practitioner cues, so they ship as practitioner cues with no citation;
 *     #15 ships on Part L, which the research names first for that work.
 *
 * ── THE RULES THE WORDING MUST OBEY ─────────────────────────────────────────
 * Enforced by `honesty.test.ts`, which fails the build. Not style preferences;
 * this is what keeps the advice defensible.
 *
 *  1. NEVER CLAIM TO HAVE SEEN ANYTHING. We cannot look at a photograph. Every
 *     tip says what to LOOK FOR and what it MIGHT mean. Banned outright: "we
 *     can see", "this photo shows", "detected", "appears to be" — and, below
 *     'conclusive', opening a sentence by asserting the thing is there ("The
 *     fuse box looks old", "This plastic fuse box is…").
 *  2. NEVER DIAGNOSE. "This property needs rewiring" is indefensible.
 *  3. CONFIDENCE CHANGES THE WORDING, and the test checks it:
 *       'conclusive'  — may be stated plainly. Still no diagnosis.
 *       'strong'      — the OBSERVATION is reliable, so the general fact may be
 *                       stated; it still may not assert this photo contains it.
 *       'indicative'  — MUST read as a prompt to investigate: the `means` line
 *                       has to hedge ("may", "could", "not always", "check").
 *       'weak'        — the same hedging, AND it is shown last and rarely.
 *  4. EVERY TIP CARRIES A CAVEAT, and it may not be empty.
 *  5. A COST ITEM, where there is one, must exist in src/config/refurb.ts.
 *  6. A REGULATION, where there is one, must exist in the table below.
 */
import type { RefurbCue, RegulationRef } from './types';

/** Regulations, by key. A change here cascades to every tip that cites it. */
export const REGULATIONS: Record<string, RegulationRef> = {
  'bs7671': {
    name: 'BS 7671 (Wiring Regulations)',
    what: 'The national standard for electrical installations. It is what an EICR tests against.',
    lastChecked: '2026-09-13',
  },
  'bs7671-421': {
    name: 'BS 7671 Reg 421.1.201',
    what: 'Since 1 January 2016 a new consumer unit in a home must have a metal enclosure. Not retrospective.',
    lastChecked: '2026-09-13',
  },
  'part-p': {
    name: 'Building Regulations Part P (England)',
    what: 'Some domestic electrical work must be notified and done to the BS 7671 standard.',
    lastChecked: '2026-09-13',
  },
  'part-m': {
    name: 'Building Regulations Part M',
    what: 'Sockets and switches 450–1200 mm from the floor in NEW or materially altered homes only.',
    lastChecked: '2026-09-13',
  },
  'gsiur-1998': {
    name: 'Gas Safety (Installation and Use) Regulations 1998',
    what: 'A landlord must have an annual gas safety check by a Gas Safe registered engineer.',
    lastChecked: '2026-09-13',
  },
  'boiler-plus': {
    name: 'Boiler Plus (England)',
    what: 'A new gas boiler must be at least 92% efficient with time and temperature controls. England only.',
    lastChecked: '2026-09-13',
  },
  'part-f': {
    name: 'Building Regulations Part F',
    what: 'Ventilation. Replacement windows must not make background ventilation worse.',
    lastChecked: '2026-09-13',
  },
  'part-c': {
    name: 'Building Regulations Part C',
    what: 'Resistance to moisture: damp-proof courses, ground levels and penetrating damp.',
    lastChecked: '2026-09-13',
  },
  'part-l': {
    name: 'Building Regulations Part L',
    what: 'Replacement windows in an existing home must meet limiting U-values.',
    lastChecked: '2026-09-13',
  },
  'hhsrs': {
    name: 'Housing Health and Safety Rating System',
    what: 'Councils rate 29 hazards in a home. Damp and mould and excess cold are among them.',
    lastChecked: '2026-09-13',
  },
  'car-2012': {
    name: 'Control of Asbestos Regulations 2012',
    what: 'Asbestos must be managed, and only disturbed under controlled conditions.',
    lastChecked: '2026-09-13',
  },
  'si-2018-616': {
    name: 'HMO licence room sizes, SI 2018/616 (England)',
    what: 'In a licensed HMO a sleeping room for one person over 10 must be at least 6.51 m². England only; Wales licenses differently.',
    lastChecked: '2026-09-13',
  },
  'hmo-fire-safety': {
    name: 'HMO licence conditions, Schedule 4',
    what: 'A licensed HMO needs alarms and fire precautions, usually fire doors and a protected escape.',
    lastChecked: '2026-09-13',
  },
  'smoke-co-2022': {
    name: 'Smoke and Carbon Monoxide Alarm (England) Regulations',
    what: 'A rented home needs an alarm on every storey, and a CO alarm by a fixed combustion appliance. England; Wales has its own rule.',
    lastChecked: '2026-09-13',
  },
  'wca-1981': {
    name: 'Wildlife and Countryside Act 1981',
    what: 'It is an offence to cause Japanese knotweed to spread into the wild.',
    lastChecked: '2026-09-13',
  },
};

/**
 * THE CUES. Ordered as the research orders them, by room.
 *
 * Serving order is NOT this order: select.ts sorts by confidence, so conclusive
 * and strong come first and weak is shown last and rarely.
 */
export const CUES: readonly RefurbCue[] = [
  // ---- KITCHEN ------------------------------------------------------------
  {
    key: 'fuse-box-rewireable',
    room: 'kitchen',
    confidence: 'indicative',
    costItem: 'rewire',
    regulation: 'bs7671',
    basis: 'standard',
    look: 'Look for an old fuse box with rewireable fuses rather than breakers.',
    means: 'An old fuse box does not always mean a full rewire, but budget for an electrician to test it (an EICR) before you buy.',
    caveat: 'only an EICR confirms what work is needed.',
  },
  {
    key: 'consumer-unit-plastic',
    room: 'kitchen',
    confidence: 'weak',
    costItem: 'rewire',
    regulation: 'bs7671-421',
    basis: 'legal',
    look: 'Look for a white plastic consumer unit with modern breakers.',
    means: 'A plastic fuse box fitted under the old rules is legal, but any new one must be metal. Not urgent, but worth noting.',
    caveat: 'a plastic board fitted when the rules allowed is still legal.',
  },
  {
    key: 'surface-trunking',
    room: 'kitchen',
    confidence: 'indicative',
    costItem: 'rewire',
    regulation: 'part-p',
    basis: 'standard',
    look: 'Look for surface trunking, or cables running on the face of the wall from switches and sockets.',
    means: 'Wires running on top of the wall in plastic trunking mean wiring was added later. Ask to see the electrical certificate.',
    caveat: 'trunking can be a tidy, compliant addition.',
  },
  {
    key: 'sockets-skirting-height',
    room: 'kitchen',
    confidence: 'indicative',
    costItem: 'rewire',
    regulation: 'part-m',
    basis: 'standard',
    look: 'Look for sockets at skirting-board height throughout.',
    means: 'Low sockets suggest older wiring. They are still legal, but a modern kitchen usually gets new ones anyway.',
    caveat: 'low sockets in an existing home are legal.',
  },
  {
    key: 'socket-beside-sink',
    room: 'kitchen',
    confidence: 'strong',
    costItem: 'rewire',
    regulation: 'bs7671',
    basis: 'standard',
    look: 'Look for a socket right next to the sink or the taps.',
    means: 'A socket right beside the sink is a safety worry. An electrician can check and move it.',
    caveat: 'exact safety needs testing.',
  },
  {
    key: 'kitchen-dated-units',
    room: 'kitchen',
    confidence: 'indicative',
    costItem: 'kitchen',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for dated units, worktops and tiling in a 1980s or 1990s style.',
    means: 'An old kitchen usually means a new one in your costs. Measure it from the photos and floor plan to price it.',
    caveat: 'a photo hides carcass condition.',
  },
  {
    key: 'back-boiler-gas-fire',
    room: 'kitchen',
    confidence: 'indicative',
    costItem: 'heating',
    regulation: 'gsiur-1998',
    basis: 'legal',
    look: 'Look for a wall-mounted gas fire on the chimney breast, or other signs of a back boiler.',
    means: 'A gas fire on the chimney can hide an old ‘back boiler’. These cost more to replace, so ask what heats the house.',
    caveat: 'cannot confirm a back boiler from a photo.',
  },
  {
    key: 'boiler-old-wall-mounted',
    room: 'kitchen',
    confidence: 'indicative',
    costItem: 'heating',
    regulation: 'boiler-plus',
    basis: 'legal',
    look: 'Look for an older wall-mounted boiler, with a dated casing or a pilot light you can see.',
    means: 'Old boilers often need replacing soon. Ask its age and for the gas safety record.',
    caveat: 'a tidy old boiler may still work.',
  },

  // ---- BATHROOM -----------------------------------------------------------
  {
    key: 'bathroom-coloured-suite',
    room: 'bathroom',
    confidence: 'strong',
    costItem: 'bathroom',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for a coloured suite — avocado, pink or primrose.',
    means: 'A coloured bath and basin usually means an old bathroom. Budget for a new suite.',
    caveat: 'cosmetic only.',
  },
  {
    key: 'bathroom-no-extractor',
    room: 'bathroom',
    confidence: 'indicative',
    costItem: 'bathroom',
    regulation: 'part-f',
    basis: 'standard',
    look: 'Look for a bathroom with no extractor fan and no window.',
    means: 'Bathrooms need good air flow. If there is no window or fan, check for a working extractor.',
    caveat: 'a fan may be out of shot.',
  },
  {
    key: 'bathroom-black-mould',
    room: 'bathroom',
    confidence: 'indicative',
    costItem: 'damp',
    regulation: 'hhsrs',
    basis: 'legal',
    look: 'Look for black mould in the ceiling corners, or around the seal.',
    means: 'Black mould in corners usually means poor air flow. It is a prompt to check ventilation, not proof of a big damp problem.',
    caveat: 'a photo cannot tell condensation from a leak.',
  },
  {
    key: 'bathroom-socket',
    room: 'bathroom',
    confidence: 'indicative',
    costItem: 'rewire',
    regulation: 'bs7671',
    basis: 'standard',
    look: 'Look for a socket inside the bathroom.',
    means: 'Sockets are not allowed in most parts of a bathroom. If you see one, get it checked.',
    caveat: 'needs an EICR.',
  },

  // ---- LIVING ROOM / RECEPTION -------------------------------------------
  {
    key: 'radiators-single-panel',
    room: 'living',
    confidence: 'weak',
    costItem: 'heating',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for single-panel radiators.',
    means: 'Thin single radiators are older. They may need upgrading for warmth and a better energy rating.',
    caveat: 'a single panel can be adequate for a small room.',
  },
  {
    key: 'storage-heaters',
    room: 'living',
    confidence: 'strong',
    costItem: 'heating',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for electric storage heaters or panel heaters, and no radiators.',
    means: 'Big brick-style wall heaters mean no gas central heating. Adding it is a large cost — check what is there.',
    caveat: 'some flats are electric-only by design.',
  },
  {
    key: 'windows-single-glazed',
    room: 'living',
    confidence: 'strong',
    costItem: 'windows',
    regulation: 'part-l',
    basis: 'legal',
    look: 'Look for single-glazed windows — one pane, slim frames.',
    means: 'Single glazing usually means new windows in your budget, and it lowers the energy rating.',
    caveat: 'some conservation areas restrict uPVC.',
  },
  {
    key: 'artex-textured-ceiling',
    room: 'living',
    confidence: 'indicative',
    costItem: 'plastering',
    regulation: 'car-2012',
    basis: 'legal',
    look: 'Look for Artex or textured ceilings in an older-looking property.',
    means: 'Textured ‘Artex’ ceilings in older homes can contain asbestos. Do not scrape it. Get it tested before any work.',
    caveat: 'only a lab test confirms — you cannot see it.',
  },
  {
    key: 'cracks-window-corners',
    room: 'living',
    confidence: 'weak',
    costItem: 'plastering',
    regulation: 'hhsrs',
    basis: 'legal',
    look: 'Look for cracks tracking from the corners of windows and doors.',
    means: 'Cracks near windows can be harmless or a sign of movement. A surveyor should look — do not guess from a photo.',
    caveat: 'photos cannot judge crack seriousness.',
  },

  // ---- BEDROOM ------------------------------------------------------------
  {
    key: 'bedroom-very-small',
    room: 'bedroom',
    confidence: 'indicative',
    costItem: null,
    regulation: 'si-2018-616',
    basis: 'legal',
    look: 'Look for a very small bedroom, where the bed fills the room.',
    means: 'If a bedroom looks tiny, measure it on the floor plan. For a shared house (HMO) a single room must be at least 6.51 square metres.',
    caveat: 'wide lenses distort size; use the floor plan.',
  },
  {
    key: 'bedroom-ceiling-stain',
    room: 'bedroom',
    confidence: 'indicative',
    costItem: 'damp',
    regulation: 'hhsrs',
    basis: 'legal',
    look: 'Look for staining on a bedroom ceiling below a bathroom or the roof.',
    means: 'A brown stain often means water, but it can also be nicotine, rust or old adhesive. Ask what caused it and whether it was fixed.',
    caveat: 'cannot tell the cause from a photo, or whether it was fixed.',
  },

  // ---- HALLWAY & STAIRS ---------------------------------------------------
  {
    key: 'hall-consumer-unit-understairs',
    room: 'hall',
    confidence: 'indicative',
    costItem: 'rewire',
    regulation: 'bs7671-421',
    basis: 'standard',
    look: 'Look for an old consumer unit or meter under the stairs.',
    means: 'An old fuse box under the stairs is common. A new one there must be metal. Have the electrics tested.',
    caveat: 'EICR needed.',
  },
  {
    key: 'hall-no-smoke-alarm',
    room: 'hall',
    confidence: 'weak',
    costItem: null,
    regulation: 'smoke-co-2022',
    basis: 'legal',
    look: 'Look for a smoke alarm on the landing ceiling.',
    means: 'Rented homes need a smoke alarm on every floor. Do not read too much into a photo — just check on the viewing.',
    caveat: 'alarms are frequently absent from staged photos.',
  },
  {
    key: 'hall-flat-doors-hmo',
    room: 'hall',
    confidence: 'indicative',
    costItem: 'other',
    regulation: 'hmo-fire-safety',
    basis: 'legal',
    look: 'Look for standard flat internal doors in a house laid out as separate rooms.',
    means: 'If you plan a shared house, ordinary doors often must become fire doors. Add that to your costs.',
    caveat: 'fire-door need depends on use/licensing.',
  },

  // ---- LOFT ---------------------------------------------------------------
  {
    key: 'loft-no-insulation',
    room: 'loft',
    confidence: 'strong',
    costItem: 'decoration',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for a loft with no insulation, or thin insulation between the joists.',
    means: 'If the loft shows bare joists, it may need insulation. That is cheap and helps the energy rating.',
    caveat: 'insulation may sit under boarding out of view.',
  },
  {
    key: 'loft-header-tank',
    room: 'loft',
    confidence: 'strong',
    costItem: 'heating',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for a cold water tank or header tank in the loft.',
    means: 'A water tank in the loft means an older heating system. Fine to keep, but note it if you plan a combi boiler.',
    caveat: 'not a defect; just a system type.',
  },
  {
    key: 'loft-spray-foam',
    room: 'loft',
    confidence: 'strong',
    costItem: 'roof',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for spray foam insulation on the underside of the roof.',
    means: 'Spray foam under the roof can put off some mortgage lenders. Get it checked — removal can be costly.',
    caveat: 'foam type matters.',
  },
  {
    key: 'loft-daylight-through-roof',
    room: 'loft',
    confidence: 'strong',
    costItem: 'roof',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for daylight coming through the roof boards in a loft shot.',
    means: 'Daylight through the roof means water can get in too. Treat this as a roof job to price.',
    caveat: 'rare in listing photos.',
  },

  // ---- EXTERIOR FRONT -----------------------------------------------------
  {
    key: 'roof-sagging-ridge',
    room: 'outside',
    confidence: 'indicative',
    costItem: 'roof',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for a sagging or dipping ridge line, or an uneven slope.',
    means: 'A roof that dips in the middle can mean tired timbers. A roofer or surveyor should look.',
    caveat: 'camera angle can exaggerate.',
  },
  {
    key: 'roof-slipped-tiles',
    room: 'outside',
    confidence: 'indicative',
    costItem: 'roof',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for widespread slipped, missing or mossy tiles and slates.',
    means: 'A few loose tiles is a repair. Lots of slipped tiles across the roof can mean a re-roof — price both.',
    caveat: 'photos rarely show the whole roof.',
  },
  {
    key: 'pointing-render-failed',
    room: 'outside',
    confidence: 'indicative',
    costItem: 'externals',
    regulation: 'part-c',
    basis: 'standard',
    look: 'Look for cracked or missing pointing, spalling brick, or failed render and pebbledash.',
    means: 'Crumbling mortar or cracked render lets water in. Budget for repairs and check for damp inside.',
    caveat: 'cannot judge depth from a photo.',
  },
  {
    key: 'dpc-bridging',
    room: 'outside',
    confidence: 'indicative',
    costItem: 'damp',
    regulation: 'part-c',
    basis: 'standard',
    look: 'Look for ground or paving above the damp-proof course, or render lapped over it.',
    means: 'If the path or soil sits above the damp course, damp can bridge into the wall. Worth checking inside the ground-floor walls.',
    caveat: 'cannot confirm internal damp from this alone.',
  },
  {
    key: 'timber-windows-rot',
    room: 'outside',
    confidence: 'indicative',
    costItem: 'windows',
    regulation: 'part-l',
    basis: 'legal',
    look: 'Look for old timber windows with peeling paint, or rot you can see.',
    means: 'Flaking paint on wooden windows can hide rot. Check the frames on the viewing.',
    caveat: 'paint condition ≠ rot; needs poking on the viewing.',
  },
  {
    key: 'chimney-stack-defects',
    room: 'outside',
    confidence: 'indicative',
    costItem: 'roof',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for a leaning or cracked chimney stack, loose pots, or failed flashing.',
    means: 'A leaning chimney or gaps around its base can mean repairs. Add it to the check list.',
    caveat: 'hard to judge from ground level.',
  },

  // ---- EXTERIOR REAR / GARDEN --------------------------------------------
  {
    key: 'flat-felt-roof-rear',
    room: 'outside',
    confidence: 'indicative',
    costItem: 'roof',
    regulation: null,
    basis: 'practitioner',
    look: 'Look for a single-storey rear extension with a flat felt roof.',
    means: 'Flat felt roofs do not last as long as tiled ones. Ask its age and check for pooling water.',
    caveat: 'age unknown from a photo.',
  },
  {
    key: 'knotweed-overgrown-garden',
    room: 'garden',
    confidence: 'weak',
    costItem: 'externals',
    regulation: 'wca-1981',
    basis: 'legal',
    look: 'Look for an overgrown garden, or tall bamboo-like stems near the house.',
    means: 'Overgrown gardens hide costs. If you see tall bamboo-like stems, ask about Japanese knotweed — but only a specialist can confirm it.',
    caveat: 'most photos cannot confirm knotweed, and it is only obvious in season.',
  },
  {
    key: 'outbuilding-asbestos-roof',
    room: 'garden',
    confidence: 'indicative',
    costItem: 'externals',
    regulation: 'car-2012',
    basis: 'legal',
    look: 'Look for an old outbuilding, or a corrugated grey garage roof.',
    means: 'Old corrugated grey garage roofs can be asbestos cement. Do not break them. Get advice on safe removal.',
    caveat: 'only testing confirms.',
  },

  // ---- GARAGE / OUTBUILDING ----------------------------------------------
  {
    key: 'garage-consumer-unit',
    room: 'outside',
    confidence: 'indicative',
    costItem: 'rewire',
    regulation: 'bs7671-421',
    basis: 'standard',
    look: 'Look for a consumer unit or wiring in a detached garage.',
    means: 'Garage wiring counts too. If there is an old board out here, include it in the electrical check.',
    caveat: 'EICR needed.',
  },

  // ---- ANY VIEW / WHOLE LISTING ------------------------------------------
  {
    key: 'no-rear-photo',
    room: 'any',
    confidence: 'weak',
    costItem: null,
    regulation: null,
    basis: 'practitioner',
    look: 'Look for whether there is any photo of the back of the house at all.',
    means: 'No photo of the back of the house? Not always bad, but ask why and see it before you offer.',
    caveat: 'absence is a prompt, not evidence.',
  },
  {
    key: 'fresh-paint-patch',
    room: 'any',
    confidence: 'weak',
    costItem: 'decoration',
    regulation: 'hhsrs',
    basis: 'legal',
    look: 'Look for fresh paint in isolated spots — one wall, or one corner.',
    means: 'One freshly painted patch can hide a stain. Look closely at that spot on the viewing.',
    caveat: 'fresh paint is usually just fresh paint.',
  },
  {
    key: 'wide-angle-photos',
    room: 'any',
    confidence: 'indicative',
    costItem: null,
    regulation: null,
    basis: 'practitioner',
    look: 'Look for whether every photo is wide-angle or fisheye.',
    means: 'Wide-angle photos make rooms look bigger. Always check the floor plan measurements.',
    caveat: 'use the floor plan and stated areas.',
  },
  {
    key: 'no-kitchen-bathroom-photo',
    room: 'any',
    confidence: 'indicative',
    costItem: null,
    regulation: null,
    basis: 'practitioner',
    look: 'Look for whether the kitchen or the bathroom is missing from the photos.',
    means: 'No kitchen or bathroom photo? Not always a bad sign, but ask to see the room before you offer.',
    caveat: 'a genuine signal more often than not, but still just a prompt.',
  },
];

/**
 * WITHHELD — the mechanism, currently EMPTY.
 *
 * An entry here is an honest "we have this cue, we are not showing it, and here
 * is why" rather than a silent deletion. Two cues sat here when the library
 * landed: #1 and #2 both opened by asserting the photograph contained the
 * thing. The operator reworded their openings and they now ship, so the list is
 * empty and all forty are served.
 *
 * TO WITHHOLD ONE: move the cue in here with a `reason`. A test proves every
 * entry really does fail the honesty guard, so nothing can be parked here on
 * taste alone, and another proves nothing here can reach a user.
 */
export const WITHHELD: readonly { cue: RefurbCue; reason: string }[] = [
  // Empty: all forty of the research are served. The mechanism stays because
  // the next paste may need it, and an entry here is an honest "we have this,
  // we are not showing it, here is why" rather than a silent deletion.
];

/** True once the operator's research is in. Nothing is served until it is. */
export function libraryReady(): boolean {
  return CUES.length > 0 && Object.keys(REGULATIONS).length > 0;
}
