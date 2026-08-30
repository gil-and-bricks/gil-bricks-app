# ROADMAP — Gil & Bricks Deal Analyser

How the app gets built, one phase at a time. A phase is finished only when its
gate demonstrably passes (see CLAUDE.md → Workflow).

| Phase | Name | Objective | Gate | Status |
|---|---|---|---|---|
| 0 | Human setup | Operator accounts and access in place: Cloudflare, GitHub, Kit, wrangler + gh authenticated. | Operator can log in to every service; `wrangler whoami` and `gh auth status` both pass. | **Done** |
| 1 | Scaffold + design system | Astro static app live on Workers static assets, plus the locked brand: colour tokens, dark gradient, glass cards, self-hosted fonts. | Live URL returns 200; design tokens render exactly per CLAUDE.md style rules; `npm run build` clean. | **Done** — S1.1 scaffold + S1.3 design system; live at https://gil-bricks-app.gil-782.workers.dev |
| 2 | Data pipeline | Public-repo GitHub Actions job builds monthly per-postcode-sector JSON + Parquet + E&W .pmtiles into R2, stamped by manifest.json. | Fresh manifest.json in R2 with correct dataAsOf; spot-checked sector files carry schemaVersion; monthly run completes on free tier. | Not started |
| 3 | Shared engines | The ONE ComparablesEngine, ONE ValuationEngine, config-driven DealAnalyser shell, maths lib + effective-dated rates.json. | Unit tests pass for every locked definition, incl. SDLT/LTT band cases (England +5% surcharge; Welsh standalone table). | Not started |
| 4 | Strategy analysers | Every strategy is a StrategyConfig object running on the one shell — no per-strategy forks. | A brand-new test strategy can be added by config edit alone — zero engine changes. | Not started |
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
