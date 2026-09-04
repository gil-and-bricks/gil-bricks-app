# Feature flags

The ONE place a user-facing feature is switched on or off is
`packages/web/src/config/features.ts`. Flip a boolean there, rebuild, deploy —
that is the whole rollback. No flag lives anywhere else (not in
`site.config.ts`, not in env vars, not in a component); a test
(`src/config/reversibility.test.ts`, check A) fails if one appears elsewhere, and
`src/config/features.test.ts` fails if a flag exists in code without a row here.

| Flag | Default | What it turns ON | What happens when it's OFF |
|---|---|---|---|
| `dealScore` | on | The 0–10 **Deal Score** chip and the "what's holding it back" note on every analyser verdict (all four strategies). | The verdict banner, lever line and tiles still show exactly as before the score existed. Nothing is scored; a saved deal carries no score, so the pipeline board shows "Tap to score this" / "Add … to score this" cards. |
| `dealPipeline` | on | The **deal pipeline**: the board at `/deals` (stages, moves, park/kill, the today line, the counter), the save-to-pipeline mirror and the `/api/deals/*` routes. | `/deals` redirects to `/account`, which shows the flat saved-deals list. Saving a deal still works (it is written to `saved_deals` as before). The pipeline-only API routes (`/stage`, `/dead`, `/score`) answer 404; save, list and delete keep working as before. Nothing is deleted — the `deals` tables keep their rows for when the flag comes back. |
| `stickyVerdict` | on | The **sticky verdict bar** on the analyser pages (N1): Deal Score + tier colour + the verdict line pinned under the header, updating in place as inputs change; tap to expand; jump to the full card. Mounted ONCE on the shared analyser shell, so all four strategies inherit it. | No bar, no live region of its own. The verdict card is the only place the score shows and its banner is the polite live region again — byte-for-byte the pre-N1 analyser. Needs `dealScore`: with `dealScore` off there is nothing to show, so the bar is off regardless (`stickyVerdictActive()`). |

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
