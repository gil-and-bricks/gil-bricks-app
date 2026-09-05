# Feature flags

The ONE place a user-facing feature is switched on or off is
`packages/web/src/config/features.ts`. Flip a boolean there, rebuild, deploy —
that is the whole rollback. No flag lives anywhere else (not in
`site.config.ts`, not in env vars, not in a component); a test
(`src/config/reversibility.test.ts`, check A) fails if one appears elsewhere, and
`src/config/features.test.ts` fails if a flag exists in code without a row here.

| Flag | Default | What it turns ON | What happens when it's OFF |
|---|---|---|---|
| `dealScore` | on | The 0–10 **Deal Score** chip and the "what's holding it back" note on every analyser verdict (all four strategies). | The verdict banner, lever line and tiles still show exactly as before the score existed. Nothing is scored, and the pipeline board stops asking for one: every card shows its figure quietly instead of a "Tap to score this" prompt that could never complete. |
| `dealPipeline` | on | The **deal pipeline**: the board at `/deals` (stages, moves, park/kill, the today line, the counter), the save-to-pipeline mirror and the `/api/deals/*` routes. | `/deals` redirects to `/account`, which shows the flat saved-deals list. Saving a deal still works (it is written to `saved_deals` as before). The pipeline-only API routes (`/stage`, `/dead`, `/score`) answer 404; save, list and delete keep working as before. Nothing is deleted — the `deals` tables keep their rows for when the flag comes back. |
| `stickyVerdict` | on | The **sticky verdict bar** on the analyser pages (N1): Deal Score + tier colour + the verdict line pinned under the header, updating in place as inputs change; tap to expand; jump to the full card. Mounted ONCE on the shared analyser shell, so all four strategies inherit it. | No bar, no live region of its own. The verdict card is the only place the score shows and its banner is the polite live region again — the pre-N1 analyser in behaviour (the markup keeps one N1 addition: the verdict `<h2>` is focusable, which nothing uses while the bar is off). Needs `dealScore`: with `dealScore` off there is nothing to show, so the bar is off regardless (`stickyVerdictActive()`). |
| `sectionOverview` | on | The analyser's **section overview strip** (N2): a scrollable row of jump chips pinned under the sticky verdict bar, the quiet "↑ Back to inputs" link after the verdict card, and the comparables module folded behind its one-line summary ("14 comparable sales · typical £245/sq ft · tap to explore"). Chips are plain anchors — jumping needs no JavaScript — and a chip only renders when its section is actually on the page, so a strategy that has no Area section never shows an Area chip. Mounted ONCE on the shared analyser template, so all four strategies inherit it. | No strip, no back link, and the comparables module is open as it always was. The maths and assumptions accordions stay collapsed either way (they were already collapsed; N2 only swapped the JS accordion for a native `<details>`, which is why that part is not flagged). |
| `segmentedStrategy` | on | The **strategy switcher pinned in the sticky stack** (N3): BTL · Flip · BRRRR · HMO as one segmented control sharing the pinned row with the section chips, the current one filled lime. Four links to four URLs, carrying every shared input across, with arrow keys moving between them. | The switcher renders where it always did — a row of pills inside the page above the verdict card. Exactly one switcher either way. |
| `compsMobile` | on | **Phone-first comparables** (N3): below 640px each sale is a compact card (address, price, date, type/tenure, £/sqft, distance, include toggle) and the table is not built at all; above 640px the table stays and the cards are not built. The seven filters fold into one "Filters · N set" sheet at EVERY width (seven controls dominate a phone and clutter a desktop), with a Reset when any are set. Sorting is table-only, so a phone reads the sales in distance order — noted in DECISIONS_LOG as a deliberate omission. | The 11-column table on every width and the filter strip open above it, exactly as before. The map is load-on-demand either way, and the list is the default view either way. |
| `desktopSplit` | on | The **desktop analyser layout** (N4): from 1024px the verdict card splits into inputs + assumptions on the left and a sticky results rail (Deal Score, verdict, figures including costs) on the right, so the answer stays on screen while you scroll the inputs; from 1100px the section overview becomes a vertical list beside the page instead of a chip strip. Pure CSS over the same DOM — same URL state, same extension handoff, same components. | One column at every width, exactly as before, and the section overview stays the horizontal chip strip. Nothing about the phone layout depends on this flag either way. |
| `navV2` | on | The **grouped header** (an "Analyse" disclosure holding the four strategies, then Area Data, Tools, Finance, with Deals and Account to the right) and the **five-item bottom bar** (Analyse · Area · Tools · Deals · More) where More opens a sheet with Finance, Account, the quiz and the legal pages. | The flat header (Area Data + the four strategies) and the old bottom bar (Area + the four strategies). `/tools` and `/bridging-finance` still exist and are still indexed — they are honest pages either way, just not linked from the nav. |
| `bridgingFinance` | on | The **bridging enquiry** at `/bridging-finance` (F1): the explanation, the sign-in gate, the two-step form, and the `POST /api/bridging` endpoint that qualifies server-side, stores the enquiry in D1 and queues the Kit row. | The page still loads and still explains what bridging is and what the introduction would be, but no form renders and the API answers 404 — nothing can be submitted, and nothing is stored. |
| `toolsSection` | on | The **tools** section (T1): the `/tools` index driven by the registry in `src/config/tools.ts`, and the calculators themselves (currently the HPI equity calculator at `/tools/equity`). Answers are never gated — no email, no sign-in — and saving is offered only after the answer. | `/tools` says nothing is switched on and lists no cards; a tool page still loads and explains itself, but the calculator does not render. The pages stay indexable either way. |

