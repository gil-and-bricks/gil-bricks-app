# ROADMAP — Gil & Bricks Deal Analyser

How the app gets built, one phase at a time. A phase is finished only when its
gate demonstrably passes (see CLAUDE.md → Workflow).

| Phase | Name | Objective | Gate | Status |
|---|---|---|---|---|
| 0 | Human setup | Operator accounts and access in place: Cloudflare, GitHub, Kit, wrangler + gh authenticated. | Operator can log in to every service; `wrangler whoami` and `gh auth status` both pass. | **Done** |
| 1 | Scaffold + design system | Astro static app live on Workers static assets, plus the locked brand: colour tokens, dark gradient, glass cards, self-hosted fonts. | Live URL returns 200; design tokens render exactly per CLAUDE.md style rules; `npm run build` clean. | **Done** — S1.1 scaffold + S1.3 design system; live at https://gil-bricks-app.gil-782.workers.dev |
| 2 | Data pipeline | Public-repo GitHub Actions job builds monthly per-postcode-sector JSON + Parquet + E&W .pmtiles into R2, stamped by manifest.json. | Fresh manifest.json in R2 with correct dataAsOf; spot-checked sector files carry schemaVersion; monthly run completes on free tier. | In progress — S2.1 schema; S2.2 full E&W build; S2.3 EPC £/sqm live (93.7% matched); Parquet + pmtiles remain |
| 3 | Shared engines | The ONE ComparablesEngine, ONE ValuationEngine, config-driven DealAnalyser shell, maths lib + effective-dated rates.json. | Unit tests pass for every locked definition, incl. SDLT/LTT band cases (England +5% surcharge; Welsh standalone table). | **Done** — maths lib, rates engine, ComparablesEngine + ValuationEngine all live on real data; gate tests pass |
| 4 | Strategy analysers | Every strategy is a StrategyConfig object running on the one shell — no per-strategy forks. | A brand-new test strategy can be added by config edit alone — zero engine changes. | **Done** — shell + all four verdicts live. Gate passes for a config-only strategy reusing a registered verdict island; a genuinely new verdict = one component + one registry line, zero engine/shell changes (see STRATEGY_CONFIG_GUIDE.md) |
| 5 | Area data | Sector-level area stats served from R2 JSON; England & Wales gating via ONSPD CTRY. | Scotland/NI postcodes rejected gracefully; E&W sector lookups return correct, as-of-stamped data. | Not started |
| 6 | Auth + accounts + Kit | Worker endpoints for auth; D1 (EU jurisdiction) accounts, saved_deals, kit_outbox; Worker push to Kit. | Sign-up → save deal → outbox row → Kit push round-trip works on free tier; app sends no email. | Not started |
| 7 | Map | MapLibre GL + Protomaps namedFlavor("dark"), self-hosted glyphs/sprites, E&W .pmtiles from R2. | Map renders with zero third-party CDN requests. | Not started |
| 8 | Tooltips + maths + states | 'i' tooltips (<=20 words) + show-the-maths accordions on every jargon term; loading/empty/error states everywhere. | No jargon without a tooltip; accordion maths reconciles exactly with maths-lib output; tooltip a11y pattern per CLAUDE.md. | Not started |
| 9 | Legal + SEO + analytics | Privacy policy, strictly-necessary-only cookie posture (no banner), meta/sitemap/OG, privacy-friendly analytics. | Verified: no non-essential cookies set; sitemap valid; analytics recording on free tier. | Not started |
| 10 | QA + seams | WCAG 2.1 AA audit, cross-device QA, clean seams: name/logo/colours/tagline all read from site.config.ts. | AA audit passes; renaming the entire site is a site.config.ts-only change. | Not started |
| 11 | Launch | Final name + domain, DNS cutover, go-live checks. | Production domain live over HTTPS; £0/month bill confirmed. | Not started |

