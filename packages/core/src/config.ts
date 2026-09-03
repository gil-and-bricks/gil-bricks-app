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

  /** Public base URL of the R2 data bucket (sector JSON, manifest, ukhpi, etc.). */
  dataBaseUrl: 'https://pub-ed7263f454104eb1a02055393ee15800.r2.dev',

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
