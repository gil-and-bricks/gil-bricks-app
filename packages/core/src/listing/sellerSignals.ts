/**
 * Seller Signals (E8) — NEGOTIATION CONTEXT, never part of the Deal Score.
 *
 * Two SEPARATE reads, deliberately never merged into one number:
 *   • "Seller may be flexible" — price reduction (portal + date), time on
 *     market (from the first-listed date), and language in the description.
 *   • "Property may be impaired" — a WARNING: cash-only / hard-to-mortgage /
 *     short lease / condition (damp, subsidence, structural) / non-standard
 *     construction / auction sale.
 *
 * Each read is a BAND (strong / some / none seen) with the specific evidence
 * listed beneath it — the actual phrase found (with the surrounding words so a
 * false positive is obvious) or the actual date — so the user judges for
 * themselves. We NEVER claim to know the seller's motivation.
 *
 * Chain-free is NOT a flexibility signal — it's a completion-speed advantage
 * that usually carries a premium — so it sits under a neutral "worth knowing"
 * line and can never raise the flexibility read.
 *
 * All text patterns live in config (SignalConfig) so the operator can edit them
 * without touching code; every match carries the phrase it matched.
 */
import type { NormalisedListing, Portal } from './types';
import type { SignalConfig, SignalPattern } from './config';

export type SignalBand = 'strong' | 'some' | 'none-seen';

export interface SignalEvidence {
  /** What matched — a phrase group label, or a plain fact like a reduction date. */
  label: string;
  /** The matched phrase shown in its surrounding words (so false positives show). */
  phrase?: string;
  /** Where the evidence came from — the named portal, or the listing's own flags. */
  source: Portal | 'listing';
}

export interface SignalRead {
  band: SignalBand;
  evidence: SignalEvidence[];
  /**
   * Honest "not shown on this listing" notes — absence of evidence, NEVER read
   * as evidence of absence (e.g. Zoopla rarely shows reductions).
   */
  notes: string[];
}

export interface SellerSignals {
  portal: Portal;
  flexibility: SignalRead;
  impairment: SignalRead;
  /** Neutral facts that aren't flexibility or impairment (e.g. chain-free). */
  worthKnowing: string[];
  /** The plain time-on-market line ("First listed 78 days ago" / "not shown"). */
  timeOnMarket: string;
}

/** Strip HTML and collapse whitespace so patterns match plain description text. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isWordChar = (c: string): boolean => /[a-z0-9]/.test(c);

/**
 * The first pattern in the group that appears in the text AS A WHOLE WORD, with
 * its surrounding context. Matching is whole-word by default so a pattern never
 * inverts meaning by sitting inside a longer word ('structural' in "structurally
 * sound", 'the late' in "the latest"). A trailing '*' marks a deliberate STEM
 * (e.g. 'relocat*' → relocation/relocating) — leading boundary only. Every
 * occurrence is scanned, so a real whole-word use later in the text still counts.
 */
function firstMatch(text: string, lower: string, group: SignalPattern): SignalEvidence | null {
  for (const raw of group.patterns) {
    const stem = raw.endsWith('*');
    const needle = (stem ? raw.slice(0, -1) : raw).toLowerCase();
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const leadOk = at === 0 || !isWordChar(lower[at - 1]);
      const trailOk = stem || at + needle.length >= lower.length || !isWordChar(lower[at + needle.length]);
      if (leadOk && trailOk) {
        const start = Math.max(0, at - 32);
        const end = Math.min(text.length, at + needle.length + 32);
        const snippet = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
        return { label: group.label, phrase: snippet, source: 'listing' };
      }
      from = at + 1;
    }
  }
  return null;
}

/** 0 distinct signals → none seen, 1 → some, 2+ → strong. Deliberately coarse. */
function bandOf(distinctSignals: number): SignalBand {
  if (distinctSignals >= 2) return 'strong';
  if (distinctSignals === 1) return 'some';
  return 'none-seen';
}

function daysBetween(now: Date, iso: string): number | null {
  const then = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  const t = then.getTime();
  if (!Number.isFinite(t)) return null;
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((nowUtc - Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate())) / 86_400_000);
}

/** dd/mm/yyyy for humans (the panel shows the actual date, never "recently"). */
function ukDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Read the two separate signals from what the page already gave us. Pure — no
 * fetch, no network; `now` is injected so it's deterministic in tests.
 */
