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
7. NO cookie banner (strictly-necessary only). NO phone capture ANYWHERE except
   the bridging enquiry form, which needs one because the outcome is a call
   (see "Bridging finance page"). NO scraping.
   NO named lenders. NO live asking prices/rents. See docs/exclusions.md.
8. England & Wales ONLY — gate on ONSPD CTRY (E92000001 / W92000004); reject
   Scotland/NI gracefully.

## Reversibility charter (HARD RULE — rules 1 and 2 enforced by tests)
Everything we build must be switchable off, or swapped for a different design,
without unpicking the rest.
1. Every new user-facing feature ships behind a NAMED flag in the ONE central
   feature-flags config: packages/web/src/config/features.ts, documented in
   docs/FEATURE_FLAGS.md (what it turns on / what off looks like). Flags live
   nowhere else — not site.config.ts, not env vars, not components.
2. No user-facing string, threshold, stage name, rate or brand value may be
   hardcoded. They live in config: strategy thresholds in StrategyConfig,
   rates in rates.json, stage/park/fact/board copy in src/config/pipeline.ts,
   sticky-bar copy in src/config/stickyVerdict.ts, brand colours in tokens.css,
   identity in site.config.ts. New components start at ZERO inline strings.
3. Presentation changes never alter a number. All maths stays in
   @gil-bricks/core; a UI component may format a figure, never compute one.
4. Every sprint is ONE revertible commit: `git revert <sha>` must restore
   the previous product with nothing dangling.
5. Migrations are additive-only (new tables/columns/indexes) and never
   destroy data. Turning a flag off hides a feature; it never deletes rows.
Rules 1-2 are enforced by packages/web/src/config/reversibility.test.ts (flags-in-one-place
+ a positive control on the flag shapes, brand-hex-only-in-tokens,
no-retyped-config-copy, no-thresholds-in-components, and an inline-copy
RATCHET: existing files may only go down, new files are held to zero) and
features.test.ts (every flag documented). The ratchet counts JSX/Astro text,
user-facing attributes, unknown props on our own components and sentence-like
literals — not every single string; docs/FEATURE_FLAGS.md states the scope.
The baseline is grandfathered debt (617 strings / 35 files on 2026-09-04) —
pay it down, never raise it. Rules 3-5 (no maths in the UI, one revertible
commit per sprint, additive-only migrations) are review discipline, not tests:
say so rather than pretending a test covers them. Page prose under src/pages and src/content is content, not config,
and is out of the ratchet's scope on purpose.

## Copy rules (HARD RULE — enforced by packages/web/src/config/copy.test.ts)
Wordiness is a navigation problem: the more there is to read, the harder the
page is to use. These are permanent.
1. No visible explanatory block over TWO sentences or about 30 words. Anything
   longer moves into the 'i' tooltip or the show-the-maths accordion — both
   already exist for exactly this.
2. One idea per sentence. Sentences under 20 words. Split anything longer.
3. A field gets NO description by default. It earns one only if it stops a
   wrong entry, says where to find the number, or defines a term a beginner
   genuinely will not know. Otherwise delete it.
4. Labels carry their own meaning: the thing plus its unit. "Monthly rent (£)"
   needs nothing underneath it.
5. Active voice, second person, present tense. No filler — never "in order to",
   "please note that", "it is important to understand".
6. Target reading age nine. Not dumbing down: it is how a tired person on a
   phone reads faster.
7. Verdict headlines, levers and Deal Score lines are EXEMPT from shortening —
   naming the binding number IS the plain-English win. Never weaken them.
Every visible string lives in config (src/config/copy.ts, nav.ts, pipeline.ts,
comparables.ts, analyserSections.ts, stickyVerdict.ts, content/microcopy.ts,
and the StrategyConfig fields in @gil-bricks/core) so any word can be changed
without touching code. Exemptions from rule 1 are named in copy.test.ts with a
reason each: accordion bodies and licence attributions. docs/COPY_AUDIT.md is
the record of the N5 pass — every string, its length, and what happened to it.

## Bridging finance page (INTRODUCTION ONLY — treat like a legal document)
/bridging-finance introduces people to ONE broker the operator knows. It is not
a broker, does not advise, does not compare products, does not recommend, and
never states or implies a decision about anyone's finance.
- The page may never say we will find the best rate or deal, name a lender,
  recommend a product, or promise an outcome. Tested in lib/bridging.test.ts.
- Wording lives in src/config/bridging.ts. Any change to it needs the same care
  as a change to the terms: read it as a regulator would.
- The enquiry form takes a PHONE NUMBER. That is a deliberate, page-scoped
  exception to the no-phone-capture rule (the outcome is a phone call) — it is
  documented here, in the privacy policy, and beside the field itself.
- Qualification is server-side, two buckets only (qualified / not yet), with
  thresholds in config. No deal data is ever carried into the enquiry; the
  broker does not review deals.
- D1 is written before Kit is called, so an enquiry survives a Kit outage; the
  app itself still never sends email.
- BEFORE THIS PAGE IS PUBLIC: the ICO data-protection fee must be paid.

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
