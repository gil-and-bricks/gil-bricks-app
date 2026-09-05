/**
 * The stamp duty / LTT calculator (T2). THE ANSWER IS NEVER GATED: three
 * inputs, an instant answer, nothing sent anywhere. The page makes NO network
 * request of its own at all — the bands ship with the bundle.
 *
 * Every rate, threshold and effective-from date comes from rates.json through
 * @gil-bricks/core's `stampDuty`, the same engine every analyser uses, so a
 * rate change moves the tool and the analysers together. Nothing here computes
 * tax: this file formats what the engine returns.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { fmtDate, fmtMoney, fmtPct, stampDuty, type BuyerType, type StampCountry, type StampDutyResult } from '@gil-bricks/core';
import { STAMP, TOOLS_COPY } from '../../config/tools';
import { features } from '../../config/features';
import { MoneyField } from './MoneyField';

const FIELD = { price: 'price', country: 'country', buyer: 'buyer' } as const;

/** The answer AND the inputs behind it: a card that outlives its inputs lies. */
interface Answer {
  result: StampDutyResult;
  /** The engine's own explanation — including WHY the additional-property
   *  rates applied, which is the surcharge line where there is one. */
  note: string;
  price: number;
  country: StampCountry;
}

export function StampDutyTool() {
  if (!features.toolsSection) return null;
  const [price, setPrice] = useState('');
  const [country, setCountry] = useState<StampCountry>(STAMP.form.countries[0].value as StampCountry);
  const [buyer, setBuyer] = useState<BuyerType>(STAMP.form.buyers[0].value as BuyerType);
  const [showErrors, setShowErrors] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const badPrice = Number(price) <= 0;

  const work = (): void => {
    setShowErrors(true);
    if (badPrice) {
      setAnswer(null);
      return;
    }
    const worked = stampDuty({ price: Number(price), country, buyerType: buyer });
    setAnswer({ result: worked.value, note: worked.breakdown.note ?? '', price: Number(price), country });
  };

  useEffect(() => {
    if (answer !== null) answerRef.current?.focus();
  }, [answer]);

  /** Any change retires the answer: a stale tax figure is worse than none. */
  const change = <T,>(set: (v: T) => void) => (v: T): void => {
    setAnswer(null);
    set(v);
  };

  const taxName = answer === null ? '' : STAMP.taxNames[answer.country];
  const effectiveRate = answer === null ? 0 : (answer.result.tax / answer.price) * 100;
  /** Each band, with the running total the maths panel shows. */
  const rows: { label: string; slice: number; rate: number; tax: number; running: number }[] = [];
  if (answer !== null) {
    let running = 0;
    for (const b of answer.result.bands) {
      running += b.tax;
      rows.push({
        label: STAMP.bandLabel(fmtMoney(b.from), b.to === null ? null : fmtMoney(b.to)),
        slice: b.slice,
        rate: b.rate * 100,
        tax: b.tax,
        running,
      });
    }
  }

  return (
    <>
      <section class="glass card tool-form" aria-labelledby="stamp-form-h">
        <h2 id="stamp-form-h">{STAMP.intro}</h2>
        <div class="subject-form">
          <div class="field">
            <label for="sd-price">{STAMP.form.price}</label>
            <MoneyField id="sd-price" value={price} onValue={change(setPrice)} />
            {showErrors && badPrice && <p class="field-error" role="alert">{STAMP.errors.price}</p>}
          </div>
          <div class="field">
            <label for="sd-country">{STAMP.form.country}</label>
            <select id="sd-country" name={FIELD.country} value={country}
              onChange={(e) => change(setCountry)((e.target as HTMLSelectElement).value as StampCountry)}>
              {STAMP.form.countries.map((c) => <option value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div class="field">
            <label for="sd-buyer">{STAMP.form.buyer}</label>
            <select id="sd-buyer" name={FIELD.buyer} value={buyer}
              onChange={(e) => change(setBuyer)((e.target as HTMLSelectElement).value as BuyerType)}>
              {STAMP.form.buyers.map((b) => <option value={b.value}>{b.label}</option>)}
            </select>
            <p class="field-hint">{STAMP.form.buyerHint}</p>
          </div>
        </div>
        <button type="button" class="btn-primary" onClick={work}>{STAMP.form.submit}</button>
      </section>

      {answer !== null && (
        <section class="glass card tool-answer" aria-labelledby="stamp-answer-h" tabIndex={-1} ref={answerRef}>
          <h2 id="stamp-answer-h">{STAMP.h1}</h2>
          <p class="big-figure">{fmtMoney(answer.result.tax)}</p>
          <p class="tool-answer-line" role="status">
            {answer.result.tax === 0
              ? STAMP.none(taxName)
              : STAMP.answer(fmtMoney(answer.result.tax), fmtPct(effectiveRate), taxName)}
          </p>
          <dl class="tool-figures">
            <div><dt>{STAMP.figures.tax}</dt><dd>{fmtMoney(answer.result.tax)}</dd></div>
            <div><dt>{STAMP.figures.rate}</dt><dd>{fmtPct(effectiveRate)}</dd></div>
            <div><dt>{STAMP.figures.regime}</dt><dd>{answer.result.regime}</dd></div>
          </dl>
          <ul class="tool-limits">
            {STAMP.limits.map((line) => <li>{line}</li>)}
          </ul>
          {/* The date the rates came into force — a stale calculator is the
              commonest complaint about these tools, so it is never hidden. */}
          <p class="hint tool-asof">{STAMP.asOf(fmtDate(answer.result.effectiveFrom))}</p>

          <details class="accordion">
            <summary class="accordion-btn">{TOOLS_COPY.howHeading}</summary>
            <div class="accordion-body">
              <div class="tool-scroll">
              <table class="tool-bands">
                <thead>
                  <tr>
                    <th scope="col">{STAMP.table.band}</th>
                    <th scope="col">{STAMP.table.slice}</th>
                    <th scope="col">{STAMP.table.rate}</th>
                    <th scope="col">{STAMP.table.tax}</th>
                    <th scope="col">{STAMP.table.running}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr>
                      <th scope="row">{r.label}</th>
                      <td>{fmtMoney(r.slice)}</td>
                      <td>{fmtPct(r.rate)}</td>
                      <td>{fmtMoney(r.tax)}</td>
                      <td>{fmtMoney(r.running)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4}>{STAMP.table.total}</th>
                    <td>{fmtMoney(answer.result.tax)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
              <p class="maths-note">{answer.result.regime}. {STAMP.asOf(fmtDate(answer.result.effectiveFrom))}</p>
              <p class="maths-note">{answer.note}</p>
              <p class="maths-note">{STAMP.source(answer.result.source.url)}</p>
            </div>
          </details>

          <p class="tool-onward">
            {STAMP.onward.line}{' '}
            <a href="/buy-to-let/analyser">{STAMP.onward.cta}</a>
          </p>
        </section>
      )}
    </>
  );
}
