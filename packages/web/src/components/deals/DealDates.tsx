/**
 * DATES YOU SET (P8).
 *
 * The urgency ranking's top tier is a date you chose — a chase, an auction, an
 * exchange. Until now there was nowhere to put one. This is the smallest thing
 * that works: tap, pick a day, done, using the phone's own date wheel.
 *
 * A date that makes no sense here is never offered: no auction date unless the
 * deal came from an auction, no exchange date until the offer is accepted.
 */
import { DEAL_DATES, TODAY_COPY, dateAppliesAt, type DealDateSpec } from '../../config/pipeline';

export interface DealDatesProps {
  dealId: string;
  dealTitle: string;
  stage: string;
  isAuction: boolean;
  /** The dates already set, by column key. */
  dates: Record<string, string | null | undefined>;
  busy: boolean;
  onSet: (key: string, value: string) => void;
}

/** Which dates this deal can be OFFERED, from config — never a hardcoded rule. */
export function datesFor(stage: string, isAuction: boolean): DealDateSpec[] {
  return DEAL_DATES.filter((d) => dateAppliesAt(d, stage, isAuction));
}

/**
 * What the card SHOWS: the dates this stage offers, plus any date already set —
 * a deal moved back down the board must never keep a date it has no way to clear
 * (P8 review).
 */
export function datesShown(
  stage: string, isAuction: boolean, dates: Record<string, string | null | undefined>,
): DealDateSpec[] {
  const offered = datesFor(stage, isAuction);
  const keys = new Set(offered.map((d) => d.key));
  return [...offered, ...DEAL_DATES.filter((d) => !keys.has(d.key) && (dates[d.key] ?? '') !== '')];
}

const day = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function DealDates({ dealId, dealTitle, stage, isAuction, dates, busy, onSet }: DealDatesProps) {
  const specs = datesShown(stage, isAuction, dates);
  if (specs.length === 0) return null;
  return (
    <ul class="dc-dates">
      {specs.map((spec) => {
        const value = dates[spec.key] ?? '';
        return (
          <li class={value === '' ? 'dc-date' : 'dc-date dc-date-set'}>
            <label for={`date-${spec.key}-${dealId}`}>
              {value === '' ? spec.add : TODAY_COPY.dateSet(spec.label, day(value))}
              <span class="sr-only">{TODAY_COPY.dateFor(dealTitle)}</span>
            </label>
            {/* A REAL, VISIBLE FIELD (P12). This input used to be stretched over
                its own label at opacity 0, so a tap focused it — the lime ring —
                and nothing else: Safari opens a date picker only from the
                calendar indicator, which was invisible, so on a Mac the control
                did nothing at all. Shown, it is the browser's own date control on
                every platform and needs no script to open. */}
            <span class="dc-date-field">
              <input
                id={`date-${spec.key}-${dealId}`}
                type="date"
                value={value}
                disabled={busy}
                onChange={(e) => onSet(spec.key, (e.target as HTMLInputElement).value)}
              />
              {value !== '' && (
                <button
                  type="button"
                  class="btn-link dc-date-clear"
                  disabled={busy}
                  aria-label={TODAY_COPY.dateClearLabel(spec.noun, dealTitle)}
                  onClick={() => onSet(spec.key, '')}
                >
                  {TODAY_COPY.dateClear}
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
