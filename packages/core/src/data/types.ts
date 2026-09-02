/**
 * Data schema v1 types — the LOCKED contract with the R2 bucket.
 * Documented in docs/DATA_SCHEMA.md. Changes require a version bump
 * and a migration note; never edit in place.
 */

export const SCHEMA_VERSION = 1;

/** ONSPD CTRY codes — England & Wales ONLY (CLAUDE.md golden rule 8). */
export type CountryCode = 'E92000001' | 'W92000004';

/** Land Registry property type: Detached, Semi, Terraced, Flat, Other. */
export type PropertyType = 'D' | 'S' | 'T' | 'F' | 'O';

/** Freehold or Leasehold. */
export type Tenure = 'F' | 'L';

export interface Sale {
  /** Land Registry transaction GUID. */
  id: string;
  /** Completion date, YYYY-MM-DD. */
  date: string;
  /** Price in £ (integer). */
  price: number;
  paon: string;
  /** Secondary addressable object (flat number); empty string when none. */
  saon: string;
  street: string;
  town: string;
  /** Always inside the containing file's sector. */
  postcode: string;
  type: PropertyType;
  tenure: Tenure;
  newBuild: boolean;
  lat: number;
  lng: number;
  /** From EPC match; null when no match. */
  floorAreaSqm: number | null;
  /** price / floorAreaSqm, rounded; null when floorAreaSqm is null. */
  ppsqm: number | null;
}

export interface SectorStats {
  count: number;
  /** Interquartile mean of sale prices. */
  typicalPrice: number;
  /** Interquartile mean of ppsqm values; null when no sale has a floor area. */
  typicalPpsqm: number | null;
  /** 80% range lower bound (10th percentile). */
  p10Price: number;
  /** 80% range upper bound (90th percentile). */
  p90Price: number;
}

export interface SectorFile {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Present and true only on hand-authored fixture data. */
  fixture?: boolean;
  /** e.g. "CF37 1". */
  sector: string;
  country: CountryCode;
  /** ISO timestamp. */
  updatedAt: string;
  /** Sales in the 12-month window. */
  sales: Sale[];
  /** Precomputed for the same window. */
  stats: SectorStats;
}

export interface Manifest {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Present and true only on hand-authored fixture data. */
  fixture?: boolean;
  /** Land Registry Price Paid Data month included, YYYY-MM. */
  ppdMonth: string;
  /** UKHPI month used for indexation, YYYY-MM. */
  ukhpiMonth: string;
  epcExtractDate: string;
  /** ONS Postcode Directory edition, YYYY-MM. */
  onspdEdition: string;
  generatedAt: string;
  sectorsCount: number;
  /** Additive v1 companions (S3.3): count of postcodes/{OUTCODE}.json files. */
  postcodeFiles?: number;
  /** When sectors-index.json was generated. */
  sectorsIndexAt?: string;
  /** S5.1 additive: edition label of the England deprivation index joined. */
  imdEdition?: string;
  /** S5.1 additive: edition label of the Wales deprivation index joined. */
  wimdEdition?: string;
}

/** One row of sectors-index.json — additive v1 companion (DATA_SCHEMA.md). */
export interface SectorsIndexEntry {
  sectorId: string;
  /** Centroid of the sector's live postcodes. */
  lat: number;
  lng: number;
  country: CountryCode;
  salesCount: number;
  /** Farthest live postcode from the centroid, miles — search-widening bound. */
  spanMiles: number;
}

/**
 * One sector's entry in area/{OUTCODE}.json — S5.1 additive companion,
 * keyed by sectorId. Kept OUT of sectors-index.json so comps searches stay
 * light (r2.dev serves uncompressed).
 */
export interface AreaStats {
  /** IQM sold price per type over the window; null when <3 sales of that type. Absent on deprivation-only entries (sectors with no window sales). */
  typicalPriceByType?: Record<'D' | 'S' | 'T' | 'F', number | null>;
  /** Fraction of window sales that were new builds (0–1). Absent on deprivation-only entries. */
  newBuildShare?: number;
  /** Fraction of window sales sold freehold (0–1). Absent on deprivation-only entries. */
  freeholdShare?: number;
  /** Sales per window month, oldest first (12 numbers). Absent on deprivation-only entries. */
  salesByMonth?: number[];
  /** England sectors only: modal IMD 2025 decile of live postcodes (1 = most deprived tenth). */
  imdDecile?: number;
  /** Fraction of live postcodes scored against IMD 2025. */
  imdCoverage?: number;
  /** Wales sectors only: modal WIMD 2025 decile (1 = most deprived tenth). Never mixed with IMD. */
  wimdDecile?: number;
  /** Fraction of live postcodes scored against WIMD 2025. */
  wimdCoverage?: number;
}

/** area/{OUTCODE}.json — sectorId → AreaStats. */
export type AreaStatsFile = Record<string, AreaStats>;

/** postcodes/{OUTCODE}.json: "CF371DL" → [lat, lng, country, sectorId]. */
export type PostcodeMap = Record<string, [number, number, CountryCode, string]>;

/** ukhpi.json — additive v1 companion: monthly all-property index per country. */
export interface UkhpiFile {
  source: string;
  /** Latest month present in the index, yyyy-mm. */
  ukhpiMonth: string;
  index: Record<CountryCode, Record<string, number>>;
}
