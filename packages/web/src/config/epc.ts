/**
 * The EPC register lookup, tunable without touching the engine (E1).
 *
 * The register's published limit is 6,000 requests per 5 minutes per
 * originating IP (their API guidance, "Rate limiting"). One lookup costs at
 * most two calls, and a cached one costs none — so the ceiling is far away.
 * These values are the ones to move if that ever changes.
 */
export const EPC = {
  /**
   * Give up on the register rather than hold a person's request open.
   *
   * Measured, not guessed: its postcode search took 4.5s and 6.0s on the same
   * address minutes apart, so a 6s ceiling turned a real answer into
   * "unavailable" roughly half the time. Only the FIRST ask for an address pays
   * this at all — after that the cache answers in single-digit milliseconds.
   */
  timeoutMs: 12_000,
  /**
   * How many certificates at ONE address we will open to compare sizes. A
   * re-certified house has two or three; anything beyond that is a block of
   * flats we have already refused to guess about.
   */
  maxCertificatesPerAddress: 3,
  /** A certificate does not change, so a hit can be held for a long time. */
  cacheHitDays: 180,
  /**
   * A miss is held briefly: a house with no certificate today may be certified
   * next month, but re-asking on every keystroke is what burns a rate limit.
   */
  cacheMissDays: 14,
  /**
   * The most cache rows any ONE postcode may hold.
   *
   * The endpoint takes a free-text house number and needs no sign-in, so the key
   * space is otherwise unbounded: a script asking for house 1 to 100,000 at one
   * real postcode would write the whole Cloudflare D1 free-tier daily write
   * allowance and take the rest of the product down with it. A real postcode has
   * tens of addresses, so this is far above any honest use and a hard ceiling on
   * the damage. Past it, lookups still WORK — they simply stop being cached.
   */
  maxCacheRowsPerPostcode: 250,
  /** Rows older than this are swept by the daily cron. */
  sweepAfterDays: 200,
} as const;

/**
 * The client half: where the browser and the extension ask, and how long they
 * wait. The endpoint is OUR Worker, never the register — only the Worker holds
 * the token.
 */
export const EPC_LOOKUP = {
  endpoint: '/api/epc',
  /** A little longer than the Worker's own ceiling, so the Worker is the thing
   *  that decides to give up — and the person gets its honest reason rather
   *  than the browser's silence. */
  clientTimeoutMs: 14_000,
} as const;

/**
 * Postcode AREAS the EPC register does not cover, because they have their own.
 *
 * TD IS DELIBERATELY ABSENT. It straddles the border: TD15 is Berwick-upon-Tweed,
 * which is England, and the register holds thousands of TD15 certificates. Listing
 * it here rejected English addresses outright and — because 'outside-ew' is not a
 * fault of ours — suppressed the sold-data fallback too, so those addresses lost
 * an answer they used to get. A Scottish TD postcode simply finds no certificate,
 * which is the honest outcome.
 *
 * CLAUDE.md gates the PRODUCT on ONSPD CTRY; this is only a cheap pre-filter that
 * saves a pointless call for areas that are wholly outside England and Wales.
 */
export const OUTSIDE_EW: ReadonlySet<string> = new Set([
  'AB', 'DD', 'DG', 'EH', 'FK', 'G', 'HS', 'IV', 'KA', 'KW', 'KY', 'ML', 'PA', 'PH', 'ZE',
  'BT', 'IM', 'JE', 'GY',
]);
