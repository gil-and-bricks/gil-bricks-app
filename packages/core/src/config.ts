/**
 * Core configuration shared by both products (web app + Chrome extension).
 * These values are identical for both, so they live here rather than in either
 * product's own config — ONE source of truth (CLAUDE.md golden rules 2 & 4).
 *
 * Socials + the per-strategy YouTube links are here so the panel AND the web app
 * read the SAME links. All four YouTube entries point at the channel for now;
 * the operator pastes four playlist URLs in later with NO code change.
 */
export const coreConfig = {
  /**
   * PRODUCT name — the ONE source both products read (golden rule 4). This is the
   * brand users see: PropLaunch. Gil & Bricks is the MAKER, shown as a secondary
   * credit (makerName below). `siteName` stays the field name every consumer already
   * reads, so it now resolves to the product name with no code change downstream.
   */
  siteName: 'PropLaunch',

  /** MAKER credit — shown as a quiet secondary "by Gil & Bricks", never as the
   * primary product name. Its own social channels are in `socials`. */
  makerName: 'Gil & Bricks',

  /**
   * Where the web app is served. The SAME string the extension links to and the
   * site's own liveUrl — one source, so moving to the real domain was one edit
   * (golden rule 4), which is exactly what it turned out to be.
   *
   * DM1 — the product now lives on its own domain. The old
   * gil-bricks-app.gil-782.workers.dev address still answers and 301s every
   * page here; see worker/lib/canonical.ts for what it keeps serving and why.
   */
  appBaseUrl: 'https://proplaunch.ai',

  /**
   * Public base URL of the R2 data bucket (sector JSON, manifest, ukhpi, etc.).
   *
   * A CUSTOM DOMAIN ON THE BUCKET, NOT THE r2.dev ONE. The r2.dev address is
   * Cloudflare's development URL: it is never served from the edge cache — it
   * returns no cf-cache-status at all — and it is rate limited, which is what
   * made a single range request measure 16.4s during the map work. On a custom
   * domain the same bucket sits behind the CDN, so a second reader gets a
   * cache HIT instead of another trip to the bucket.
   */
  dataBaseUrl: 'https://data.proplaunch.ai',

  /**
   * WHERE THE MAP'S TILE ARCHIVE IS FETCHED FROM — deliberately NOT the same
   * host as the data above.
   *
   * The archive is 1.07GB and the custom domain carries a Cache Rule. Since
   * that rule went live the console gate has failed on /comparables at desktop
   * width, every run, with pmtiles reporting "Server returned no content-length
   * header or content-length exceeding request" — a byte-serving failure on the
   * range requests the map lives on. It reproduces on the CI runner and not
   * from the operator's network, so it is a path the rule takes for a very
   * large object rather than something the app can fix in code.
   *
   * HONEST ABOUT WHAT THIS IS: a mitigation chosen on correlation, not a proven
   * root cause. What makes it safe is that it costs nothing — the archive was
   * never edge-cached anyway (cf-cache-status: BYPASS, because it is far over
   * the free plan's per-file ceiling), so moving it back to the address it was
   * served from for months loses no caching at all. The JSON keeps the custom
   * domain and keeps its cache HITs, which is where the measured win actually
   * was.
   *
   * The alternative is to exclude /map/ from the Cache Rule and put this back
   * to dataBaseUrl — one line, whenever that is confirmed.
   */
  tilesBaseUrl: 'https://pub-ed7263f454104eb1a02055393ee15800.r2.dev',

  /** Social profiles — the ONLY place these URLs are written (name-agnostic). */
  socials: {
    instagram: 'https://www.instagram.com/gil_and_bricks/',
    youtube: 'https://www.youtube.com/@gil_and_bricks',
  },

  /**
   * Per-strategy "free walkthrough" YouTube links, shown near each verdict as
   * HELP (never promotion, never a pop-up). All four point at the channel until
   * the operator drops four playlist URLs here — editing this object is the only
   * change needed, no code touched (CLAUDE.md golden rule 2).
   */
  youtube: {
    btl: 'https://www.youtube.com/@gil_and_bricks',
    flip: 'https://www.youtube.com/@gil_and_bricks',
    brrrr: 'https://www.youtube.com/@gil_and_bricks',
    hmo: 'https://www.youtube.com/@gil_and_bricks',
  },
} as const;

/** The per-strategy YouTube link, by strategy id — falls back to the channel. */
export function youtubeFor(strategyId: string): string {
  return (coreConfig.youtube as Record<string, string>)[strategyId] ?? coreConfig.socials.youtube;
}