export function readSellerSignals(listing: NormalisedListing, config: SignalConfig, now: Date): SellerSignals {
  const portal = listing.portal;
  const html = listing.description.status === 'found' ? (listing.description.value ?? '') : '';
  const text = plainText(html);
  const lower = text.toLowerCase();

  // ---- FLEXIBILITY -------------------------------------------------------
  const flexEvidence: SignalEvidence[] = [];
  const flexNotes: string[] = [];
  let flexSignals = 0;

  // (1) price reduction — portal-honest.
  const upd = listing.listingUpdate;
  if (upd.status === 'found' && upd.value && /reduc/i.test(upd.value.reason)) {
    flexEvidence.push({ label: `Reduced on ${ukDate(upd.value.date)}`, source: portal });
    flexSignals += 1;
  } else if (portal === 'rightmove') {
    // Rightmove reliably shows reductions, so absence here is meaningful-ish —
    // but still phrase it as "none shown", never "there were none".
    flexNotes.push('No reduction shown (Rightmove).');
  } else {
    // Zoopla rarely surfaces reductions; it gives a published date instead.
    flexNotes.push('Reductions rarely shown on Zoopla — absence isn’t proof of none.');
  }

  // (2) time on market — from the first-listed date, stated plainly.
  const fv = listing.firstVisibleDate;
  let timeOnMarket: string;
  if (fv.status === 'found' && fv.value) {
    const days = daysBetween(now, fv.value);
    if (days != null && days >= 0) {
      timeOnMarket = `First listed ${days} ${days === 1 ? 'day' : 'days'} ago (${portal}).`;
      if (days > config.longOnMarketDays) {
        flexEvidence.push({ label: `On the market ${days} days`, phrase: `first listed ${ukDate(fv.value)}`, source: portal });
        flexSignals += 1;
        flexNotes.push('Longer-listed homes are more often reduced.');
      }
    } else {
      timeOnMarket = `First-listed date on this ${portal} listing couldn’t be read.`;
    }
  } else {
    timeOnMarket = `First-listed date isn’t shown on this ${portal} listing.`;
  }

  // (3) language in the description — each matched group counts once.
  for (const group of config.flexibilityLanguage) {
    const hit = firstMatch(text, lower, group);
    if (hit) {
      flexEvidence.push(hit);
      flexSignals += 1;
    }
  }

  // ---- IMPAIRMENT (a warning, never a discount) --------------------------
  const impEvidence: SignalEvidence[] = [];
  const impNotes: string[] = [];
  let impSignals = 0;
  const impSeen = new Set<string>();

  // Zoopla's structured auction flag is reliable; Rightmove has none.
  if (listing.isAuction.status === 'found' && listing.isAuction.value === true) {
    impEvidence.push({ label: 'Auction sale', phrase: `${portal} flags this as an auction`, source: portal });
    impSignals += 1;
    impSeen.add('auction-mechanism');
  } else if (portal === 'rightmove') {
    impNotes.push('Auctions aren’t flagged on Rightmove — checked the wording.');
  }

  for (const group of config.impairmentLanguage) {
    if (impSeen.has(group.key)) continue; // don't double-count auction
    const hit = firstMatch(text, lower, group);
    if (hit) {
      impEvidence.push(hit);
      impSignals += 1;
      impSeen.add(group.key);
    }
  }

  // ---- WORTH KNOWING (neutral) -------------------------------------------
  const worthKnowing: string[] = [];
  const chain = firstMatch(text, lower, config.chainFree);
  if (chain) {
    worthKnowing.push(`Chain-free — a completion-speed advantage that usually carries a small premium, not a discount (“${chain.phrase}”).`);
  }

  return {
    portal,
    flexibility: { band: bandOf(flexSignals), evidence: flexEvidence, notes: flexNotes },
    impairment: { band: bandOf(impSignals), evidence: impEvidence, notes: impNotes },
    worthKnowing,
    timeOnMarket,
  };
}

/** Terse band label for the collapsed card — "signs"/"none seen" never claim
 * certainty about the seller, and stay to one short line at 380px (E8.2 #7). */
export function bandLabel(kind: 'flexibility' | 'impairment', band: SignalBand): string {
  const state = band === 'strong' ? 'strong signs' : band === 'some' ? 'some signs' : 'none seen';
  return kind === 'flexibility' ? `Seller flexibility — ${state}` : `Impairment — ${state}`;
}
