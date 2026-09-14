/**
 * THE REFURB SECTION (R1 + R2) — the one number that moves a flip, with its
 * working, and now with regional starting points.
 *
 * THE LAW OF THE SUGGESTIONS (R2): they are starting points, never quotes.
 * Nothing is filled in until a row is ticked, every figure is editable the
 * instant it lands, every one is shown with the range around it, and the
 * caveat sits where the number is rather than in a footnote.
 *
 * NOBODY IS FORCED THROUGH THE LIST. The section opens as one money field and a
 * closed disclosure. Someone holding a builder's quote types it and moves on.
 *
 * NO MATHS HERE. The sum, which number is in charge, the regional and labour
 * arithmetic and the range all come from @gil-bricks/core (charter rule 3).
 * This ticks boxes and formats pounds.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  REFURB_MODE, fmtMoney, isSuggestion, refurbMode, refurbRange, refurbTotal, regionForPostcode,
  refurbDuration, sayWeeks, sayMonths,
  suggestFor, sumRefurbLines, figuresAreStale, isRegionId, NO_SUGGESTION, REFURB_DRIVER,
  type CostBand, type CountryCode, type NoSuggestion, type PropertyFacts, type RefurbLine, type RegionId, type Suggestion,
} from '@gil-bricks/core';

import { CONTINGENCY, DEFAULT_LABOUR, LABOUR_OPTIONS, REFURB, REFURB_CAVEAT, REFURB_ITEMS, paramFor } from '../../config/refurb';
import { DURATION_COPY, REFURB_DURATION } from '../../config/refurbDuration';
import {
  FIGURES_INCLUDE_VAT, FIGURES_REVIEWED, figureSpecFor, labourFactor, regionMultiplier, suggestionsReady,
} from '../../config/refurbFigures';
import { REGION_LABELS } from '../../config/regions';
import { MoneyInput } from './MoneyInput';
import { Accordion } from './Accordion';
import { state, strategyParams, updateStrategy } from './state';
import { markEdited } from './provenance';
import { features } from '../../config/features';
/* R3 — the photo carousel, reached ONLY through its door. */
import { PhotoCarousel, flushSeen, loadSeen, photosFromParam } from '../../refurbcues';
import { REFURB_PHOTOS } from '../../config/refurb';

export const MODE_PARAM = 'rfList';
/** DP1 — the builder's own on-tools figure, in weeks. Two params, never one:
 *  a duration in this product is a range and a single box would invite a point. */
export const DURATION_FROM_PARAM = 'rfWkFrom';
export const DURATION_TO_PARAM = 'rfWkTo';
export const REGION_PARAM = 'rfRegion';
export const LABOUR_PARAM = 'rfLabour';
/** Per-item counts. Only `windows` uses one today. */
export const countParam = (key: string): string => `rfN${key.charAt(0).toUpperCase()}${key.slice(1)}`;

export function refurbParamKeys(): string[] {
  return [
    MODE_PARAM, REGION_PARAM, LABOUR_PARAM, DURATION_FROM_PARAM, DURATION_TO_PARAM,
    ...REFURB_ITEMS.map((i) => paramFor(i.key)),
    ...REFURB_ITEMS.filter((i) => i.driver === REFURB_DRIVER.perUnit).map((i) => countParam(i.key)),
  ];
}

const numOf = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== '' && raw !== undefined ? n : 0;
};
/** The builder's own figure, or null. Both boxes, in order, or neither. */
export function ownWeeksFrom(params: Record<string, string>): { from: number; to: number } | null {
  const from = Number(params[DURATION_FROM_PARAM]);
  const to = Number(params[DURATION_TO_PARAM]);
  if (!Number.isFinite(from) || from <= 0) return null;
  const upper = Number.isFinite(to) && to >= from ? to : from;
  return { from, to: upper };
}

const numOrNull = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== '' && raw !== undefined && n > 0 ? n : null;
};

export function linesFrom(params: Record<string, string>): RefurbLine[] {
  return REFURB_ITEMS.map((item) => {
    const raw = params[paramFor(item.key)];
    return { key: item.key, ticked: raw !== undefined && raw !== '', amount: numOf(raw) };
  });
}

