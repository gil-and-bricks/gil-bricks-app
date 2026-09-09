/**
 * ONSPD re-versions its own column names, so we resolve them (C3 follow-up).
 *
 * The August 2026 edition renamed the country column `ctry25cd` → `ctry26cd`,
 * and the monthly data refresh died on it: "Binder Error: Referenced column
 * ctry25cd not found". ONS does this on a schedule — ctry11cd, ctry25cd,
 * ctry26cd — so hardcoding any one year guarantees the same failure again.
 * The country column is not cosmetic: it is the England & Wales gate
 * (CLAUDE.md rule 8), so the pipeline must NEVER guess it.
 */

/** The header row of a CSV, as names. */
export function csvHeader(firstLine) {
  return firstLine
    .replace(/^﻿/, '')
    .trim()
    .split(',')
    .map((c) => c.trim().replace(/^"|"$/g, ''));
}

/**
 * The newest `<base>NNcd` column present, e.g. onspdColumn(header, 'ctry').
 * Throws rather than falling back: a missing country column must stop the
 * build, not quietly ship a file with no country on it.
 */
export function onspdColumn(header, base) {
  const re = new RegExp(`^${base}\\d{2}cd$`, 'i');
  const found = header.filter((c) => re.test(c));
  if (found.length === 0) {
    throw new Error(
      `ONSPD has no ${base}NNcd column. ONS renames these; look at the header and update nothing — ` +
      `this resolver should have found it. Columns seen: ${header.slice(0, 60).join(',')}`,
    );
  }
  // Lexical order works because the suffix is a zero-padded two-digit year.
  return found.sort().at(-1);
}
