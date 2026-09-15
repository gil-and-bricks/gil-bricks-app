/**
 * X2 — THE FINDINGS. One list, shared by the chips on the portal's page and the
 * deal's own page in the web app.
 *
 * ── AN IDENTIFIER, NOT A LESSON ─────────────────────────────────────────────
 * A finding is a CODE and, at most, one short line of why. There are no
 * sentences here and no paragraphs, because these get printed on a page
 * somebody else owns, and that is the worst possible place to repeat ourselves.
 * The wording lives in `copy.ts`, keyed by code; this file decides only WHAT is
 * true and WHICH FOUR matter most.
 *
 * ── TWO KINDS, AND THE DIFFERENCE IS NOT COSMETIC ───────────────────────────
 * RISK — something in the listing's own words or fields that might kill the
 *   deal. It is always reported as what the LISTING SAYS, never as what is true.
 *
 * GAP — a field the portal publishes, that this listing has not filled in. It
 *   is a fair question for the agent and a small signal in itself.
 *
 * ── THE RULE THAT DECIDES WHETHER A GAP MAY BE SHOWN ────────────────────────
 * A gap is raised ONLY on `missing` — the portal publishes the field and the
 * agent left it blank. Never on `unavailable-on-this-portal`, which means the
 * portal does not publish it at all and the blind spot is OURS. Zoopla does not
 * publish ground rent; saying "no ground rent" on a Zoopla listing would be
 * inventing a fact about somebody's lease, printed next to their agent's name,
 * on their agent's page.
 *
 * That distinction is the whole reason `Field.status` has three values instead
 * of two, and nothing downstream may collapse them.
 *
 * ── AND NO FINDING MAY EVER BLESS ───────────────────────────────────────────
 * There is no positive finding in this file and there cannot be one. Nothing
 * here says a property is good, cheap or worth buying, and nothing states an
 * absence as a fact: "the listing does not give a lease length" is a fact about
 * the listing; "there is no lease" would be a claim about a title we have never
 * seen.
 */
import { detectFlags, type FlagId } from '../triage/flags';
import type { Field, NormalisedListing } from '../listing/types';

/** Short, stable, and safe in a URL — these travel in the handoff. */
export type FindingCode =
  // RISKS — the listing's own words or fields.
  | 'LEASE' | 'AUCT' | 'TENANT' | 'CASH' | 'CONSTR' | 'COMM'
  // GAPS — the portal publishes it; this listing did not fill it in.
  | 'NOPLAN' | 'NOEPC' | 'NOAREA' | 'NOTEN' | 'NOCT' | 'NOLEASE' | 'NOGR' | 'NOSC';

export type FindingKind = 'risk' | 'gap';

/**
 * WHERE A CHIP BELONGS ON THE PAGE. The content script maps these to the
 * portal's own elements; anything that has no home on the page — or whose home
 * is not on THIS page — goes in the one box under the photographs.
 */
export type FindingAnchor = 'tenure' | 'epc' | 'area' | 'councilTax' | 'lease' | 'none';

export interface Finding {
  code: FindingCode;
  kind: FindingKind;
  anchor: FindingAnchor;
  /** For a risk, the words in the listing that produced it. Never set on a gap. */
  matched?: string;
}

/**
 * THE ORDER, AND WHY IT IS THIS ORDER.
 *
 * The evidence on alerts is blunt: people stop reading them once there are too
 * many, and then they miss the one that mattered. So there are never more than
 * four, and the four are the four highest in this list — which is ranked by how
 * completely each one can end a purchase.
 *
 * RISKS FIRST, always, because a risk can stop the deal and a gap can only slow
 * it down. Within the risks: the ones that remove a buyer's ability to proceed
 * at all (cash only, auction) rank with the ones that change what is being
 * bought (leasehold, a tenant who comes with it). Within the gaps: the ones
 * that stop somebody valuing the property (no floor area) come before the ones
 * that are merely a phone call (no council tax band).
 */
const RANK: FindingCode[] = [
  // A buyer who needs a mortgage cannot buy these at all.
  'CASH', 'CONSTR',
  // The transaction itself is different, and expensive to get wrong.
  'AUCT', 'LEASE', 'TENANT', 'COMM',
  // Cannot judge the price without it.
  'NOAREA',
  // Changes what you are buying, and only a solicitor can answer it.
  'NOLEASE', 'NOGR', 'NOSC',
  // Legally required to be published; their absence is a fair question.
  'NOEPC', 'NOTEN', 'NOPLAN', 'NOCT',
];

const FROM_FLAG: Record<FlagId, FindingCode> = {
  leasehold: 'LEASE',
  auction: 'AUCT',
  tenantInSitu: 'TENANT',
  cashBuyers: 'CASH',
  nonStandardConstruction: 'CONSTR',
  commercialBelow: 'COMM',
};

const RISK_ANCHOR: Partial<Record<FindingCode, FindingAnchor>> = { LEASE: 'tenure' };

const GAP_ANCHOR: Record<string, FindingAnchor> = {
  NOPLAN: 'none', NOEPC: 'epc', NOAREA: 'area', NOTEN: 'tenure',
  NOCT: 'councilTax', NOLEASE: 'lease', NOGR: 'lease', NOSC: 'lease',
};

