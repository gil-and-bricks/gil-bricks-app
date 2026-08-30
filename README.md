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
src/styles/tokens.css     design tokens: colours, glass, spacing, type scales
src/styles/global.css     base styles: gradient body, headings, focus rings
src/components/           UI primitives: GlassCard, Button, SectionHeading
src/layouts/Base.astro    shared page shell — fonts, tokens, head defaults
src/pages/index.astro     the holding page
src/pages/styleguide.astro  internal brand reference (noindex)
public/                   static files copied verbatim into the build
astro.config.mjs          Astro config — static output, no adapter
wrangler.jsonc            Cloudflare Worker config — serves ./dist as static assets
docs/DECISIONS_LOG.md     why things are the way they are
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
| Deploy | `npx wrangler deploy` |

`npm run build` writes the site to `dist/`. `npx wrangler deploy` uploads whatever
is currently in `dist/`, so always build before deploying.
