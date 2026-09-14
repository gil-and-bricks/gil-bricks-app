/**
 * READING THE LISTING'S OWN WORDS — one matcher, used everywhere.
 *
 * The patterns live in config (SignalConfig) so the operator can edit them
 * without touching code. This file holds the LOGIC that applies them, and it is
 * the only copy: Seller Signals reads the description to warn a person on
 * screen, and the extractors read the same description to set `isAuction`, and
 * those two must never be able to disagree about what the words say. A second
 * matcher would be exactly the drift this codebase keeps being bitten by.
 *
 * Matching is WHOLE-WORD by default, so a pattern never inverts meaning by
 * sitting inside a longer word ('structural' inside "structurally sound"). A
 * trailing '*' marks a deliberate stem ('relocat*' → relocation, relocating),
 * which relaxes the trailing boundary only.
 */
import type { SignalConfig, SignalPattern } from './config';

/** The impairment group that means "this sale is an auction". */
export const AUCTION_GROUP = 'auction-mechanism';

/** Markup to readable text — the form every pattern is matched against. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isWordChar = (c: string): boolean => /[a-z0-9]/.test(c);

/** Where a pattern matched, and the words around it. */
export interface WordingHit {
  /** The group's own label, e.g. "Auction sale". */
  label: string;
  /** The matched phrase with ~32 characters either side, so a false positive is obvious. */
  phrase: string;
}

/**
 * The first pattern in the group that appears in the text as a whole word, with
 * its surrounding context — or null. Every occurrence is scanned, so a real
 * whole-word use later in the text still counts.
 */
export function firstMatch(text: string, lower: string, group: SignalPattern): WordingHit | null {
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
        return { label: group.label, phrase: snippet };
      }
      from = at + 1;
    }
  }
  return null;
}

/**
 * DOES THIS LISTING SAY IT IS AN AUCTION?
 *
 * WHY THIS EXISTS. Zoopla publishes a structured auction flag; Rightmove does
 * not. So a Rightmove listing whose description opened "This property is for
 * sale by the Modern Method of Auction" handed over to the analyser with no
 * auction flag at all, and the board never warned about the legal pack — while
 * the extension's own Seller Signals panel, reading the very same sentence with
 * the very same patterns, had already put "Auction sale" on the screen. The
 * words were read; the warning that matters was not.
 *
 * Someone can commit to a reservation fee on an auction lot without ever being
 * told to read the legal pack. That is the fault this closes.
 *
 * The patterns are the config's own `auction-mechanism` group — the same list
 * the warning on screen uses, not a second one written beside it.
 */
export function auctionInWording(description: string | null | undefined, signals: SignalConfig): boolean {
  if (typeof description !== 'string' || description.trim() === '') return false;
  const group = signals.impairmentLanguage.find((g) => g.key === AUCTION_GROUP);
  if (!group) return false;
  const text = plainText(description);
  return firstMatch(text, text.toLowerCase(), group) !== null;
}
