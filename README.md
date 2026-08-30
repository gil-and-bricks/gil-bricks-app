# Gil & Bricks

Static-first [Astro](https://astro.build) site deployed to
[Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/).

Currently a single holding page: **Gil & Bricks — coming soon**.

## Live URL

https://gil-bricks-app.gil-782.workers.dev

## Project scaffold

```
src/pages/index.astro   the one page (markup + inline styles)
public/                 static files copied verbatim into the build
astro.config.mjs        Astro config — static output, no adapter
wrangler.jsonc          Cloudflare Worker config — serves ./dist as static assets
docs/DECISIONS_LOG.md   why things are the way they are
```

Requires Node 24 (this machine uses nvm). Install dependencies once with `npm install`.

## Commands

| What | Command |
| --- | --- |
| Local dev server | `npm run dev` |
| Build | `npm run build` |
| Preview the build locally | `npm run preview` |
| Deploy | `npx wrangler deploy` |

`npm run build` writes the site to `dist/`. `npx wrangler deploy` uploads whatever
is currently in `dist/`, so always build before deploying.
