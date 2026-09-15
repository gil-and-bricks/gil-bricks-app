/**
 * X1 item 6 — POSSIBLE SELLER FLEXIBILITY, from what the listing itself shows.
 *
 * SIGNALS, NEVER PROOF. A home that has sat on the market for four months may
 * have sat because the price is ambitious, or because the seller is in no
 * hurry, or because of something on the street this tool cannot see. Only the
 * agent knows why somebody is selling. Everything here is evidence a person
 * could read off the page themselves, gathered in one place.
 *
 * ── WHAT THIS CAN HONESTLY SAY, AND WHAT IT CANNOT ──────────────────────────
 *
 * DAYS ON THE MARKET — yes. Rightmove and Zoopla both publish a first-listed
 *   date on the page the user has open, and reading the page in front of them
 *   is not building a portal dataset.
 *
 * A PRICE REDUCTION — the FACT and the DATE, yes. The AMOUNT, no, and this is
 *   worth being exact about because the brief asked for "price reduced by £X".
 *   Neither portal publishes the previous price in the page data: Rightmove
 *   marks a listing "Reduced on <date>" and Zoopla usually shows nothing at
 *   all. To state an amount we would have to have recorded the earlier asking
 *   price ourselves, which means keeping a time series of portal asking prices
 *   — the exact dataset docs/exclusions.md forbids. So it reports the
 *   reduction and its date, and says nothing about size.
 *
 * REGION ACHIEVED-VERSUS-ASKING — no, and not for want of looking. It needs
 *   asking prices paired to sold prices. Land Registry publishes what things
 *   SOLD for and nothing about what they were advertised at; the only source of
 *   the other half is the portals, and storing that is the same forbidden
 *   dataset. A figure assembled from asking prices we had scraped would breach
 *   the rule the product is built on, and one assembled from anything else
 *   would be a guess presented as a statistic. It is therefore not built, and
 *   the copy for it has been removed rather than left sitting unused.
 *   See docs/DECISIONS_LOG.md (X1).
 */
import type { NormalisedListing } from '../listing/types';
import type { SignalConfig } from '../listing/config';
import { firstMatch, plainText } from '../listing/wording';

export interface FlexibilitySignals {
  /** Days since the listing was first visible. Null when the page never said. */
  daysListed: number | null;
  /** True when that exceeds the config's "long on the market" threshold. */
  longListed: boolean;
  /** ISO date of a reduction the portal published. The AMOUNT is never available. */
  reducedOn: string | null;
  /** Phrases in the description that read as flexibility, each as found. */
  phrases: string[];
}

function daysBetween(now: Date, iso: string): number | null {
  const then = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  if (!Number.isFinite(then.getTime())) return null;
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  return Math.floor((a - b) / 86_400_000);
}

export function flexibilitySignals(
  listing: NormalisedListing,
  config: SignalConfig,
  now: Date,
): FlexibilitySignals {
  const fv = listing.firstVisibleDate;
  let daysListed: number | null = null;
  if (fv.status === 'found' && fv.value) {
    const d = daysBetween(now, fv.value);
    // A negative figure means the page's date is in the future: unreadable, not
    // "listed minus three days ago".
    if (d !== null && d >= 0) daysListed = d;
  }

  const upd = listing.listingUpdate;
  const reducedOn = upd.status === 'found' && upd.value && /reduc/i.test(upd.value.reason)
    ? upd.value.date
    : null;

  const text = plainText(listing.description.status === 'found' ? listing.description.value ?? '' : '');
  const lower = text.toLowerCase();
  const phrases: string[] = [];
  for (const group of config.flexibilityLanguage) {
    const hit = firstMatch(text, lower, group);
    if (hit) phrases.push(hit.phrase);
  }

  return {
    daysListed,
    longListed: daysListed !== null && daysListed > config.longOnMarketDays,
    reducedOn,
    phrases,
  };
}
