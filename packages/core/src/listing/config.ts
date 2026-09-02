/**
 * Extractor remote config (E5). This is DATA ONLY — field paths, flight keys,
 * fallback selectors, feature flags and thresholds. All LOGIC stays in the
 * package (MV3 rule): the operator can retarget the extractors after a portal
 * redesign by editing one JSON file in R2, with no code change and no store
 * re-review.
 *
 * R2 key:  config/extractors.json
 * URL:     https://pub-ed7263f454104eb1a02055393ee15800.r2.dev/config/extractors.json
 *
 * An identical FALLBACK_CONFIG ships inside the extension. loadExtractorConfig
 * fetches the remote copy with a short timeout, caches it, and falls back to the
 * shipped copy on ANY failure — it never blocks first paint and never throws.
 */
import { coreConfig } from '../config';

export interface PortalPaths {
  /** Dot-paths into the embedded model. */
  paths: Record<string, string>;
  /** Fallback sources when the blob is gone: og/meta keys + ld+json type. */
  fallback: { meta: Record<string, string>; ldType?: string };
}

export interface ExtractorConfig {
  configVersion: string;
  rightmove: PortalPaths;
  zoopla: PortalPaths;
  flags: {
    rightmoveEnabled: boolean;
    zooplaEnabled: boolean;
    /** Try the DOM/meta/ld+json fallback when the embedded blob fails. */
    domFallbackEnabled: boolean;
  };
  thresholds: {
    /** Give up on the remote config after this long and use the fallback. */
    remoteTimeoutMs: number;
    /** Below this many sector sales, don't score price-vs-sold — say so instead. */
    minSectorSales: number;
    /** Subject price above this × the sector p90 is 'outside evidence' — not judged. */
    evidenceOutsideFactor: number;
    /** A remembered rent must imply a gross yield in [min,max] to be applied. */
    rentSanityYieldMin: number;
    rentSanityYieldMax: number;
  };
  /** Seller Signals text patterns (E8) — EDITABLE here, no code change. */
  signals: SignalConfig;
}

/** A named group of case-insensitive phrase patterns matched in the description. */
export interface SignalPattern {
  key: string;
  label: string;
  patterns: string[];
}

export interface SignalConfig {
  /** A listing first-listed more than this many days ago counts toward flexibility. */
  longOnMarketDays: number;
  /** Language that hints a seller MAY be flexible (never proof of motivation). */
  flexibilityLanguage: SignalPattern[];
  /** Language that hints a property MAY be impaired — a WARNING, not a discount. */
  impairmentLanguage: SignalPattern[];
  /** Chain-free wording — a completion-speed advantage, NEVER a flexibility signal. */
  chainFree: SignalPattern;
}

/** The path used within R2 (documented in README + DECISIONS_LOG). */
export const EXTRACTOR_CONFIG_KEY = 'config/extractors.json';

/** Shipped fallback — the source of truth for the CURRENT extractor targets. */
export const FALLBACK_CONFIG: ExtractorConfig = {
  configVersion: '2026-09-02',
  rightmove: {
    paths: {
      listingId: 'id',
      price: 'prices.primaryPrice',
      propertyType: 'propertySubType',
      tenure: 'tenure.tenureType',
      bedrooms: 'bedrooms',
      bathrooms: 'bathrooms',
      sizings: 'sizings',
      floorplans: 'floorplans',
      description: 'text.description',
      listingUpdateReason: 'listingHistory.listingUpdateReason',
      tags: 'tags',
      channel: 'channel',
      outcode: 'address.outcode',
      incode: 'address.incode',
      displayAddress: 'address.displayAddress',
      auction: 'auction',
    },
    fallback: { meta: { title: 'og:title', url: 'og:url', description: 'og:description', image: 'og:image' } },
  },
  zoopla: {
    paths: {
      listingId: 'listingId',
      pricing: 'pricing',
      tenure: 'tenure',
      counts: 'counts',
      floorArea: 'floorArea',
      floorPlan: 'floorPlan',
      propertyType: 'propertyType',
      postalCode: 'postalCode',
      outcode: 'outcode',
      incode: 'incode',
      publishedOn: 'publishedOn',
      listingCondition: 'listingCondition',
      priceHistory: 'priceHistory',
      displayAddress: 'displayAddress',
      propertyNumberOrName: 'propertyNumberOrName',
      postTownName: 'postTownName',
    },
    fallback: { meta: { title: 'og:title', url: 'og:url', description: 'og:description', image: 'og:image' }, ldType: 'RealEstateListing' },
  },
  flags: { rightmoveEnabled: true, zooplaEnabled: true, domFallbackEnabled: true },
  thresholds: { remoteTimeoutMs: 2500, minSectorSales: 5, evidenceOutsideFactor: 2, rentSanityYieldMin: 0.02, rentSanityYieldMax: 0.2 },
  signals: {
    longOnMarketDays: 90,
    flexibilityLanguage: [
      { key: 'probate', label: 'Probate / deceased estate', patterns: ['probate', 'deceased estate', 'executors sale', 'executor sale', 'sale of the estate'] },
      { key: 'motivated', label: 'Motivated / must sell', patterns: ['motivated seller', 'motivated vendor', 'must sell', 'needs to sell', 'quick sale', 'quick completion', 'urgent sale', 'priced to sell'] },
      { key: 'relocation', label: 'Relocation', patterns: ['relocat*', 'moving abroad', 'job relocation'] },
      { key: 'downsizing', label: 'Downsizing', patterns: ['downsiz*'] },
    ],
    impairmentLanguage: [
      { key: 'cash-only', label: 'Cash buyers only', patterns: ['cash buyers only', 'cash buyer only', 'cash purchasers only', 'cash only', 'cash buyers required'] },
      { key: 'unmortgageable', label: 'May be hard to mortgage', patterns: ['unmortgageable', 'not mortgageable', 'cannot be mortgaged', 'no mortgage available', 'unable to mortgage', 'not suitable for a mortgage', 'mortgage not possible'] },
      { key: 'short-lease', label: 'Short lease', patterns: ['short lease', 'short leasehold', 'lease needs extending', 'lease requires extending', 'lease of 60', 'lease of 70', 'lease of 80', 'unexpired term of 60', 'unexpired term of 70', 'unexpired term of 80'] },
      { key: 'condition', label: 'Structural / damp / subsidence', patterns: ['subsidence', 'structural movement', 'structural defect', 'structural crack', 'structural repair', 'rising damp', 'penetrating damp', 'damp proofing required', 'wet rot', 'dry rot', 'japanese knotweed', 'knotweed'] },
      { key: 'non-standard', label: 'Non-standard construction', patterns: ['non-standard construction', 'non standard construction', 'concrete construction', 'steel frame', 'timber frame', 'prefab'] },
      { key: 'auction-mechanism', label: 'Auction sale', patterns: ['for sale by auction', 'modern method of auction', 'sold by auction', 'auction sale', 'reservation fee'] },
    ],
    chainFree: { key: 'chain-free', label: 'Chain-free', patterns: ['no onward chain', 'no forward chain', 'chain free', 'chain-free', 'no chain'] },
  },
};

