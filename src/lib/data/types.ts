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
}
