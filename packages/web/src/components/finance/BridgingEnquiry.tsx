/**
 * The bridging enquiry form (F1). It renders ONLY for a signed-in person: they
 * already gave us a name and an email with Google, so this asks for neither,
 * and one tap of sign-in is a real barrier to drive-by enquiries and bots.
 *
 * Step 2 does not exist until step 1 is valid. Every question changes whether
 * the broker can help — nothing is asked out of curiosity. The decision itself
 * is made by the Worker with the same pure rules used here, so the page can
 * never talk its way past a threshold.
 *
 * This form takes a PHONE NUMBER: a deliberate, page-scoped exception to the
 * site's no-phone-capture rule, because the whole outcome is a phone call.
 * Documented in CLAUDE.md and in the privacy policy.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { BRIDGING, BRIDGING_NOT_OPEN, BRIDGING_RULES, BROKER, brokerReady } from '../../config/bridging';
import { features } from '../../config/features';
import { siteConfig } from '../../site.config';
import { me, openLoginWall } from '../../lib/auth/session';
import { EMPTY_ENQUIRY, step1Errors, step2Errors, type Enquiry } from '../../lib/bridging';
import { MoneyInput } from '../analyser/MoneyInput';

let turnstileScript: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (!turnstileScript) {
    turnstileScript = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve(); // the server still refuses without a token
      document.head.appendChild(s);
    });
  }
  return turnstileScript;
}

type Outcome = 'qualified' | 'not-yet';

/** Field keys: identifiers for the state and the radio groups, never shown. */
const FIELD = {
  loan: 'loan',
  deposit: 'deposit',
  property: 'property',
  entity: 'entity',
  exit: 'exit',
  story: 'story',
  timing: 'timing',
  credit: 'credit',
  phone: 'phone',
  consent: 'consent',
} as const;