export const FINDING_RULES = {
  /** Never more than this many on screen at once. */
  max: 4,
} as const;

/**
 * A gap is raised only where the portal publishes the field and it is blank.
 *
 * A FIELD THAT IS NOT THERE AT ALL IS NOT A GAP. This runs inside the handoff
 * builder now, which older callers hand older listing shapes to; a field this
 * build expects and that object does not have is our version skew, not the
 * agent's omission — and it must never throw on the way to that conclusion,
 * because throwing here would take the whole handoff down with it.
 */
function isGap(f: Field<unknown> | undefined | null): boolean {
  return f?.status === 'missing';
}

/** An empty array that the portal DID publish is the listing giving nothing. */
function isEmptyOrGap(f: Field<readonly unknown[]> | undefined | null): boolean {
  if (!f) return false;
  if (f.status === 'missing') return true;
  return f.status === 'found' && Array.isArray(f.value) && f.value.length === 0;
}

/**
 * Every finding this listing supports, ranked, before the cap is applied.
 * Exported so the deal's own page can show the full set — the cap is a rule
 * about a page somebody else owns, not about our own.
 */
export function allFindings(listing: NormalisedListing): Finding[] {
  const out: Finding[] = [];

  /**
   * NO GAP MAY BE RAISED FROM A FALLBACK READ.
   *
   * When the page model does not parse, both extractors fall back to the og:
   * meta tags — and that path records almost every field as `missing`, because
   * `missing` is also what "we looked and it was not there" means. On a fallback
   * read we did not look at all.
   *
   * Without this gate, one Rightmove redesign would put "No floor plan", "No
   * floor area" and "No tenure" on every listing in the country, next to an
   * agent's name, on the agent's own page — accusing thousands of people of an
   * omission that was our parser breaking.
   *
   * Risks are unaffected: they are read from the description, which the fallback
   * path does recover, and they only ever report what the listing SAYS.
   */
  const canSeeGaps = listing.source === 'embedded';

  // RISKS — through the ONE detector, never a second copy of the patterns.
  for (const flag of detectFlags(
    {
      text: listing.description?.value ?? '',
      tenure: listing.tenure?.value ?? null,
      isAuction: listing.isAuction?.value ?? null,
    },
    // No cap here: the ranking below decides, not the order they were found in.
    Number.MAX_SAFE_INTEGER,
  )) {
    const code = FROM_FLAG[flag.id];
    out.push({ code, kind: 'risk', anchor: RISK_ANCHOR[code] ?? 'none', matched: flag.matched });
  }

  // GAPS — each one only where the portal publishes the field.
  const gaps: [boolean, FindingCode][] = [
    [isEmptyOrGap(listing.floorPlanImageUrls as Field<readonly unknown[]>), 'NOPLAN'],
    [isEmptyOrGap(listing.epcUrls as Field<readonly unknown[]>), 'NOEPC'],
    [isGap(listing.floorAreaSqm), 'NOAREA'],
    [isGap(listing.tenure), 'NOTEN'],
    [isGap(listing.councilTaxBand), 'NOCT'],
    [isGap(listing.leaseYearsRemaining), 'NOLEASE'],
    [isGap(listing.annualGroundRent), 'NOGR'],
    [isGap(listing.annualServiceCharge), 'NOSC'],
  ];
  for (const [yes, code] of gaps) {
    if (yes && canSeeGaps) out.push({ code, kind: 'gap', anchor: GAP_ANCHOR[code] ?? 'none' });
  }

  /**
   * THE LEASE QUESTIONS ONLY APPLY TO A LEASE.
   *
   * Rightmove emits blank ground-rent and service-charge fields on FREEHOLD
   * houses too — so without this, every freehold house in the country would
   * carry "No ground rent" and "No service charge", which are not omissions on
   * a freehold: they are the correct answer.
   */
  const leasehold = /lease/i.test(listing.tenure?.value ?? '');
  const filtered = leasehold ? out : out.filter((f) => !['NOLEASE', 'NOGR', 'NOSC'].includes(f.code));

  // Never the same finding twice, whatever produced it.
  const seen = new Set<FindingCode>();
  const unique = filtered.filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)));

  return unique.sort((a, b) => RANK.indexOf(a.code) - RANK.indexOf(b.code));
}

/**
 * The four that go on the portal's page. Capped, because an alert nobody reads
 * is worse than no alert — and the one they stop reading at is the one that
 * mattered.
 */
export function pageFindings(listing: NormalisedListing, max: number = FINDING_RULES.max): Finding[] {
  return allFindings(listing).slice(0, Math.max(0, max));
}

/** The codes, for the handoff. Short strings, never sentences. */
export function findingCodes(findings: readonly Finding[]): string {
  return findings.map((f) => f.code).join(' ');
}

/** Read them back, dropping anything this build does not recognise. */
export function findingsFromCodes(raw: string | null | undefined): FindingCode[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  const known = new Set<string>(RANK);
  const seen = new Set<string>();
  return raw
    .split(/[\s,]+/)
    .filter((c) => c !== '' && known.has(c) && !seen.has(c) && (seen.add(c), true))
    .sort((a, b) => RANK.indexOf(a as FindingCode) - RANK.indexOf(b as FindingCode)) as FindingCode[];
}
