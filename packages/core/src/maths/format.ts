/** Money formatted £1,234 — whole pounds, thousands separators. */
export function fmtMoney(v: number): string {
  const rounded = Math.round(Math.abs(v));
  const s = rounded.toLocaleString('en-GB');
  // no signed zero: -£0.40 rounds to £0, not "-£0"
  return `${v < 0 && rounded > 0 ? '-' : ''}£${s}`;
}

/** Percentages to 1 decimal place, e.g. "8.4%". */
export function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

/** Plain ratio to 2 decimal places, e.g. "1.62". */
export function fmtRatio(v: number): string {
  return v.toFixed(2);
}

/**
 * Money as it is TYPED, not as it is calculated (F1): "69995" reads back as
 * "£69,995" while the value stored in state and in the URL stays raw digits.
 * The web app and the extension both use this, so the two can never drift.
 */
export function fmtMoneyInput(raw: string): string {
  const digits = parseMoneyInput(raw);
  if (digits === '') return '';
  return `£${Number(digits).toLocaleString('en-GB')}`;
}

/**
 * The digits behind a typed money value — what state and the URL hold. Money
 * fields here are WHOLE POUNDS, so anything after a decimal point is dropped
 * rather than silently multiplying the figure by a hundred.
 */
export function parseMoneyInput(display: string): string {
  const beforeDecimal = display.split(/[.,](?=\d{1,2}$)/)[0];
  return beforeDecimal.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
}

/**
 * Where the caret belongs after reformatting: the same DIGIT it was after, not
 * the same character index. Without this a separator appearing mid-number
 * throws the caret to the end and the next keystroke lands in the wrong place.
 */
export function moneyCaret(display: string, caret: number, formatted: string): number {
  const digitsBefore = (display.slice(0, caret).match(/[0-9]/g) ?? []).length;
  if (digitsBefore === 0) return formatted.length === 0 ? 0 : Math.min(1, formatted.length);
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[0-9]/.test(formatted[i])) {
      seen += 1;
      if (seen === digitsBefore) return i + 1;
    }
  }
  return formatted.length;
}

/**
 * An ISO date as a person reads it: "2025-04-01" → "1 April 2025". Used where
 * a date is shown to someone rather than compared — the stamp duty tool's
 * "rates effective from" line, above all.
 */
export function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}