## Sprint log
- **S1.1** — 2026-08-30 — Scaffold & first deploy: **complete**. Live at https://gil-bricks-app.gil-782.workers.dev
- **S1.2** — 2026-08-30 — Rulebook & roadmap files (CLAUDE.md, ROADMAP.md, docs/definitions.md, docs/exclusions.md): **complete**.
- **S1.3** — 2026-08-30 — Design system: brand tokens, self-hosted @fontsource fonts, GlassCard/Button/SectionHeading primitives, Base layout, site.config.ts, /styleguide; holding page rebuilt: **complete**.
- **S2.1** — 2026-08-30 — Locked data schema v1 (docs/DATA_SCHEMA.md), hand-authored CF37 1 fixture on R2 (base URL https://pub-ed7263f454104eb1a02055393ee15800.r2.dev), typed data client + 20 Vitest tests: **complete**.
- **S2.2** — 2026-08-30 — Real pipeline: PPD (yearly parts) + ONSPD (May 2026) → 8,146 E&W sector files (605,018 sales, 12-month window) on R2; monthly data-refresh + weekly keepalive workflows: **complete**.
- **S2.3** — 2026-08-30 — EPC floor-area join: streamed 8.26GB bulk (zip never on disk), conservative address matching, 93.7% of sales matched (E 93.8% / W 92.7%), typicalPpsqm live, manifest.epcExtractDate 2026-08-17: **complete**.
- **S3.1** — 2026-08-30 — Maths library: 16 canonical functions with show-the-maths breakdowns, docs/MATHS.md, 40 new tests incl. pipeline parity: **complete**.
- **S3.2** — 2026-08-30 — rates.json engine: effective-dated, source-stamped rates; SDLT/LTT marginal-band engine branching on country (England surcharge table, Welsh standalone higher table); flipTax; constants.ts retired; 21 new tests incl. both official worked examples: **complete**.
- **S3.3** — 2026-08-31 — ComparablesEngine: postcode geocode maps + sectors-index on R2 (additive v1 companions), radius search with per-sector span margins, filters, live include/exclude recalc, portal entry links, live smoke script: **complete**.
- **S3.4** — 2026-08-31 — ValuationEngine: UKHPI companion on R2 (manifest.ukhpiMonth real), indexed-last-sale + area-£/sqm blend, plain-words confidence ladder, no per-attribute adjustments: **complete**. Phase 3 gate passes.
- **S3.5** — 2026-08-31 — Automatic Land Registry sale-history lookup (official linked-data API): auto line A with user override, ambiguity returned not guessed, transaction detail fetch for comps: **complete**.
- **S4.1** — 2026-08-31 — Analyser shell: config-driven routes ×4 + landings + /comparables + /transaction, live valuation/comps/show-the-maths in Preact islands, URL-state sharing, Lighthouse 100×4: **complete**.
- **S4.2** — 2026-08-31 — BTL verdict: Green/Amber/Red with plain copy + lever, ROI/yield/cashflow/ICR/tax tiles with breakdowns, SDLT/LTT auto by country, Section 24 vs company, thresholds in config, STRATEGY_CONFIG_GUIDE.md: **complete**.
- **S4.3** — 2026-08-31 — BRRRR verdict: locked all-money-out terminology from the lib, bridging model, max-price + ARV-needed bisection tiles, shared rentalCore extraction, ARV pre-fill with caution note: **complete**.
- **S4.4** — 2026-08-31 — Flip verdict: after-tax ROI hero, personal-vs-company tax side by side, VAT into rates.json, forced additional rates for companies, detachable profit-on-GDV module, max-offer/sale-price-needed levers: **complete**.
- **S4.5** — 2026-08-31 — HMO verdict: room-income model, bricks-and-mortar only, statutory room-size checker, licensing + planning explainers, sui-generis stop: **complete**. Phase 4 gate passes.
- **S4.6** — 2026-08-31 — Analyse-as switcher (shared state preserved, strategy params reset) + config-driven /start chooser scaffold (quiz.json + build-gate validation + operator guide; algorithm deliberately deferred to the operator): **complete**.
- **S5.1** — 2026-08-31 — Area Data dashboard (/area-data: sold stats, by-type IQM table, country HPI trend, activity sparkline, IMD 2025/WIMD 2025 deprivation, strategy strip) + real homepage with postcode quick-search: **complete**.
