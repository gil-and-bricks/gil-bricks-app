/**
 * The equity calculator (T1, save removed in T2). THE ANSWER IS NEVER GATED:
 * it appears the moment the three inputs are there, with no sign-in, no email
 * and nothing sent to us. The page's only load of its own is the index file.
 *
 * It imports ONLY pure leaf maths from @gil-bricks/core (equityFromHpi, the
 * formatters) plus the HPI data client, so the formula can never drift from
 * the analyser. It touches none of the analyser's state, engines or components.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { equityFromHpi, fmtMoney, fmtPct, getUkhpi, type EquityResult } from '@gil-bricks/core';
import { MoneyField } from './MoneyField';
import { EQUITY, TOOLS_COPY } from '../../config/tools';
import { features } from '../../config/features';

const FIELD = { paid: 'paid', month: 'month', year: 'year', owed: 'owed', region: 'region' } as const;
interface Hpi {
  month: string;
  table: Record<string, Record<string, number>>;
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
  const answerRef = useRef<HTMLDivElement>(null);

  // The index file is the ONLY fetch this component makes on its own.
  useEffect(() => {
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
    if (dataFailed || hpi === null || errors.paid || errors.month || errors.owed) {
      setAnswer(null);
      return;
    }
    build(paid, owed, month, region, indexThen, indexNow, hpi.month);
  };

  useEffect(() => {
    if (answer !== null) answerRef.current?.focus();
  }, [answer]);

  /** Any change to an input retires the answer: a stale card is worse than none. */
  const change = <T,>(set: (v: T) => void) => (v: T): void => {
    setAnswer(null);
    set(v);
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
            <MoneyField id="eq-paid" value={paid} onValue={change(setPaid)} />
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
            <MoneyField id="eq-owed" value={owed} onValue={change(setOwed)} />
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

        </section>
      )}
    </>
  );
}
