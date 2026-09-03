# CLAUDE.md — Gil & Bricks Deal Analyser

## What this is
Free UK (England & Wales only) property deal-analyser web app for self-investors
and deal sourcers. Operator is NON-TECHNICAL. Simplicity is a HARD LAW: if a
choice adds user confusion, it is wrong. £0 running cost is a HARD constraint.
Live at: https://gil-bricks-app.gil-782.workers.dev

## Golden rules (never violate)
1. SIMPLICITY over cleverness. Plain English everywhere. No jargon without an
   'i' tooltip (<=20 words) + a show-the-maths accordion.
2. CONFIG-DRIVEN, NOT CODE. Strategies, rates, quiz, copy, site identity all live
   in config (StrategyConfig objects, rates.json, quiz.json, site.config.ts).
   Adding/tuning a strategy = edit config, never touch engines.
3. ONE of each engine: ONE ComparablesEngine, ONE ValuationEngine, ONE
   config-driven DealAnalyser shell. Never fork them per strategy.
4. NAME-AGNOSTIC: every user-facing name/domain/tagline/social/asOf reads from
   site.config.ts. The site name is TBD — never hardcode it.
5. £0: only Cloudflare free tier + free GitHub Actions. No paid service in the
   request path. If a task implies paid infra, STOP and flag it.
6. NEVER send email from the app. Marketing = Kit outbox row + Worker push only.
7. NO cookie banner (strictly-necessary only). NO phone capture. NO scraping.
   NO named lenders. NO live asking prices/rents. See docs/exclusions.md.
8. England & Wales ONLY — gate on ONSPD CTRY (E92000001 / W92000004); reject
   Scotland/NI gracefully.

## Stack
- Astro (static-first), built to dist/, deployed as Cloudflare Workers static assets.
- wrangler v4, wrangler.jsonc (NOT toml). Recent compatibility_date.
- Auth/Kit endpoints = Worker code (server-side); everything else prerendered.
- D1 (accounts, saved_deals, kit_outbox) created with --jurisdiction eu.
  There is NO UK-only D1 residency — never claim one. EU jurisdiction + UK
  adequacy is the honest statement.
- R2: per-postcode-sector JSON (primary query path) + Parquet + EW .pmtiles.
- MapLibre GL + Protomaps namedFlavor("dark"), self-hosted glyphs/sprites.
- Data pipeline: GitHub Actions (PUBLIC repo) monthly -> wrangler r2 object put -> manifest.json.

## Deal pipeline (LOCKED boundaries — buy-side, self-filling)
- A deal can ONLY be born from an ANALYSER PAYLOAD. NO manual "add a property",
  no off-market/agent-call entry — ever. This keeps the pipeline zero-maintenance:
  deals enter themselves. Enforced by construction: the only deal-creating helper
  (`upsertPipelineDeal`, packages/web/src/worker/lib/pipeline.ts) takes a BRANDED
  `AnalyserDealPayload` produced solely by `parseAnalyserDeal`. Never add another
  `INSERT INTO deals` path — a test (pipeline.test.ts "no-manual-entry") fails loudly if you do.
- Buy-side ONLY, ends at purchase. Nothing investor-facing (no packaging/packs/
  sharing/sending), nothing about teaching/courses/badges/streaks, nothing about
  owning/letting/tenancies/tax. The spine is RE-SCORING as facts arrive; NO new
  formulas — always reuse @gil-bricks/core. Stage/fact KEYS are stable in the DB;
  display copy lives in src/config/pipeline.ts. The 100 cap counts LIVE deals only.

## Data contracts (LOCKED — changing these = versioned migration, never in place)
- sector-JSON schema is versioned: every file + manifest.json carry schemaVersion.
- manifest.json is the single as-of source; UI reads dataAsOf from it.
- Canonical metric definitions live in the maths lib and are LOCKED (cash-in
  includes SDLT; ROI/yield definitions; money-left-in). See docs/definitions.md.

## Money & tax
- ROI + yield are the headline metrics EVERYWHERE (deal-sourcer terminology).
- SDLT/LTT branch from ONSPD CTRY via rates.json (marginal band engine).
- Welsh LTT higher rates = STANDALONE band table (£180k first band), never
  main+surcharge. England surcharge = +5% every band (from 31 Oct 2024).
- rates.json is effective-dated and holds flip tax rates too. Editable, no code change.
- Valuation applies NO per-attribute % adjustments. Maths = last-sold x UKHPI
  indexation blended with area £/sqft x floor area; 5/10/20% margins as a plain range.

## Style / a11y (LOCKED brand)
- Lime #dcff00 = highlights/borders/icons/CTA fills with near-black text.
  NEVER lime background under white text (fails contrast).
- Dark gradient bg 180deg #070014->#1d022f->#230138->#050008. Body white / 70% white.
- Glass cards: rgba(255,255,255,0.05), blur(12px) + -webkit-, 1px lime border,
  radius 16px; @supports opaque fallback; honour prefers-reduced-transparency;
  reduce blur on touch.
- Self-hosted WOFF2 Montserrat (600/700/800) + Poppins (400/500/600),
  font-display swap, <150KB. NEVER Google Fonts CDN (GDPR).
- WCAG 2.1 AA target. Tooltips: hover+focus+tap, aria-describedby, dismissible.

## Workflow
- Use PLAN MODE for any new sprint before writing code; present the plan first.
- Leave CLEAN SEAMS for the operator's final design pass (name, logo, colours
  tokenised; components accept slots). Never bake operator-manual items into logic.
- After each sprint, the verification gate in ROADMAP.md must demonstrably pass.
- When you get something wrong, add a line here so it never repeats.

## Do NOT (permanent exclusions)
LHA / Section 21 / Renters' Rights content / SpareRoom / student-employment demand /
commercial HMO valuation / portfolio tracker / phone capture / time-on-market /
auction data / EPC-C/MEES warnings / per-council HMO links / bedrooms column in comps /
bathrooms-parking-garden as comp filters / live prices / scraping / Brevo /
email from app / cookie banner / named lenders.
