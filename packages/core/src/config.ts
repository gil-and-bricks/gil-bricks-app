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
   * WHERE THE MAP'S TILE ARCHIVE IS FETCHED FROM.
   *
   * THE SAME HOST AS THE DATA, and deliberately so: one domain, and no
   * rate-limited development endpoint anywhere in the request path.
   *
   * IT DID NOT START THAT WAY. When the data bucket's Cache Rule went live the
   * console gate began failing on /comparables at desktop width, every run,
   * with pmtiles reporting "Server returned no content-length header or
   * content-length exceeding request" — a byte-serving failure on the range
   * requests the basemap lives on. Moving the archive to its own host turned
   * three consecutive red runs green on the next commit, which made the Cache
   * Rule's path over a 1.07GB object the cause rather than a suspicion.
   *
   * The rule now excludes /map/, so the archive takes the plain path again and
   * this can point back where it belongs. The exclusion costs nothing: at
   * 1.07GB the archive was never edge-cached anyway — cf-cache-status BYPASS,
   * far over the free plan's per-file ceiling — so there was no caching to
   * lose. The JSON keeps the rule and keeps its cache HITs, which is where the
   * measured win was.
   *
   * KEPT AS ITS OWN FIELD rather than folded back into dataBaseUrl. The two
   * point at the same host today, but they are two different things: a 1.07GB
   * archive read in ranges, and a few hundred KB of JSON read whole. They have
   * already needed to differ once, and a named field is how that stays one edit
   * instead of an archaeology exercise.
   */
  tilesBaseUrl: 'https://data.proplaunch.ai',

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

/**
 * X2 — FLAGS THE EXTENSION CAN ACTUALLY READ.
 *
 * ── WHY THIS IS NOT IN packages/web/src/config/features.ts ──────────────────
 * The charter says every feature flag lives in that one file. The extension
 * cannot import it: it ships as a separate artefact and depends on exactly one
 * package, `@gil-bricks/core`. Putting the flag there and a copy here would be
 * two sources of truth for one switch — precisely what the rule exists to stop.
 *
 * So the flag is DEFINED once, here, in the package both surfaces already read,
 * and `features.ts` MIRRORS it so the central registry still lists every flag
 * the product has and `docs/FEATURE_FLAGS.md` still documents it. A test
 * (`features.test.ts`) fails if the two ever disagree, so the mirror cannot
 * drift into a second source. Turning the feature off is one edit, in this file.
 *
 * ── WHY onPageChips DEFAULTS TO OFF ─────────────────────────────────────────
 * Rightmove's terms of use prohibit a USER overlaying material on their
 * platform — clause 8.3, in those words. That binds the operator as a user of
 * their site, not this product, and the realistic worst case is the operator's
 * own account being withdrawn. PaTMa, PropertyData and PropBar have all done
 * this for years and none has been challenged.
 *
 * It is still an explicit clause, so it is the operator's decision to make and
 * not a default we take on their behalf. Off until they turn it on, and one
 * line here turns it off again — with the side panel completely unaffected,
 * because nothing in the panel reads this.
 */
export const EXTENSION_FLAGS = {
  /** Chips injected onto the portal's own listing page. See the note above. */
  onPageChips: false,
} as const;

export type ExtensionFlagName = keyof typeof EXTENSION_FLAGS;
