/**
 * The rental yield calculator (T2). THE ANSWER IS NEVER GATED: two inputs, an
 * instant answer, nothing sent anywhere and no network request of its own.
 *
 * NET IS THE POINT. Every yield calculator on the internet flatters the number
 * by hiding the costs; this one shows both, gives net the emphasis, and puts
 * every cost line on screen. The maths is @gil-bricks/core's `rentalYield`,
 * which composes the locked gross/net definitions and the analyser's own cost
 * model — this file formats, it never computes.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { fmtMoney, fmtPct, rentalCostDefaults, rentalYield, type RentalYieldResult } from '@gil-bricks/core';
import { YIELD, TOOLS_COPY } from '../../config/tools';
import { features } from '../../config/features';
import { MoneyField } from './MoneyField';

const FIELD = {
  price: 'price', rent: 'rent', management: 'management', maintenance: 'maintenance',
  insurance: 'insurance', voids: 'voids', groundRent: 'groundRent',
} as const;

const DEFAULTS = rentalCostDefaults();
/** A year has 52 weeks; core throws above that, so the field says so first. */
const MAX_VOID_WEEKS = 52;

/** A plain number field for the cost inputs (percentages and weeks). */
function NumberField({ id, value, onValue, step, max }: { id: string; value: string; onValue: (v: string) => void; step: string; max?: string }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      min="0"
      max={max}
      step={step}
      value={value}
      onInput={(e) => onValue((e.target as HTMLInputElement).value)}
    />
  );
}

