/**
 * The one answer shape for a floor-area lookup (E1), spoken by the Worker, the
 * web analyser and the extension alike — so all three say the same thing about
 * the same property, and a new failure state cannot be added to one surface
 * without the others seeing it.
 */

/** Where a floor area came from. The UI must always say which. */
export type AreaSource =
  /** The EPC register itself, looked up live. The real answer. */
  | 'register'
  /** Our monthly sold-price data, which carries an EPC-joined area for sales
   *  that matched at build time. Instant, but only for recently-sold homes. */
  | 'sold-data';

/** Why a lookup produced no area. One per thing the person can act on. */
export type EpcFailure =
  /** No postcode given, or not a full one. */
  | 'needs-postcode'
  /** A full postcode the register does not recognise. */
  | 'unknown-postcode'
  /** Scotland or Northern Ireland: a separate register, out of scope. */
  | 'outside-ew'
  /** OUR side failed: the register was unreachable, or answered with nonsense. */
  | 'unavailable'
  /** The register asked us to slow down. */
  | 'rate-limited'
  /** The register answered, and holds no certificate for that address. */
  | 'no-match'
  /** Certificates exist but disagree on size, or the ask was for a building
   *  that is divided into flats. Never guessed at. */
  | 'ambiguous';

export interface EpcArea {
  ok: true;
  sqm: number;
  source: AreaSource;
  /** Present for a register answer: which certificate the figure came from. */
  certificateNumber?: string;
  /** yyyy-mm-dd of that certificate. */
  certificateDate?: string;
  /** True when the address had more than one certificate and this is the newest. */
  supersededOthers?: boolean;
}

export interface EpcNoArea {
  ok: false;
  reason: EpcFailure;
  /** Set when several certificates disagree, so the UI can say the sizes. */
  disagreeingSqm?: number[];
}

export type EpcResult = EpcArea | EpcNoArea;