## Known trade-off

With `stickyVerdict` ON, the verdict card's banner is no longer a live region
(the bar is the ONE polite region — two would double-announce). Since N2 that
region carries the score, the tier, the binding headline AND the lever sentence
("A £22,000 lower price or £185 more rent a month would turn this Amber to
Green"). What it still does not read out is the price-vs-evidence cross-check,
which stays in the card for on-demand reading.

## All flags off (proved 2026-09-04, N1)

With every flag `false` the app builds and runs as a coherent product: the
analyser shows inputs → comps → valuation → verdict banner + tiles (no score
chip, no sticky bar, the banner announces to screen readers); Save still works;
`/account` lists saved deals flat; `/deals` redirects to `/account`; the
pipeline API is 404. Nothing half-renders. See DECISIONS_LOG.md → N1.

## What the guardrail covers (and doesn't)

`src/config/reversibility.test.ts` enforces the charter in six checks:
flags only in `features.ts` (A) — in `.ts`, `.tsx` AND `.astro` frontmatter,
covering `siteConfig.features`, a flags object anywhere else, `FEATURE_*`
constants, an exported boolean switch and `import.meta.env` reads (Vite's own
PROD/DEV/SSR/MODE excepted); a positive control that each of those shapes still
matches a probe, so a broken regex fails loudly instead of going blind (A2);
brand HEX only in `tokens.css`, 6- and 8-digit, with one allow-listed
server-rendered page (B); config-owned copy (stage/park/fact labels, board +
sticky copy, the cap message) never re-typed (C); no score/yield/ROI threshold
in a component (D); and an **inline-copy ratchet** (E).

The ratchet counts, per file, in `src/components/**` and `src/lib/**` (TS/TSX)
and the Astro chrome (`src/components/**`, `src/layouts/**`): JSX/Astro text
(including text wrapped around an `{expression}`), strings in user-facing
attributes, any string in an unknown prop on one of our own components, and
sentence-like literals (three or more words) elsewhere. It does NOT count
one- and two-word literals in plain TS, or `throw`/`new Error`/`console`
messages — so it is a ratchet on *copy*, not a proof that no string exists.
A file not in the baseline is held to ZERO, so every NEW component's copy must
live in config; an existing file may only go down (move copy out → lower its
number). The baseline is the honest debt figure: **617 strings across 35
files** on 2026-09-04. Brand-colour `rgba()` tints of the lime (pre-N1, in
`analyser.css`) are not covered by check B — tokenising them is a later job.

Out of scope on purpose: page PROSE under `src/pages/**` and `src/content/**`
(landing, about, legal, styleguide) is content, not configuration; the Worker's
JSON error strings; the extension package. Adding those is a later decision.

## Adding a flag

1. Add the boolean to `FeatureFlags` + `features` in `features.ts` with a
   doc comment (what it turns on, what off looks like).
2. Add a row to the table above.
3. Gate the feature at its ONE entry point (a component's early `return null`,
   a route's redirect, an API's 404) — never sprinkle the flag through maths.
4. Prove the off state: turn it off, build, use the app.

## Retiring a flag

A flag that has been on in production for months may be deleted together
with its `if` — never leave a dead flag behind, and never delete data or a
migration to do it.