export function BridgingEnquiry() {
  if (!features.bridgingFinance) return null;
  const who = me.value;
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<Enquiry>(EMPTY_ENQUIRY);
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [token, setToken] = useState('');
  const widget = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const step2Ref = useRef<HTMLDivElement>(null);

  const set = <K extends keyof Enquiry>(key: K, value: Enquiry[K]): void => setForm((f) => ({ ...f, [key]: value }));
  const e1 = step1Errors(form);
  const e2 = step2Errors(form);
  const copy = BRIDGING.form;

  // The widget lives inside step 2, so going Back unmounts it. Render it again
  // on every arrival and drop the old token — a step-2 with no human check
  // would be refused by the server and look broken to the person.
  useEffect(() => {
    if (step !== 2) {
      rendered.current = false;
      setToken('');
      return;
    }
    void loadTurnstile().then(() => {
      if (rendered.current || !widget.current || !window.turnstile) return;
      rendered.current = true;
      window.turnstile.render(widget.current, {
        sitekey: siteConfig.turnstileSiteKey,
        theme: 'dark',
        callback: (t: string) => setToken(t),
      });
    });
  }, [step]);

  useEffect(() => {
    if (step === 2) step2Ref.current?.focus();
  }, [step]);

  if (!brokerReady()) {
    return (
      <section class="glass card" aria-labelledby="bridge-shut">
        <h2 id="bridge-shut">{BRIDGING_NOT_OPEN.heading}</h2>
        <p class="hint">{BRIDGING_NOT_OPEN.body}</p>
      </section>
    );
  }
  if (who === undefined) return <p class="hint">{BRIDGING.signedOut.body}</p>;
  if (who === null) {
    return (
      <section class="glass card" aria-labelledby="bridge-signin">
        <h2 id="bridge-signin">{BRIDGING.signedOut.heading}</h2>
        <p class="hint">{BRIDGING.signedOut.body}</p>
        <button type="button" class="btn-primary" onClick={openLoginWall}>{BRIDGING.signedOut.cta}</button>
      </section>
    );
  }

  if (outcome !== null) {
    const done = outcome === 'qualified' ? BRIDGING.result.qualified : BRIDGING.result.notYet;
    return (
      <section class="glass card" aria-labelledby="bridge-done" role="status">
        <h2 id="bridge-done">{done.heading}</h2>
        {done.body.map((line) => <p>{line}</p>)}
        {reasons.length > 0 && (
          <ul class="bridge-list bridge-reasons">
            {reasons.map((key) => <li>{BRIDGING.result.reasons[key] ?? key}</li>)}
          </ul>
        )}
      </section>
    );
  }

  const submit = async (): Promise<void> => {
    setShowErrors(true);
    if (Object.keys(step2Errors(form)).length > 0) return;
    setSending(true);
    setFailed(null);
    try {
      const res = await fetch('/api/bridging', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, turnstile: token }),
      });
      if (res.status === 403) {
        setFailed(copy.errors.human);
        return;
      }
      if (!res.ok) {
        setFailed(copy.errors.failed);
        return;
      }
      const body = (await res.json()) as { outcome: Outcome; reasons?: string[] };
      setReasons(body.reasons ?? []);
      setOutcome(body.outcome);
    } catch {
      setFailed(copy.errors.failed);
    } finally {
      setSending(false);
    }
  };

  const choice = (
    name: string,
    label: string,
    options: readonly { value: string; label: string }[],
    value: string,
    onPick: (v: string) => void,
    bad: boolean,
    error: string,
    hint?: string,
  ) => (
    <fieldset class="bridge-field">
      <legend>{label}</legend>
      {hint !== undefined && <p class="field-hint">{hint}</p>}
      <div class="bridge-choices">
        {options.map((o) => (
          <label class={value === o.value ? 'bridge-choice is-picked' : 'bridge-choice'}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onPick(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {showErrors && bad && <p class="field-error" role="alert">{error}</p>}
    </fieldset>
  );

  return (
    <section class="glass card bridge-form" aria-labelledby="bridge-form-h">
      <h2 id="bridge-form-h">{step === 1 ? copy.step1Heading : copy.step2Heading}</h2>

      {step === 1 && (
        <div class="bridge-step">
          <div class="field">
            <label for="bridge-loan">{copy.loan.label}</label>
            <MoneyInput id="bridge-loan" value={form.loan} onValue={(loan) => set(FIELD.loan, loan)} />
            {showErrors && e1.loan && <p class="field-error" role="alert">{copy.errors.loan}</p>}
          </div>
          {choice(FIELD.deposit, copy.deposit.label, copy.deposit.options, form.deposit,
            (v) => set(FIELD.deposit, v as Enquiry['deposit']), e1.deposit === true, copy.errors.deposit)}
          {choice(FIELD.property, copy.property.label, copy.property.options, form.property,
            (v) => set(FIELD.property, v as Enquiry['property']), e1.property === true, copy.errors.property)}
          {choice(FIELD.entity, copy.entity.label, copy.entity.options, form.entity,
            (v) => set(FIELD.entity, v as Enquiry['entity']), e1.entity === true, copy.errors.entity)}
          <button
            type="button"
            class="btn-primary"
            onClick={() => {
              setShowErrors(true);
              if (Object.keys(step1Errors(form)).length === 0) {
                setShowErrors(false);
                setStep(2);
              }
            }}
          >
            {copy.next}
          </button>
        </div>
      )}

      {step === 2 && (
        <div class="bridge-step" ref={step2Ref} tabIndex={-1}>
          {choice(FIELD.exit, copy.exit.label, copy.exit.options, form.exit,
            (v) => set(FIELD.exit, v as Enquiry['exit']), e2.exit === true, copy.errors.exit)}
          <div class="field">
            <label for="bridge-story">{copy.story.label}</label>
            <p class="field-hint">{copy.story.hint}</p>
            <textarea
              id="bridge-story"
              rows={6}
              value={form.story}
              onInput={(ev) => set(FIELD.story, (ev.target as HTMLTextAreaElement).value)}
            />
            <p class="field-hint" aria-live="polite">
              {copy.story.counter(form.story.trim().length, BRIDGING_RULES.minStoryChars)}
            </p>
            {showErrors && e2.story && <p class="field-error" role="alert">{copy.errors.story}</p>}
          </div>
          {choice(FIELD.timing, copy.timing.label, copy.timing.options, form.timing,
            (v) => set(FIELD.timing, v as Enquiry['timing']), e2.timing === true, copy.errors.timing)}
          {choice(FIELD.credit, copy.credit.label, copy.credit.options, form.credit,
            (v) => set(FIELD.credit, v as Enquiry['credit']), e2.credit === true, copy.errors.credit, copy.credit.hint)}
          <div class="field">
            <label for="bridge-phone">{copy.phone.label}</label>
            <p class="field-hint">{copy.phone.hint}</p>
            <input id="bridge-phone" type="tel" inputMode="tel" autocomplete="tel" value={form.phone}
              onInput={(ev) => set(FIELD.phone, (ev.target as HTMLInputElement).value)} />
            {showErrors && e2.phone && <p class="field-error" role="alert">{copy.errors.phone}</p>}
          </div>
          <label class="bridge-consent">
            <input type="checkbox" checked={form.consent} onChange={(ev) => set(FIELD.consent, (ev.target as HTMLInputElement).checked)} />
            <span>{copy.consent.label(BROKER.name)}</span>
          </label>
          <p class="field-hint">{copy.consent.recipients}</p>
          {showErrors && e2.consent && <p class="field-error" role="alert">{copy.consent.required}</p>}
          <div class="bridge-turnstile" ref={widget} />
          {failed !== null && <p class="field-error" role="alert">{failed}</p>}
          <div class="bridge-actions">
            <button type="button" class="btn-secondary" onClick={() => setStep(1)}>{copy.back}</button>
            <button type="button" class="btn-primary" disabled={sending} onClick={() => void submit()}>
              {sending ? copy.sending : copy.submit}
            </button>
          </div>
        </div>
      )}
      <p class="hint bridge-disclaimer">{BRIDGING.disclaimer(siteConfig.siteName)}</p>
    </section>
  );
}
