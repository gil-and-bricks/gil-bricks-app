# Gil & Bricks

Static-first [Astro](https://astro.build) site deployed to
[Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/).

Currently a holding page built from the locked design system, plus an internal
`/styleguide` reference (noindex, unlinked).

## Live URL

https://gil-bricks-app.gil-782.workers.dev

## Project scaffold

```
src/site.config.ts        site identity — name, tagline, socials (edit here, nowhere else)
src/config/rates.json     every tax rate (SDLT/LTT bands, income/NIC/corporation tax) — edit here, append a dated entry
src/lib/maths/            the canonical maths library (see docs/MATHS.md for plain English)
src/styles/tokens.css     design tokens: colours, glass, spacing, type scales
src/styles/global.css     base styles: gradient body, headings, focus rings
src/components/           UI primitives: GlassCard, Button, SectionHeading
src/layouts/Base.astro    shared page shell — fonts, tokens, head defaults
src/pages/index.astro     the holding page
src/pages/styleguide.astro  internal brand reference (noindex)
src/lib/data/            typed data layer: schema types + R2 client (+ tests)
src/lib/comparables/     the ComparablesEngine: geocode, radius search, filters, sorting
src/lib/valuation/       the ValuationEngine: indexed last sale + area £/sqm, plain confidence
src/lib/landregistry/    official Land Registry sale-history + transaction lookups
data/fixtures/           fixture JSON used by the tests (schema v1 examples)
pipeline/                data pipeline: PPD+ONSPD+EPC ingest, sector JSON build, R2 upload
public/                   static files copied verbatim into the build
astro.config.mjs          Astro config — static output, no adapter
wrangler.jsonc            Cloudflare Worker config — serves ./dist as static assets
docs/DECISIONS_LOG.md     why things are the way they are
docs/DATA_SCHEMA.md       the locked R2 data contract (schema v1)
docs/MATHS.md             every formula in plain English with worked examples
```

Fonts are self-hosted via `@fontsource` packages (Montserrat 600/700/800,
Poppins 400/500/600, latin subset) — no font CDN is ever contacted.

Requires Node 22.12+ (this machine runs Node 24 via nvm). Install dependencies once with `npm install`.

## Commands

| What | Command |
| --- | --- |
| Local dev server | `npm run dev` |
| Build | `npm run build` |
| Preview the build locally | `npm run preview` |
| Run tests | `npm test` |
| Live comparables smoke test | `npm run smoke:comps` |
| Live valuation + sale-history smoke test | `npm run smoke:valuation` |
| Refresh the data (download → build → upload) | `npm run pipeline:download && npm run pipeline:build && npm run pipeline:upload` |
| Deploy | `npx wrangler deploy` |

`npm run build` writes the site to `dist/`. `npx wrangler deploy` uploads whatever
is currently in `dist/`, so always build before deploying.

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
