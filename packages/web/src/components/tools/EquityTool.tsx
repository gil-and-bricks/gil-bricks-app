/**
 * The equity calculator (T1). THE ANSWER IS NEVER GATED: it appears the moment
 * the three inputs are there, with no sign-in and no email. Saving is offered
 * AFTERWARDS and is entirely optional — skip it and this page makes no request
 * of its own beyond the house price index file.
 *
 * It imports ONLY pure leaf maths from @gil-bricks/core (equityFromHpi, the
 * formatters) plus the HPI data client, so the formula can never drift from
 * the analyser. It touches none of the analyser's state, engines or components.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { equityFromHpi, fmtMoney, fmtMoneyInput, fmtPct, getUkhpi, moneyCaret, parseMoneyInput, type EquityResult } from '@gil-bricks/core';
import { EQUITY, TOOLS_COPY } from '../../config/tools';
import { features } from '../../config/features';
import { loadMe, me, openLoginWall } from '../../lib/auth/session';

const FIELD = { paid: 'paid', month: 'month', year: 'year', owed: 'owed', region: 'region' } as const;
/** Save states — identifiers, never shown to anyone. */
const SAVE = { idle: 'idle', saving: 'saving', saved: 'saved', failed: 'failed' } as const;
/**
 * Signing in is a full-page trip to Google and back, which would otherwise
 * throw away everything they typed. The four inputs wait here, in this tab
 * only, and are used once on the way back. Never the answer, never a figure
 * we did not get from them, never a cookie.
 */
const STASH = 'proplaunch.tool.equity';

interface Hpi {
  month: string;
  table: Record<string, Record<string, number>>;
}

interface Stash {
  paid: string;
  owed: string;
  month: string;
  region: string;
}

function readStash(): Stash | null {
  try {
    const raw = sessionStorage.getItem(STASH);
    sessionStorage.removeItem(STASH);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Partial<Stash>;
    if (typeof v.paid !== 'string' || typeof v.owed !== 'string') return null;
    if (typeof v.month !== 'string' || typeof v.region !== 'string') return null;
    return { paid: v.paid, owed: v.owed, month: v.month, region: v.region };
  } catch {
    return null;
  }
}

function Money({ id, value, onValue }: { id: string; value: string; onValue: (raw: string) => void }) {
  return (
    <input
      id={id}
      inputMode="numeric"
      autocomplete="off"
      value={fmtMoneyInput(value)}
      onInput={(e) => {
        const el = e.target as HTMLInputElement;
        const typed = el.value;
        const caret = el.selectionStart ?? typed.length;
        const raw = parseMoneyInput(typed);
        const formatted = fmtMoneyInput(raw);
        onValue(raw);
        const next = moneyCaret(typed, caret, formatted);
        requestAnimationFrame(() => {
          if (el.value === formatted) el.setSelectionRange(next, next);
        });
      }}
    />
  );
}