export interface ConfigStore {
  get(): Promise<ExtractorConfig | null> | ExtractorConfig | null;
  set(config: ExtractorConfig): Promise<void> | void;
}

export interface LoadConfigOptions {
  fetchImpl?: typeof fetch;
  /** Persistent cache (e.g. chrome.storage-backed in the extension). */
  store?: ConfigStore;
  baseUrl?: string;
  timeoutMs?: number;
  /** Skip the remote fetch entirely — cache/fallback only (content-script side). */
  disableRemote?: boolean;
  /** Bypass the memory/store cache and re-fetch R2 (panel refresh) — updates the
   * cache on success, leaves it untouched on failure. */
  forceRemote?: boolean;
}

export type ConfigSource = 'remote' | 'cache' | 'fallback';

let memoryCache: ExtractorConfig | null = null;

/** Test hook. */
export function _clearConfigCache(): void {
  memoryCache = null;
}

function isConfigShape(x: unknown): x is ExtractorConfig {
  const c = x as ExtractorConfig;
  return !!c && typeof c.configVersion === 'string' && !!c.rightmove?.paths && !!c.zoopla?.paths && !!c.flags;
}

/**
 * Resolve the extractor config. Order: in-memory cache → persistent store →
 * remote R2 (timed) → shipped fallback. NEVER throws; NEVER blocks on the
 * network beyond the timeout.
 */
export async function loadExtractorConfig(opts: LoadConfigOptions = {}): Promise<{ config: ExtractorConfig; source: ConfigSource }> {
  // forceRemote (panel refresh) bypasses BOTH caches so R2 is actually re-pulled;
  // otherwise stale-once means stale-forever.
  if (!opts.forceRemote) {
    if (memoryCache) return { config: memoryCache, source: 'cache' };
    if (opts.store) {
      try {
        const cached = await opts.store.get();
        if (isConfigShape(cached)) {
          memoryCache = cached;
          return { config: cached, source: 'cache' };
        }
      } catch {
        /* ignore store errors */
      }
    }
  }

  const doFetch = opts.disableRemote ? undefined : opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (doFetch) {
    const base = (opts.baseUrl ?? coreConfig.dataBaseUrl).replace(/\/+$/, '');
    const timeout = opts.timeoutMs ?? FALLBACK_CONFIG.thresholds.remoteTimeoutMs;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : undefined;
    try {
      const res = await doFetch(`${base}/${EXTRACTOR_CONFIG_KEY}`, ctrl ? { signal: ctrl.signal } : undefined);
      if (res.ok) {
        const json = await res.json();
        if (isConfigShape(json)) {
          memoryCache = json;
          if (opts.store) {
            try {
              await opts.store.set(json);
            } catch {
              /* ignore */
            }
          }
          return { config: json, source: 'remote' };
        }
      }
    } catch {
      /* network/timeout/parse — fall through to shipped fallback */
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { config: FALLBACK_CONFIG, source: 'fallback' };
}
