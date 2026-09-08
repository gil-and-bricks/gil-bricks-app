/**
 * EPC register address matching (E1).
 *
 * THE PROBLEM THIS SOLVES. The register is keyed by postcode plus a free-text
 * address written by whoever lodged the certificate. "FLAT 2, 8 TYFICA ROAD"
 * may be lodged as "Flat 2 8 Tyfica Road", "2, 8 Tyfica Road", or with the flat
 * in a second address line. A postcode can hold one house or eighty. So the
 * postcode search returns candidates and THIS decides which of them is the
 * subject — or refuses, which is a real answer and not a failure.
 *
 * It is pure and it does no I/O, so every rule below is tested directly. The
 * Worker owns the token and the network; this owns the judgement.
 */
import { normaliseAddressKey } from '../landregistry/history';

/** One row of the register's postcode search, in the shape we depend on. */
export interface EpcCandidate {
  certificateNumber: string;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  postcode: string;
  /** yyyy-mm-dd. The register's own date for the certificate. */
  registrationDate: string | null;
  /** The register's own property identifier. When two certificates share one,
   *  they are the SAME property re-certified — no address guessing needed. */
  uprn?: number | string | null;
}

/** What the subject we are looking for is called. */
export interface EpcSubject {
  /** House number or name — "8", "ROSE COTTAGE". */
  paon: string;
  /** Flat or sub-building — "FLAT 2", "2". Empty when there is none. */
  saon?: string;
}

/**
 * The address of a candidate as ONE normalised string: the register spreads a
 * flat across lines inconsistently, so joining them and normalising is the only
 * comparison that survives every layout it uses.
 */
export function candidateKey(c: EpcCandidate): string {
  return normaliseAddressKey(
    [c.addressLine1, c.addressLine2, c.addressLine3, c.addressLine4].filter(Boolean).join(' '),
  );
}

/** The tokens a match must start with, most specific first. */
function wantedKeys(subject: EpcSubject): string[] {
  const paon = normaliseAddressKey(subject.paon);
  const saon = normaliseAddressKey(subject.saon ?? '');
  if (paon === '') return [];
  if (saon === '') return [paon];
  // "FLAT 2" + "8" is lodged as either order in the wild, so accept both.
  return [`${saon} ${paon}`, `${paon} ${saon}`];
}

/**
 * Does a candidate address begin with the tokens we want, on a word boundary?
 *
 * Prefix, not equality: the register carries the street too ("8 TYFICA ROAD"),
 * which we do not ask the user for. The boundary check is what stops "8" from
 * matching "80 TYFICA ROAD" — the bug this would otherwise have.
 */
export function keyMatches(key: string, wanted: string): boolean {
  if (wanted === '') return false;
  if (key === wanted) return true;
  return key.startsWith(`${wanted} `);
}

/** Does the key contain this run of words, on whole-word boundaries? */
export function containsTokens(key: string, tokens: string): boolean {
  if (tokens === '') return false;
  const escaped = tokens.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^| )${escaped}( |$)`).test(key);
}

/**
 * The flat AFTER the street: "8 Tyfica Road, Flat 2". Prefix matching cannot
 * see this, so it is checked explicitly — the building must still be the FIRST
 * thing in the key (so "80" never matches "8"), and the sub-building must
 * appear as whole words (so "2" never matches "2ND FLOOR").
 */
function saonAfterStreet(key: string, paon: string, saon: string): boolean {
  if (paon === '' || saon === '') return false;
  if (!keyMatches(key, paon)) return false;
  return containsTokens(key, saon);
}

/**
 * Words the register uses for a part of a building. A bare ask for "8" must
 * never be answered with one of these, wherever in the line they appear —
 * "8 TYFICA ROAD FLAT 2" is a flat, not the building, and the plain prefix rule
 * cannot tell the difference on its own.
 */
const SUB_BUILDING_WORDS = [
  'FLAT', 'FLATS', 'APARTMENT', 'APT', 'UNIT', 'ROOM', 'ANNEX', 'ANNEXE',
  'MAISONETTE', 'BASEMENT', 'GROUND FLOOR', 'FIRST FLOOR', 'SECOND FLOOR',
  'THIRD FLOOR', 'TOP FLOOR', 'FLOOR FLAT', 'BEDSIT', 'STUDIO',
];

/** Does this address name a part of a building rather than the whole of it? */
export function namesSubBuilding(key: string): boolean {
  return SUB_BUILDING_WORDS.some((w) => containsTokens(key, w));
}

/**
 * A subject with NO sub-building must not match a flat. Asking for "8" when the
 * register holds "FLAT 1 8" and "FLAT 2 8" is a question about the building,
 * and answering it with one flat's area would be a wrong number stated
 * confidently. Those become `ambiguous` instead.
 */
function isBareBuildingAsk(subject: EpcSubject): boolean {
  return normaliseAddressKey(subject.saon ?? '') === '';
}

export interface EpcMatchOutcome {
  /** Candidates that are the subject. Most recent certificate first. */
  matches: EpcCandidate[];
  /** True when the ask was for a building and the register holds sub-buildings. */
  subBuildingsFound: boolean;
}

/**
 * Which candidates are the subject, most recent first.
 *
 * Sorting matters: a property re-certified after a loft conversion has two
 * certificates with different areas, and the newest is the true one. The caller
 * decides what to do when the areas disagree — this only orders them.
 */
export function matchCandidates(candidates: readonly EpcCandidate[], subject: EpcSubject): EpcMatchOutcome {
  const wanted = wantedKeys(subject);
  if (wanted.length === 0) return { matches: [], subBuildingsFound: false };

  const paonKey = normaliseAddressKey(subject.paon);
  const saonKey = normaliseAddressKey(subject.saon ?? '');
  const bareAsk = isBareBuildingAsk(subject);

  const exact: EpcCandidate[] = [];
  let subBuildings = false;
  for (const c of candidates) {
    const key = candidateKey(c);
    // ASKED FOR THE BUILDING, FOUND A PART OF IT. The register writes the flat
    // before the number ("FLAT 2 8 TYFICA ROAD") and after the street
    // ("8 TYFICA ROAD FLAT 2"); the second form satisfies a plain prefix match
    // on "8", so without this a flat is handed back as the whole building —
    // a wrong number, stated confidently, straight into the Deal Score.
    if (bareAsk && namesSubBuilding(key)) {
      if (containsTokens(key, paonKey)) subBuildings = true;
      continue;
    }
    if (wanted.some((w) => keyMatches(key, w)) || saonAfterStreet(key, paonKey, saonKey)) {
      exact.push(c);
      continue;
    }
    // "FLAT 2 8 …" when we asked for "8": a sub-building of the thing asked for.
    if (bareAsk && containsTokens(key, paonKey) && !keyMatches(key, paonKey)) {
      subBuildings = true;
    }
  }

  // Newest first. A missing date sorts last: it cannot be shown to be newest.
  const byNewest = [...exact].sort((a, b) => (b.registrationDate ?? '').localeCompare(a.registrationDate ?? ''));
  return { matches: byNewest, subBuildingsFound: subBuildings };
}
