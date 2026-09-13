# Extension feature flags

The Chrome side panel's own switches, in `packages/extension/src/features.ts`.
The web app's flags are separate, in `docs/FEATURE_FLAGS.md` — the two products
release at different speeds (the web app deploys in a minute; the extension
waits on a store review), so they do not share a switchboard.

Every flag here has a row, and every row a flag: `traceplan.test.ts` fails the
build if they drift.

| Flag | Default | What it turns ON | What OFF looks like |
| --- | --- | --- | --- |
| `traceplan` | on | **The floorplan room tracer** (T1): a "Trace a room" control on the floor-plan card, opening a hand-rolled SVG surface over the listing's own floorplan. The user sets a scale by tapping both ends of a printed dimension and typing its real length, then taps the room's corners — a magnifier loupe sits **above** the finger with a crosshair, and the corner commits on lift at the crosshair, not under the pad. One finger places and drags corners; two fingers pinch-zoom and pan. Area comes from the shoelace formula on the scaled vertices, shown to one decimal with an honest ±10% range. Undo, Close room and Start again are always on screen. | Off: the panel is **exactly as it is today**. No trace control renders, no surface is built, no `src/traceplan/` code runs, and the existing measure tool is untouched. Nothing is persisted either way in T1, so there is nothing to lose or migrate. |