export function EquityTool() {
  if (!features.toolsSection) return null;
  const [paid, setPaid] = useState('');
  const [owed, setOwed] = useState('');
  /** 'YYYY-MM', built from the two pickers. Empty until both are chosen. */
  const [monthPart, setMonthPart] = useState('');
  const [yearPart, setYearPart] = useState('');
  const [region, setRegion] = useState<string>(EQUITY.form.regions[0].value);
  const [hpi, setHpi] = useState<Hpi | null>(null);
  const [dataFailed, setDataFailed] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  /** The answer AND the inputs it was worked out from. Rendering from live
   * state let a changed field print a sentence that did not add up. */
  const [answer, setAnswer] = useState<
    { result: EquityResult; paid: number; owed: number; month: string; region: string; asOf: string } | null
  >(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>(SAVE.idle);
  const answerRef = useRef<HTMLDivElement>(null);
  const restored = useRef<Stash | null>(null);

  // The index file is the ONLY fetch this component makes on its own.
  useEffect(() => {
    restored.current = readStash();
    void getUkhpi()
      .then((u) => setHpi({ month: u.ukhpiMonth, table: u.index as Record<string, Record<string, number>> }))
      .catch(() => setDataFailed(true));
  }, []);

  const table = hpi?.table[region] ?? {};
  const indexNow = hpi === null ? undefined : table[hpi.month];
  const month = monthPart === '' || yearPart === '' ? '' : `${yearPart}-${monthPart}`;
  const indexThen = month === '' ? undefined : table[month];
  const owedTyped = owed !== '';
  const errors = {
    paid: Number(paid) <= 0,
    month: month === '' || indexThen === undefined,
    owed: !owedTyped,
  };

  /** Every year the chosen country's index covers, newest first. */
  const years = Object.keys(table)
    .map((k) => k.slice(0, 4))
    .filter((y, i, all) => all.indexOf(y) === i)
    .sort()
    .reverse();
  /** Only the months that country actually has for the chosen year. */
  const months = EQUITY.form.monthNames
    .map((label, i) => ({ label, value: String(i + 1).padStart(2, '0') }))
    .filter((m) => yearPart === '' || table[`${yearPart}-${m.value}`] !== undefined);

  const build = (
    p: string,
    o: string,
    m: string,
    r: string,
    idxThen: number | undefined,
    idxNow: number | undefined,
    asOf: string,
  ): void => {
    if (idxThen === undefined || idxNow === undefined) return;
    const owedNow = Number(o);
    setAnswer({
      result: equityFromHpi({ paid: Number(p), owed: owedNow, indexThen: idxThen, indexNow: idxNow }),
      paid: Number(p),
      owed: owedNow,
      month: m,
      region: r,
      asOf,
    });
  };

  const work = (): void => {
    setShowErrors(true);
    setSaveState(SAVE.idle);
    if (dataFailed || hpi === null || errors.paid || errors.month || errors.owed) {
      setAnswer(null);
      return;
    }
    build(paid, owed, month, region, indexThen, indexNow, hpi.month);
  };

  // Coming back from Google: put their figures back and work the answer out
  // again, so the thing they asked to save is on screen where they left it.
  useEffect(() => {
    const s = restored.current;
    if (s === null || hpi === null) return;
    restored.current = null;
    setPaid(s.paid);
    setOwed(s.owed);
    setRegion(s.region);
    setYearPart(s.month.slice(0, 4));
    setMonthPart(s.month.slice(5, 7));
    const t = hpi.table[s.region] ?? {};
    build(s.paid, s.owed, s.month, s.region, t[s.month], t[hpi.month], hpi.month);
  }, [hpi]);

  useEffect(() => {
    if (answer !== null) answerRef.current?.focus();
  }, [answer]);

  /** Any change to an input retires the answer: a stale card is worse than none. */
  const change = <T,>(set: (v: T) => void) => (v: T): void => {
    setAnswer(null);
    setSaveState(SAVE.idle);
    set(v);
  };

  const save = async (): Promise<void> => {
    if (answer === null) return;
    // Ask the server who this is if the header's answer has not landed yet:
    // guessing here is how a signed-out tap turns into a dead 401.
    const who = me.value === undefined ? await loadMe() : me.value;
    if (who === null) {
      try {
        const stash: Stash = { paid, owed, month: answer.month, region: answer.region };
        sessionStorage.setItem(STASH, JSON.stringify(stash));
      } catch {
        // Private mode or storage off: they simply retype after signing in.
      }
      openLoginWall();
      return;
    }
    setSaveState(SAVE.saving);
    try {
      const res = await fetch('/api/tools/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: EQUITY.slug,
          inputs: { paid: answer.paid, owed: answer.owed, month: answer.month, region: answer.region },
          equity: Math.round(answer.result.equity),
        }),
      });
      // A session that expired while the page sat open: offer sign-in, not an error.
      if (res.status === 401) {
        setSaveState(SAVE.idle);
        openLoginWall();
        return;
      }
      setSaveState(res.ok ? SAVE.saved : SAVE.failed);
    } catch {
      setSaveState(SAVE.failed);
    }
  };

  const shownCountry = answer === null ? '' : (EQUITY.form.regions.find((r) => r.value === answer.region)?.label ?? '');
  const pct = answer === null ? '' : fmtPct(100 - answer.result.ltv);

  return (
    <>
      <section class="glass card tool-form" aria-labelledby="equity-form-h">
        <h2 id="equity-form-h">{EQUITY.intro}</h2>
        <div class="subject-form">
          <div class="field">
            <label for="eq-paid">{EQUITY.form.paid}</label>
            <Money id="eq-paid" value={paid} onValue={change(setPaid)} />
            {showErrors && errors.paid && <p class="field-error" role="alert">{EQUITY.errors.paid}</p>}
          </div>
          {/* Two selects, not <input type="month">: desktop Safari and Firefox
              render that as a plain text box, which nothing here can parse. */}
          <fieldset class="field tool-month">
            <legend>{EQUITY.form.month}</legend>
            <div class="tool-month-pair">
              <label for="eq-month">
                <span>{EQUITY.form.monthPart}</span>
                <select id="eq-month" name={FIELD.month} value={monthPart}
                  onChange={(e) => change(setMonthPart)((e.target as HTMLSelectElement).value)}>
                  <option value="">{EQUITY.form.choose}</option>
                  {months.map((m) => <option value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label for="eq-year">
                <span>{EQUITY.form.yearPart}</span>
                <select id="eq-year" name={FIELD.year} value={yearPart}
                  onChange={(e) => {
                    const y = (e.target as HTMLSelectElement).value;
                    // A year the index stops mid-way through cannot keep a
                    // later month selected, or the button would refuse silently.
                    if (monthPart !== '' && y !== '' && table[`${y}-${monthPart}`] === undefined) setMonthPart('');
                    change(setYearPart)(y);
                  }}>
                  <option value="">{EQUITY.form.choose}</option>
                  {years.map((y) => <option value={y}>{y}</option>)}
                </select>
              </label>
            </div>
            {hpi !== null && <p class="field-hint">{EQUITY.form.monthHint(hpi.month)}</p>}
            {showErrors && errors.month && !dataFailed && (
              <p class="field-error" role="alert">{EQUITY.errors.month}</p>
            )}
          </fieldset>
          <div class="field">
            <label for="eq-owed">{EQUITY.form.owed}</label>
            <Money id="eq-owed" value={owed} onValue={change(setOwed)} />
            <p class="field-hint">{EQUITY.form.owedHint}</p>
            {showErrors && errors.owed && <p class="field-error" role="alert">{EQUITY.errors.owed}</p>}
          </div>
          <div class="field">
            <label for="eq-region">{EQUITY.form.region}</label>
            <select id="eq-region" name={FIELD.region} value={region}
              onChange={(e) => change(setRegion)((e.target as HTMLSelectElement).value)}>
              {EQUITY.form.regions.map((r) => <option value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {dataFailed && <p class="field-error" role="alert">{EQUITY.errors.dataDown}</p>}
        <button type="button" class="btn-primary" onClick={work} disabled={hpi === null}>
          {EQUITY.form.submit}
        </button>
      </section>

      {answer !== null && (
        <section class="glass card tool-answer" aria-labelledby="equity-answer-h" tabIndex={-1} ref={answerRef}>
          <h2 id="equity-answer-h">{EQUITY.h1}</h2>
          <p class="big-figure">{fmtMoney(answer.result.equity)}</p>
          <p class="tool-answer-line" role="status">
            {answer.result.equity < 0
              ? EQUITY.negative(fmtMoney(Math.abs(answer.result.equity)))
              : answer.owed === 0
                ? EQUITY.outright(fmtMoney(answer.result.value))
                : EQUITY.answer(fmtMoney(answer.result.value), fmtMoney(answer.owed), fmtMoney(answer.result.equity), pct)}
          </p>
          {/* The three figures the sprint asks for, in every case. */}
          <dl class="tool-figures">
            <div><dt>{EQUITY.figures.value}</dt><dd>{fmtMoney(answer.result.value)}</dd></div>
            <div><dt>{EQUITY.figures.equity}</dt><dd>{fmtMoney(answer.result.equity)}</dd></div>
            <div><dt>{EQUITY.figures.ltv}</dt><dd>{answer.owed === 0 ? EQUITY.figures.noLoan : fmtPct(answer.result.ltv)}</dd></div>
          </dl>
          {/* The limits, next to the answer — never below the fold. */}
          <ul class="tool-limits">
            {EQUITY.limits.map((line) => <li>{line}</li>)}
          </ul>
          <p class="hint">{EQUITY.asOf(answer.asOf, shownCountry)}</p>

          <details class="accordion">
            <summary class="accordion-btn">{TOOLS_COPY.howHeading}</summary>
            <div class="accordion-body">
              <dl class="maths">
                <dt>{TOOLS_COPY.maths.formula}</dt>
                <dd>{answer.result.breakdown.formula}</dd>
                <dt>{TOOLS_COPY.maths.numbers}</dt>
                <dd>{answer.result.breakdown.substituted}</dd>
                <dt>{TOOLS_COPY.maths.result}</dt>
                <dd>{answer.result.breakdown.result}</dd>
              </dl>
              <p class="maths-note">{answer.result.breakdown.note}</p>
            </div>
          </details>

          <p class="tool-onward">
            {EQUITY.onward.line}{' '}
            <a href="/buy-to-let/analyser">{EQUITY.onward.cta}</a>
          </p>

          {/* Offered AFTER the answer. Skip it and nothing is ever sent to us:
              the page's only loads are the index file and the header's own
              "who is signed in?", which every page on the site asks. */}
          <div class="tool-save">
            <h3 class="state-h">{EQUITY.save.heading}</h3>
            <p class="hint">{EQUITY.save.body}</p>
            <p class="hint">{EQUITY.save.note}</p>
            {saveState === SAVE.saved ? (
              <p class="hint" role="status">{EQUITY.save.saved}</p>
            ) : (
              <button type="button" class="btn-secondary" disabled={saveState === SAVE.saving} onClick={() => void save()}>
                {saveState === SAVE.saving ? EQUITY.save.saving : EQUITY.save.signedIn}
              </button>
            )}
            {saveState === SAVE.failed && <p class="field-error" role="alert">{EQUITY.save.failed}</p>}
          </div>
        </section>
      )}
    </>
  );
}
