/**
 * Normalised listing model (E5). Every field is wrapped in a Field<T> carrying
 * an explicit provenance status — a value is NEVER silently null. The three
 * statuses distinguish "the portal had it and we read it" from "the portal had
 * it but we couldn't find it (shape may have changed)" from "this portal never
 * publishes it", which drives both the honest UI and the capability table.
 */
export type Portal = 'rightmove' | 'zoopla';

export type FieldStatus =
  | 'found' // present on the page and read successfully
  | 'missing' // expected on this portal but not found (possible redesign)
  | 'unavailable-on-this-portal'; // this portal never exposes it

export interface Field<T> {
  value: T | null;
  status: FieldStatus;
}

export interface ListingAddress {
  paon?: string; // primary addressable object name (house number/name)
  saon?: string; // secondary (flat/unit)
  street?: string;
  town?: string;
}

export interface ListingUpdate {
  reason: string; // 'added' | 'reduced' | portal's own text
  date: string; // ISO yyyy-mm-dd where we can normalise it
}

/** How the listing was read — the primary embedded blob, or the DOM fallback. */
export type ExtractSource = 'embedded' | 'dom';

export interface NormalisedListing {
  portal: Portal;
  /** Which extractor version produced this (bumped on every extractor change). */
  extractorVersion: string;
  /** Which config version drove the field paths/selectors. */
  configVersion: string;
  /** Which path produced the data: the embedded blob, or the DOM fallback. */
  source: ExtractSource;
  listingId: Field<string>;
  url: Field<string>;
  postcode: Field<string>;
  outcode: Field<string>;
  address: Field<ListingAddress>;
  askingPrice: Field<number>;
  propertyType: Field<string>;
  tenure: Field<string>;
  bedrooms: Field<number>;
  bathrooms: Field<number>;
  floorAreaSqm: Field<number>;
  floorPlanImageUrls: Field<string[]>;
  newBuild: Field<boolean>;
  listingUpdate: Field<ListingUpdate>;
  firstVisibleDate: Field<string>;
  description: Field<string>;
  isAuction: Field<boolean>;
}

/** Why an extraction failed — the UI turns these into plain English. */
export type ExtractFailureReason =
  | 'not-a-listing' // the page isn't a portal listing page at all
  | 'no-blob' // no embedded data blob AND no usable DOM fallback
  | 'shape-changed' // a blob/DOM existed but nothing recognisable could be read
  | 'unreadable'; // an unexpected error while reading

export type ExtractResult =
  | { ok: true; listing: NormalisedListing }
  | { ok: false; portal: Portal | null; reason: ExtractFailureReason; message: string };

/** Convenience constructors so extractors never hand back a bare null. */
export const found = <T>(value: T): Field<T> => ({ value, status: 'found' });
export const missing = <T>(): Field<T> => ({ value: null, status: 'missing' });
export const unavailable = <T>(): Field<T> => ({ value: null, status: 'unavailable-on-this-portal' });

/** found() when value is non-empty, otherwise missing(). */
export function fieldOf<T>(value: T | null | undefined): Field<T> {
  if (value === null || value === undefined) return missing<T>();
  if (typeof value === 'string' && value.trim() === '') return missing<T>();
  if (Array.isArray(value) && value.length === 0) return missing<T>();
  return found(value);
}
