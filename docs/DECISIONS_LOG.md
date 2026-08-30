# Decisions Log

A running record of choices made while building Gil & Bricks. Newest sprint at the top.

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
