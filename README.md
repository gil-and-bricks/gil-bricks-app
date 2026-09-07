# PropLaunch — by Gil & Bricks

A free UK (England & Wales only) property deal analyser. Put in a listing and
its numbers; it scores the deal out of ten and says in plain English what is
holding it back, checked against real HM Land Registry sold prices.

Three packages in one npm workspace:

| Package | What it is |
|---|---|
| `packages/core` | `@gil-bricks/core` — ALL the maths: the strategy engines, the Deal Score, the ComparablesEngine, the ValuationEngine, the rates engine, the listing extractors and the extension→analyser handoff. Two figures in the web UI still compute their own percentage — see `docs/AUDIT.md` §2.2. |
| `packages/web` | The site: Astro static pages + Preact islands on Cloudflare Workers, with D1 for accounts and the deal pipeline. |
| `packages/extension` | The published Chrome MV3 side panel that scores a Rightmove or Zoopla listing on the page. |

Live: the homepage, four deal analysers (BTL / flip / BRRRR / HMO) with real
valuation and comparables, four strategy landing pages, `/area-data`,
`/comparables`, `/transaction`, three calculators under `/tools`, the deal
pipeline at `/deals`, accounts, `/start`, `/credit`, `/extension`, and
`/bridging-finance` (gated until the broker's details are real) — plus an
internal `/styleguide` (noindex, unlinked).

**Start here:** `CLAUDE.md` is the rulebook and overrides everything else.
`docs/DECISIONS_LOG.md` is why things are the way they are (newest first).
`docs/AUDIT.md` is the current whole-product audit — read it before you change
anything structural.

## Live URL

https://gil-bricks-app.gil-782.workers.dev

## Project scaffold

```
CLAUDE.md                  the rulebook — golden rules, charters, exclusions (AGENTS.md is a symlink to it)
ROADMAP.md                 phase status
docs/                      DECISIONS_LOG, AUDIT, FEATURE_FLAGS, definitions, exclusions, MATHS, and the operator guides

packages/core/src/
  config.ts                product identity — the ONE source of the name (site.config.ts reads it)
  maths/                   the canonical maths library (docs/MATHS.md explains it in plain English)
  rates.json               every tax rate (SDLT/LTT bands, income/NIC/corporation tax) — append a dated entry
  strategies/              StrategyConfig objects — strategies are config, never code
  strategy-calc/           per-strategy compositions (btl, flip, brrrr, hmo)
  score/                   the Deal Score, the sold-evidence rule and the reverse solver
  comparables/             the ONE ComparablesEngine: geocode, radius search, filters, sorting
  valuation/               the ONE ValuationEngine, and the property-type caveat
  data/                    typed data layer: schema types + R2 client
  landregistry/            official sale-history + transaction lookups
  listing/                 Rightmove/Zoopla extractors, seller signals, the analyser handoff
  evidence/                the ONE evidence-chip rule, shared by board, analyser and panel
  tools/                   the standalone calculators (equity, rental yield, tax examples)

packages/web/src/
  site.config.ts           site identity — reads the name from core; edit the rest here, nowhere else
  config/                  EVERY user-facing string and threshold: copy, nav, pipeline, tools, bridging, credit, quiz.json, features.ts
  config/features.ts       the ONE feature-flags file (docs/FEATURE_FLAGS.md is the rollback sheet)
  styles/                  tokens.css (colours, glass, spacing, type), global.css, analyser.css
  layouts/                 Base + AppShell + ToolShell page shells
  pages/                   the routes
  components/              the Preact islands: analyser, deals, tools, area, auth, finance
  lib/                     browser-side plumbing: deals, auth, map — no maths
  worker/                  the Worker: auth, the API, the Kit outbox, the cron

packages/web/migrations/   D1 migrations, additive only (0001 … 0021)
packages/web/pipeline/     the data pipeline: PPD + ONSPD ingest, sector JSON build, R2 upload
packages/extension/        the Chrome MV3 side panel (entrypoints/, src/, store/)
.github/workflows/         data-refresh (monthly), map-tiles (manual), keepalive
```

Fonts are self-hosted via `@fontsource` packages (Montserrat 600/700/800,
Poppins 400/500/600, latin subset) — no font CDN is ever contacted.

Requires Node 22.12+ (this machine runs Node 24 via nvm). Install dependencies once with `npm install`.

## Commands

Run everything from the repo root. `npm test` and `npm run typecheck` cover all
three packages; `npm run build` builds the site only.

| What | Command |
| --- | --- |
| Install | `npm install` |
| Run every test suite | `npm test` |
| Typecheck every package | `npm run typecheck` |
| Build the site | `npm run build` |
| Build the extension | `npm run build:extension` |
| Local dev server | `npm run dev` |
| Package the extension for the store | `npm run zip -w packages/extension` |
| Live comparables smoke test | `npm run smoke:comps -w packages/web` |
| Live valuation + sale-history smoke test | `npm run smoke:valuation -w packages/web` |
| Apply migrations (local / production D1) | `npm run db:migrate:local -w packages/web` / `db:migrate:remote` |
| Refresh the data | `npm run pipeline:download -w packages/web`, then `pipeline:build`, then `pipeline:upload` |
| Deploy the site | `cd packages/web && npx wrangler deploy` |

**Nothing runs the tests automatically.** There is no CI workflow on push or
pull request — see `docs/AUDIT.md` §2.3. Until there is, `npm test` before a
commit is the only gate.

`npm run build` writes the site to `packages/web/dist/`. `wrangler deploy` uploads
whatever is currently in `dist/`, so always build before deploying. If a sprint
added a migration, apply it to production D1 BEFORE deploying.

## Data pipeline

Monthly GitHub Actions workflow (`data-refresh.yml`) rebuilds every England &
Wales postcode-sector file from HM Land Registry Price Paid Data + the ONS
Postcode Directory and uploads them to the `gil-bricks-data` R2 bucket.
Downloads land in `pipeline/.data/` (gitignored; ~2GB). A weekly `keepalive.yml`
heartbeat stops GitHub disabling the schedule after 60 quiet days. CI needs the
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets and fails with a
clear message if they are missing.

Contains HM Land Registry data © Crown copyright and database right 2026,
licensed under the Open Government Licence v3.0. Contains OS, Royal Mail and
National Statistics data per the ONSPD licence terms (see docs/DATA_SCHEMA.md).