/** The windows count, prefilled from bedrooms and plainly labelled as a guess. */
export function countFor(itemKey: string, params: Record<string, string>, beds: number | null): { value: number | null; guessed: boolean } {
  const typed = numOrNull(params[countParam(itemKey)]);
  if (typed !== null) return { value: typed, guessed: false };
  return { value: beds, guessed: beds !== null };
}

export function RefurbSection({ legacy, onLegacySeen, country, hasContingency }: {
  legacy: boolean;
  onLegacySeen: () => void;
  country: CountryCode | null;
  /** R2 — does THIS strategy's engine actually apply a contingency? Only flip
   * does. A contingency box on a strategy that ignores it would be exactly the
   * dead input R1 existed to remove, so it is not drawn there. */
  hasContingency: boolean;
}) {
  const p = strategyParams.value;
  const s = state.value;
  const lines = linesFrom(p);
  const listInCharge = (p[MODE_PARAM] ?? '') === '1';
  const storedRaw = p[REFURB.fieldKey] ?? '';
  const stored = storedRaw === '' ? null : numOf(storedRaw);
  const mode = listInCharge ? refurbMode(lines, stored) : REFURB_MODE.typed;
  const sum = sumRefurbLines(lines);
  const tickedCount = lines.filter((l) => l.ticked).length;
  const [open, setOpen] = useState(false);
  const [pickingRegion, setPickingRegion] = useState(false);
  /**
   * R3 — the seen-set, read ONCE for the session and written ONCE at the end.
   * A read per photo or a write per tip would be a request every few seconds
   * from every user; the free tier would survive it and it would still be wrong.
   */
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const addedCues = useRef<Set<string>>(new Set());
  const photos = features.refurbPhotos
    ? photosFromParam(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('ph'))
    : [];

  useEffect(() => {
    if (!features.refurbPhotos) return;
    let live = true;
    void loadSeen(async () => {
      const res = await fetch('/api/refurb-cues/seen', { credentials: 'same-origin' });
      if (!res.ok) return null;
      return ((await res.json()) as { seen?: string[] }).seen ?? null;
    }).then(({ seen: s }) => { if (live) setSeen(s); });
    const flush = (): void => {
      void flushSeen(addedCues.current, new Set([...seen, ...addedCues.current]), async (keys) => {
        await fetch('/api/refurb-cues/seen', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ keys }),
        });
      });
    };
    window.addEventListener('pagehide', flush);
    return () => { live = false; window.removeEventListener('pagehide', flush); flush(); };
  }, []);
  const focusNext = useRef<string | null>(null);

  // ---- R2: what we know about this property, and what we can offer ----------
  // R2 needs BOTH its flag and the operator's figures. Either missing and the
  // section is exactly what R1 shipped.
  const ready = features.refurbSuggestions && suggestionsReady();
  const chosenRegion = p[REGION_PARAM] ?? '';
  const region: RegionId | null = isRegionId(chosenRegion)
    ? chosenRegion
    : regionForPostcode(s.postcode, country);
  const labourId = p[LABOUR_PARAM] === undefined || p[LABOUR_PARAM] === '' ? DEFAULT_LABOUR : p[LABOUR_PARAM];
  const beds = numOrNull(s.beds);
  const facts: PropertyFacts = {
    region,
    floorAreaSqm: numOrNull(s.area),
    beds,
    counts: Object.fromEntries(REFURB_ITEMS.filter((i) => i.driver === REFURB_DRIVER.perUnit)
      .map((i) => [i.key, countFor(i.key, p, beds).value])),
  };
  const suggestionOf = (key: string): Suggestion | NoSuggestion | null => {
    if (!ready) return null;
    const item = REFURB_ITEMS.find((i) => i.key === key);
    if (item === undefined) return null;
    return suggestFor(figureSpecFor(key), item.driver, key, facts, regionMultiplier(region), labourFactor(labourId));
  };

  /** The band behind a ticked row, for the total's own range. */
  const bandsOfTicked = (): CostBand[] => lines.filter((l) => l.ticked).map((l) => {
    const sug = suggestionOf(l.key);
    // A row the person has retyped is its own number with no range around it.
    if (sug === null || !isSuggestion(sug) || sug.band.mid !== l.amount) {
      return { mid: l.amount, low: l.amount, high: l.amount };
    }
    return sug.band;
  });

  const contingencyPct = hasContingency ? numOf(p.contingencyPct ?? CONTINGENCY.default) : 0;
  const totalBand = refurbRange(bandsOfTicked(), contingencyPct);

  useEffect(() => {
    if (focusNext.current === null) return;
    const el = document.getElementById(`rf-amt-${focusNext.current}`);
    focusNext.current = null;
    if (el instanceof HTMLInputElement) el.focus();
  });

  /**
   * A ROW CHANGE WRITES THE ROW AND THE TOTAL IN ONE GO. `refurbCost` is the
   * only param the score reads, so the list's sum has to land there — and if it
   * landed a moment later, the person's own keystroke would look exactly like an
   * outside write and the section would accuse a builder's quote that had not
   * happened. Written together, the two can only disagree because something
   * ELSE moved the total.
   */
  const writeLines = (make: (from: RefurbLine[]) => RefurbLine[], extra: Record<string, string> = {}): void => {
    // READ THE LIVE PARAMS, NOT THE RENDER-TIME SNAPSHOT. Two ticks landing in
    // one tick of the event loop — a fast double tap, a keyboard repeat, a
    // screen reader firing both — would otherwise both start from the same
    // stale `lines` and the second would overwrite the first's contribution.
    // Found on the deployed site by ticking four rows without waiting: the
    // total came back as the last row alone.
    const next = make(linesFrom(strategyParams.value));
    const stillTicked = next.some((l) => l.ticked);
    updateStrategy({
      ...extra,
      [MODE_PARAM]: stillTicked ? '1' : '',
      ...(stillTicked ? { [REFURB.fieldKey]: String(sumRefurbLines(next)) } : {}),
    });
    markEdited(REFURB.fieldKey);
  };

  const setLine = (key: string, raw: string): void => {
    writeLines((from) => from.map((l) => (l.key === key ? { ...l, ticked: true, amount: numOf(raw) } : l)),
      { [paramFor(key)]: raw === '' ? '0' : raw });
  };

  /**
   * TICKING A ROW FILLS IT IN — this is what makes it quick. The mid-point for
   * THIS region, THIS property and THIS labour choice lands in the box, already
   * editable. A row we cannot size lands empty with a line saying what is
   * missing, rather than a guess. Nothing is ever pre-filled unticked.
   */
  const toggle = (key: string, on: boolean): void => {
    if (on) focusNext.current = key;
    const sug = on ? suggestionOf(key) : null;
    const filled = sug !== null && isSuggestion(sug) && sug.band.mid !== null ? sug.band.mid : null;
    writeLines((from) => {
      const amount = on ? (filled ?? from.find((l) => l.key === key)?.amount ?? 0) : 0;
      return from.map((l) => (l.key === key ? { ...l, ticked: on, amount } : l));
    }, { [paramFor(key)]: on ? String(filled ?? lines.find((l) => l.key === key)?.amount ?? 0) : '' });
  };

  const displayTotal = refurbTotal(lines, stored);
  /** DP1 — the runway for the ticked scope. The engine bands it; this reads it. */
  const duration = refurbDuration(
    lines.filter((l) => l.ticked).map((l) => l.key),
    REFURB_DURATION,
    ownWeeksFrom(p),
  );
  const reviewedStale = figuresAreStale(FIGURES_REVIEWED, Date.now(), REFURB.staleAfterMonths);

  return (
    <section class="glass card refurb" id={REFURB.sectionId} aria-labelledby="refurb-h">
      <h2 id="refurb-h">{REFURB.copy.heading}</h2>
      <p class="hint">{REFURB.copy.lead}</p>

      {legacy && (
        <p class="refurb-legacy" role="status">
          {REFURB.copy.legacy}{' '}
          <button type="button" class="link-btn" onClick={onLegacySeen}>{REFURB.copy.legacyDismiss}</button>
        </p>
      )}

      <div class="field refurb-total">
        <label for={`sf-${REFURB.fieldKey}`}>{REFURB.copy.totalLabel} (£)</label>
        {mode === REFURB_MODE.typed ? (
          <MoneyInput
            id={`sf-${REFURB.fieldKey}`}
            value={storedRaw}
            onValue={(raw) => updateStrategy({ [REFURB.fieldKey]: raw })}
            onEdited={() => markEdited(REFURB.fieldKey)}
          />
        ) : (
          <output id={`sf-${REFURB.fieldKey}`} class="refurb-derived">{fmtMoney(displayTotal)}</output>
        )}
        {mode === REFURB_MODE.itemised && ready && totalBand.low !== null && totalBand.high !== null && (
          <p class="field-hint refurb-range">{REFURB.copy.totalRange(fmtMoney(totalBand.low), fmtMoney(totalBand.high))}</p>
        )}
        {mode === REFURB_MODE.itemised && <p class="field-hint">{REFURB.copy.listInCharge}</p>}
        {mode === REFURB_MODE.superseded && (
          <p class="field-hint refurb-superseded" role="status">
            {REFURB.copy.superseded(fmtMoney(displayTotal))} {REFURB.copy.supersededWhy}
          </p>
        )}
      </div>

      {/* R3 — the listing's photos, one at a time, with the SAME checkboxes
          underneath. Collapsing them leaves exactly the list that was here
          before, which is the promise: a new way in, not a replacement. */}
      {features.refurbPhotos && photos.length > 0 && (
        <PhotoCarousel
          photos={photos}
          seen={seen}
          onCueShown={(k) => { addedCues.current.add(k); }}
          tickedItems={new Set(lines.filter((l) => l.ticked).map((l) => l.key))}
          onTickItem={(itemKey) => {
            // The loop: you see it, you tick it, the total moves, the deal re-scores.
            const sug = suggestionOf(itemKey);
            const filled = sug !== null && isSuggestion(sug) && sug.band.mid !== null ? sug.band.mid : 0;
            writeLines(
              (from) => from.map((l) => (l.key === itemKey ? { ...l, ticked: true, amount: filled } : l)),
              { [paramFor(itemKey)]: String(filled) },
            );
          }}
        />
      )}
      <button type="button" class="refurb-toggle" aria-expanded={open} aria-controls="refurb-list" onClick={() => setOpen(!open)}>
        {open ? REFURB.copy.breakdownOpen : REFURB.copy.breakdown}
        {tickedCount > 0 && <span class="refurb-count"> · {REFURB.copy.sumLine(tickedCount, fmtMoney(sum))}</span>}
      </button>

      <div id="refurb-list" class="refurb-list" hidden={!open}>
        {!ready && <p class="hint refurb-waiting">{REFURB.copy.figuresEmpty}</p>}

        {ready && (
          <div class="refurb-region">
            {region === null && !pickingRegion && <p class="hint">{REFURB.copy.regionUnknown}</p>}
            {region !== null && !pickingRegion && (
              <p class="hint">
                {REFURB.copy.regionLine(REGION_LABELS[region])}{' '}
                <button type="button" class="link-btn" onClick={() => setPickingRegion(true)}>{REFURB.copy.regionChange}</button>
              </p>
            )}
            {(pickingRegion || region === null) && (
              <div class="field">
                <label for="rf-region">{REFURB.copy.regionLabel}</label>
                <select
                  id="rf-region"
                  value={region ?? ''}
                  onChange={(e) => {
                    updateStrategy({ [REGION_PARAM]: (e.target as HTMLSelectElement).value });
                    setPickingRegion(false);
                  }}
                >
                  <option value="">{REFURB.copy.regionUnknown}</option>
                  {Object.entries(REGION_LABELS).map(([id, label]) => <option value={id}>{label}</option>)}
                </select>
              </div>
            )}
            <p class="hint refurb-mine">{REFURB.figuresLabel}</p>
          </div>
        )}

        <ul class={`refurb-rows${mode === REFURB_MODE.superseded ? ' is-superseded' : ''}`}>
          {REFURB_ITEMS.map((item) => {
            const line = lines.find((l) => l.key === item.key);
            const ticked = line?.ticked === true;
            const sug = suggestionOf(item.key);
            const count = item.driver === REFURB_DRIVER.perUnit ? countFor(item.key, p, beds) : null;
            return (
              <li class={`refurb-row${ticked ? ' is-on' : ''}`} key={item.key}>
                <label class="refurb-tick" for={`rf-${item.key}`}>
                  <input type="checkbox" id={`rf-${item.key}`} checked={ticked}
                    onChange={(e) => toggle(item.key, (e.target as HTMLInputElement).checked)} />
                  <span class="refurb-name">{item.label}</span>
                  {ticked && <span class="refurb-amt-shown">{fmtMoney(line?.amount ?? 0)}</span>}
                </label>
                {item.hint && !ticked && <p class="refurb-hint">{item.hint}</p>}
                {/* A row we cannot size says which fact is missing, rather than
                    contributing a guess to a total somebody then trusts. */}
                {sug === NO_SUGGESTION.needsArea && <p class="refurb-hint refurb-needs">{REFURB.copy.needsArea}</p>}
                {sug === NO_SUGGESTION.needsBeds && <p class="refurb-hint refurb-needs">{REFURB.copy.needsBeds}</p>}
                {ticked && (
                  <div class="refurb-amount">
                    <label class="sr-only" for={`rf-amt-${item.key}`}>{REFURB.copy.amountLabel(item.label)}</label>
                    <MoneyInput id={`rf-amt-${item.key}`}
                      value={line?.amount === 0 ? '' : String(line?.amount ?? '')}
                      onValue={(raw) => setLine(item.key, raw === '' ? '0' : raw)} />
                    {count !== null && (
                      <span class="refurb-count-box">
                        <label class="sr-only" for={`rf-n-${item.key}`}>{REFURB.copy.countLabel(item.label)}</label>
                        <input id={`rf-n-${item.key}`} inputMode="numeric" class="refurb-n"
                          value={count.value === null ? '' : String(count.value)}
                          placeholder={REFURB.copy.needsCount}
                          onInput={(e) => updateStrategy({ [countParam(item.key)]: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
                      </span>
                    )}
                  </div>
                )}
                {ticked && count?.guessed === true && <p class="refurb-hint">{REFURB.copy.countGuess}</p>}
                {ticked && sug !== null && isSuggestion(sug) && sug.band.low !== null && sug.band.high !== null && (
                  <p class="refurb-hint refurb-row-range">{REFURB.copy.rowRange(fmtMoney(sug.band.low), fmtMoney(sug.band.high))}</p>
                )}
              </li>
            );
          })}
        </ul>

        {ready && (
          <div class="field refurb-labour">
            <label for="rf-labour">{REFURB.copy.labourLabel}</label>
            <select id="rf-labour" value={labourId}
              onChange={(e) => updateStrategy({ [LABOUR_PARAM]: (e.target as HTMLSelectElement).value })}>
              {LABOUR_OPTIONS.map((o) => <option value={o.id}>{o.label}</option>)}
            </select>
            <p class="field-hint">{LABOUR_OPTIONS.find((o) => o.id === labourId)?.note}</p>
          </div>
        )}

        {ready && hasContingency && (
          <div class="field refurb-contingency">
            <label for="rf-contingency">{CONTINGENCY.label} ({CONTINGENCY.unit})</label>
            <input id="rf-contingency" inputMode="decimal"
              value={p.contingencyPct ?? CONTINGENCY.default}
              onInput={(e) => { updateStrategy({ contingencyPct: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') }); markEdited('contingencyPct'); }} />
            <p class="field-hint">{CONTINGENCY.note}</p>
          </div>
        )}

        {/* DP1 — HOW LONG, not just how much. The runway is four parts and the
            field shows all four, because a builder's "three weeks" is three
            weeks on tools and the money is tied up far longer than that. */}
        {features.dealPack && (
          <div class="refurb-duration">
            <h4>{DURATION_COPY.heading}</h4>
            {duration === null
              ? <p class="hint">{DURATION_COPY.none}</p>
              : (
                <>
                  <p class="refurb-duration-total">
                    {sayWeeks(duration.total)}
                    <span class="refurb-duration-tag">{DURATION_COPY.estimateLabel}</span>
                  </p>
                  <p class="hint">{sayMonths(duration.total)} · {DURATION_COPY.runway}</p>
                  <ul class="refurb-duration-parts">
                    <li><span>{DURATION_COPY.parts.leadIn}</span> <span>{sayWeeks(duration.parts.leadIn)}</span></li>
                    <li><span>{DURATION_COPY.parts.onTools}</span> <span>{sayWeeks(duration.parts.onTools)}</span></li>
                    <li><span>{DURATION_COPY.parts.snagging}</span> <span>{sayWeeks(duration.parts.snagging)}</span></li>
                    <li><span>{DURATION_COPY.parts.voidPeriod}</span> <span>{sayWeeks(duration.parts.voidPeriod)}</span></li>
                  </ul>
                  <p class="hint">
                    {duration.fromBuilder
                      ? DURATION_COPY.basisBuilder
                      : DURATION_COPY.basis(DURATION_COPY.bandNames[duration.band] ?? duration.band)}
                  </p>
                </>
              )}
            <div class="field refurb-duration-own">
              <span class="refurb-duration-own-label" id="rf-wk-label">{DURATION_COPY.ownLabel}</span>
              <span class="refurb-duration-own-boxes">
                <label class="sr-only" for="rf-wk-from">{DURATION_COPY.ownFrom}</label>
                <input id="rf-wk-from" inputMode="numeric" class="refurb-n" aria-describedby="rf-wk-label"
                  placeholder={DURATION_COPY.ownFrom}
                  value={p[DURATION_FROM_PARAM] ?? ''}
                  onInput={(e) => updateStrategy({ [DURATION_FROM_PARAM]: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
                <label class="sr-only" for="rf-wk-to">{DURATION_COPY.ownTo}</label>
                <input id="rf-wk-to" inputMode="numeric" class="refurb-n" aria-describedby="rf-wk-label"
                  placeholder={DURATION_COPY.ownTo}
                  value={p[DURATION_TO_PARAM] ?? ''}
                  onInput={(e) => updateStrategy({ [DURATION_TO_PARAM]: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
              </span>
              <p class="field-hint">{DURATION_COPY.ownHint}</p>
            </div>
          </div>
        )}

        <p class="refurb-sum">
          {tickedCount === 0
            ? REFURB.copy.nothingTicked
            : `${REFURB.copy.sumLabel}: ${REFURB.copy.sumLine(tickedCount, fmtMoney(sum))}`}
        </p>

        {ready && tickedCount > 0 && (
          <Accordion label={REFURB.copy.maths}>
            <table class="refurb-maths">
              <thead>
                <tr>
                  <th scope="col">{REFURB.copy.mathsItem}</th>
                  <th scope="col">{REFURB.copy.mathsBase}</th>
                  <th scope="col">{REFURB.copy.mathsRegion}</th>
                  <th scope="col">{REFURB.copy.mathsLabour}</th>
                  <th scope="col">{REFURB.copy.mathsRow}</th>
                </tr>
              </thead>
              <tbody>
                {lines.filter((l) => l.ticked).map((l) => {
                  const item = REFURB_ITEMS.find((i) => i.key === l.key);
                  const sug = suggestionOf(l.key);
                  const st = sug !== null && isSuggestion(sug) ? sug.steps : null;
                  return (
                    <tr key={l.key}>
                      <th scope="row">{item?.label}</th>
                      <td>{st === null || st.base.mid === null ? '—'
                        : st.quantity === null || st.driver === REFURB_DRIVER.beds
                          ? fmtMoney(st.base.mid)
                          : REFURB.copy.mathsQuantity(fmtMoney(st.base.mid), String(st.quantity))}</td>
                      <td>{st === null || st.regionMultiplier === null ? '—' : `× ${st.regionMultiplier}`}</td>
                      <td>{st === null || st.labourFactor === null ? '—' : `× ${st.labourFactor}`}</td>
                      <td>{fmtMoney(l.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><th scope="row" colSpan={4}>{REFURB.copy.mathsSubtotal}</th><td>{fmtMoney(sum)}</td></tr>
                {hasContingency && (
                  <tr>
                    <th scope="row" colSpan={4}>{REFURB.copy.mathsContingency(String(contingencyPct))}</th>
                    <td>{fmtMoney(Math.round(sum * contingencyPct / 100))}</td>
                  </tr>
                )}
                <tr><th scope="row" colSpan={4}>{REFURB.copy.mathsTotal}</th>
                  <td>{totalBand.mid === null ? fmtMoney(sum) : fmtMoney(totalBand.mid)}</td></tr>
              </tfoot>
            </table>
          </Accordion>
        )}

        {ready && (
          <div class="refurb-caveat">
            <h4>{REFURB_CAVEAT.heading}</h4>
            {REFURB_CAVEAT.lines.map((l) => <p key={l}>{l}</p>)}
            {FIGURES_INCLUDE_VAT !== null && <p>{REFURB_CAVEAT.vat(FIGURES_INCLUDE_VAT)}</p>}
            {FIGURES_REVIEWED !== null && (
              <p class="refurb-reviewed">
                {REFURB.copy.reviewed(FIGURES_REVIEWED)}{reviewedStale ? ` ${REFURB.copy.stale}` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
