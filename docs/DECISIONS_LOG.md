# Decisions Log

A running record of choices made while building Gil & Bricks. Newest sprint at the top.

## 2026-08-30 — Sprint S1.3: Design system, brand tokens, site.config

- **First pass rebuilt to the full brief** — the sprint message first arrived truncated mid-step-2; work built from CLAUDE.md's locked brand was reconciled to the full spec when it arrived (fonts switched from direct downloads to @fontsource packages; public/fonts/, fonts.css and BaseLayout.astro removed in favour of the spec'd layout and font setup).
- **Font payload: 84KB woff2** (Montserrat 600/700/800 ~20KB each, Poppins 400/500/600 ~8KB each, latin subset) — under the 150KB budget; @fontsource also emits 108KB of legacy .woff fallbacks, but any one browser downloads a single format.
- **CSS build targets pinned in astro.config.mjs** — verification caught the CSS minifier stripping `-webkit-backdrop-filter` (default targets assume Safari 18+); Safari ≤17 would have silently lost the glass blur. Targets now include safari15 so the locked prefix survives.
- **prefers-contrast: more also gets the solid card** — prefers-reduced-transparency is Chromium-only today, so the contrast preference doubles as a fallback trigger.
- **Inner-glow values chosen** (spec said "subtle", no numbers): white hairline top inset + faint lime bloom, both under 10% opacity.
- **Href-less Buttons render type="button"** — prevents accidental form submits if the primitive is ever used inside a form.
- **Styleguide swatch rows wrap** — verification caught horizontal overflow at ≤375px widths (WCAG reflow); rows now flex-wrap and token values can break.
- **Favicon replaced** — the scaffold shipped the Astro logo; now a neutral, name-agnostic brick mark in brand colours (no lettering, so a future rename costs nothing).
- **Phase 1 marked Done in ROADMAP.md** — gate passes: live URL 200, tokens render per CLAUDE.md, build clean.

## 2026-08-30 — Sprint S1.2: Rulebook & roadmap files

- **CLAUDE.md symlink replaced** — the scaffold shipped CLAUDE.md as a symlink to Astro's default AGENTS.md; the rulebook is now the real CLAUDE.md and AGENTS.md symlinks to it, so any agent tooling reads the same rules from one file.
- **ROADMAP status column added** — the spec asked for objective + gate columns; a Status column was added so a non-technical operator can see progress at a glance, with S1.1 marked complete under Phase 1.
- **£/sqft unit note in definitions.md** — EPC floor areas arrive in m², so the locked £/sqft definition carries a one-line conversion note (1 m² = 10.7639 sqft) to keep it computable without changing the formula.
- **Exclusion reasons limited to the three sanctioned rationales** — every entry in docs/exclusions.md is tagged free-data honesty, simplicity, or compliance, matching the sprint brief exactly.
- **LHA exclusion reattributed to simplicity** — verification caught that LHA rates ARE free open data (VOA on gov.uk), so claiming "free-data honesty" would itself be dishonest; the real reason is the annual-update maintenance burden.

## 2026-08-30 — Sprint S1.1: Scaffold & first deploy

- **Astro 7.2.9 (latest stable), `minimal` template, TypeScript `strict`** — the minimal template ships no demo components or example pages, so there was almost nothing to strip; strict TS costs nothing now and prevents loose typing habits later.
- **`output: 'static'` set explicitly in `astro.config.mjs`** — static is already Astro's default, but stating it makes the static-first intent obvious and means a future adapter can't switch the whole site to server rendering by accident.
- **Cloudflare Workers static assets, not Cloudflare Pages** — the sprint calls for Workers static assets; it is Cloudflare's current recommended path for new projects and leaves room to add Worker code later without migrating hosts.
- **No adapter installed** — Workers static assets serve a prebuilt `dist/` directly, so `@astrojs/cloudflare` would add build complexity for no benefit while the site is fully static.
- **`wrangler.jsonc` over `wrangler.toml`** — JSONC allows inline comments and is Cloudflare's current default format for new Workers.
- **`compatibility_date: "2026-08-30"`** — set to today so the Worker runs on current runtime behaviour; pinning it means future runtime changes cannot silently alter this deploy.
- **Wrangler installed as a project devDependency (v4.127.1)** — the deploy command then uses a version pinned in `package-lock.json` rather than whatever `npx` resolves globally, so deploys are reproducible across machines and CI.
- **`workerd` and `fsevents` postinstall scripts allowed in `package.json`** — npm 11 blocks install scripts by default; these two are the Cloudflare runtime and the macOS file watcher, both needed for local dev.
- **workers.dev subdomain: existing `gil-782`** — the account already had a registered subdomain, so wrangler did not prompt for a new one. Live URL: https://gil-bricks-app.gil-782.workers.dev
- **Public GitHub repository `gil-and-bricks/gil-bricks-app`** — as specified in the sprint brief; nothing secret is committed, and `.gitignore` covers `.env*`, `.dev.vars` and `.wrangler/`.
- **No Tailwind, no UI framework, no extra pages** — deliberately deferred; this sprint is only proving the build-and-deploy pipeline end to end.