export function RentalYieldTool() {
  if (!features.toolsSection) return null;
  const [price, setPrice] = useState('');
  const [rent, setRent] = useState('');
  const [management, setManagement] = useState(String(DEFAULTS.managementPct));
  const [maintenance, setMaintenance] = useState(String(DEFAULTS.maintPct));
  const [insurance, setInsurance] = useState(String(DEFAULTS.insurance));
  const [voids, setVoids] = useState(String(DEFAULTS.voidWeeks));
  const [groundRent, setGroundRent] = useState(String(DEFAULTS.groundRent));
  const [showErrors, setShowErrors] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const [answer, setAnswer] = useState<RentalYieldResult | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  /** One message per field, naming the fault it actually has. */
  const costError = (v: string, key: string): string | null => {
    if (v === '' || !Number.isFinite(Number(v))) return YIELD.errors.blank;
    if (Number(v) < 0) return YIELD.errors.negative;
    if (key === FIELD.voids && Number(v) > MAX_VOID_WEEKS) return YIELD.errors.voids;
    return null;
  };
  const costErrors = {
    management: costError(management, FIELD.management),
    maintenance: costError(maintenance, FIELD.maintenance),
    insurance: costError(insurance, FIELD.insurance),
    voids: costError(voids, FIELD.voids),
    groundRent: costError(groundRent, FIELD.groundRent),
  };
  const errors = {
    price: Number(price) <= 0,
    rent: Number(rent) <= 0,
    costs: Object.values(costErrors).some((e) => e !== null),
  };

  const work = (): void => {
    setShowErrors(true);
    if (errors.price || errors.rent || errors.costs) {
      // A fault the person cannot see is a dead button: open the section that
      // holds it rather than failing silently behind a closed accordion.
      if (errors.costs) setCostsOpen(true);
      setAnswer(null);
      return;
    }
    setAnswer(
      rentalYield({
        price: Number(price),
        monthlyRent: Number(rent),
        costs: {
          managementPct: Number(management),
          maintPct: Number(maintenance),
          insurance: Number(insurance),
          voidWeeks: Number(voids),
          groundRent: Number(groundRent),
        },
      }),
    );
  };

  useEffect(() => {
    if (answer !== null) answerRef.current?.focus();
  }, [answer]);

  /** Any change retires the answer: a stale yield is worse than none. */
  const change = <T,>(set: (v: T) => void) => (v: T): void => {
    setAnswer(null);
    set(v);
  };

  const costRows = answer === null ? [] : [
    { label: YIELD.costLines.management, amount: answer.lines.management },
    { label: YIELD.costLines.maintenance, amount: answer.lines.maintenance },
    { label: YIELD.costLines.insurance, amount: answer.lines.insurance },
    { label: YIELD.costLines.voids, amount: answer.lines.voids },
    { label: YIELD.costLines.groundRent, amount: answer.lines.groundRent },
  ];

  return (
    <>
      <section class="glass card tool-form" aria-labelledby="yield-form-h">
        <h2 id="yield-form-h">{YIELD.intro}</h2>
        <div class="subject-form">
          <div class="field">
            <label for="ry-price">{YIELD.form.price}</label>
            <MoneyField id="ry-price" value={price} onValue={change(setPrice)} />
            {showErrors && errors.price && <p class="field-error" role="alert">{YIELD.errors.price}</p>}
          </div>
          <div class="field">
            <label for="ry-rent">{YIELD.form.rent}</label>
            <MoneyField id="ry-rent" value={rent} onValue={change(setRent)} />
            {showErrors && errors.rent && <p class="field-error" role="alert">{YIELD.errors.rent}</p>}
          </div>
        </div>

        {/* Costs are collapsed, but they are the whole difference between the
            two numbers, so the summary says so and every default is editable. */}
        <details class="accordion tool-costs" open={costsOpen} onToggle={(e) => setCostsOpen((e.target as HTMLDetailsElement).open)}>
          <summary class="accordion-btn">{YIELD.form.costsHeading}</summary>
          <div class="accordion-body">
            <p class="field-hint">{YIELD.form.costsHint}</p>
            <div class="subject-form">
              <div class="field">
                <label for="ry-management">{YIELD.form.management}</label>
                <NumberField id="ry-management" value={management} onValue={change(setManagement)} step="0.5" />
                {showErrors && costErrors.management !== null && <p class="field-error" role="alert">{costErrors.management}</p>}
              </div>
              <div class="field">
                <label for="ry-maintenance">{YIELD.form.maintenance}</label>
                <NumberField id="ry-maintenance" value={maintenance} onValue={change(setMaintenance)} step="0.1" />
                {showErrors && costErrors.maintenance !== null && <p class="field-error" role="alert">{costErrors.maintenance}</p>}
              </div>
              <div class="field">
                <label for="ry-insurance">{YIELD.form.insurance}</label>
                <NumberField id="ry-insurance" value={insurance} onValue={change(setInsurance)} step="10" />
                {showErrors && costErrors.insurance !== null && <p class="field-error" role="alert">{costErrors.insurance}</p>}
              </div>
              <div class="field">
                <label for="ry-voids">{YIELD.form.voids}</label>
                <NumberField id="ry-voids" value={voids} onValue={change(setVoids)} step="1" max={String(MAX_VOID_WEEKS)} />
                {showErrors && costErrors.voids !== null && <p class="field-error" role="alert">{costErrors.voids}</p>}
              </div>
              <div class="field">
                <label for="ry-ground">{YIELD.form.groundRent}</label>
                <NumberField id="ry-ground" value={groundRent} onValue={change(setGroundRent)} step="10" />
                {showErrors && costErrors.groundRent !== null && <p class="field-error" role="alert">{costErrors.groundRent}</p>}
              </div>
            </div>
          </div>
        </details>

        {showErrors && errors.costs && <p class="field-error" role="alert">{YIELD.errors.inCosts}</p>}
        <button type="button" class="btn-primary" onClick={work}>{YIELD.form.submit}</button>
      </section>

      {answer !== null && (
        <section class="glass card tool-answer" aria-labelledby="yield-answer-h" tabIndex={-1} ref={answerRef}>
          <h2 id="yield-answer-h">{YIELD.h1}</h2>
          {/* The BIG number is net, deliberately: it is the one that matters. */}
          <p class="big-figure">{fmtPct(answer.net)}</p>
          <p class="tool-answer-line" role="status">
            {answer.net < 0
              ? YIELD.negative(fmtPct(answer.gross))
              : YIELD.answer(fmtPct(answer.net), fmtPct(answer.gross), fmtPct(answer.gap))}
          </p>
          <dl class="tool-figures">
            <div><dt>{YIELD.figures.net}</dt><dd>{fmtPct(answer.net)}</dd></div>
            <div><dt>{YIELD.figures.gross}</dt><dd>{fmtPct(answer.gross)}</dd></div>
            <div><dt>{YIELD.figures.costs}</dt><dd>{fmtMoney(answer.totalCosts)}</dd></div>
          </dl>
          <ul class="tool-limits">
            {YIELD.limits.map((line) => <li>{line}</li>)}
          </ul>

          <details class="accordion">
            <summary class="accordion-btn">{TOOLS_COPY.howHeading}</summary>
            <div class="accordion-body">
              <dl class="maths">
                <dt>{YIELD.table.rent}</dt>
                <dd>{fmtMoney(answer.annualRent)}</dd>
                {costRows.map((c) => (
                  <>
                    <dt>{c.label}</dt>
                    <dd>{fmtMoney(c.amount)}</dd>
                  </>
                ))}
                <dt>{YIELD.table.total}</dt>
                <dd>{fmtMoney(answer.totalCosts)}</dd>
                <dt>{YIELD.table.gross}</dt>
                <dd>{answer.breakdowns.gross.substituted} = {answer.breakdowns.gross.result}</dd>
                <dt>{YIELD.table.net}</dt>
                <dd>{answer.breakdowns.net.substituted} = {answer.breakdowns.net.result}</dd>
              </dl>
              <p class="maths-note">{answer.breakdown.note}</p>
            </div>
          </details>

          <p class="tool-onward">
            {YIELD.onward.line}{' '}
            <a href="/buy-to-let/analyser">{YIELD.onward.cta}</a>
          </p>
        </section>
      )}
    </>
  );
}
