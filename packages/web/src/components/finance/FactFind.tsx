/**
 * THE BROKER'S FACT-FIND (F2) — the third step, shown only after our own filter
 * has passed and only when there is a real broker to send it to.
 *
 * It is the longest form in the product, so it is broken into three short
 * screens with honest progress, every answer is kept in the tab's own session
 * storage (a reload or a Back never costs somebody their date of birth twice),
 * and a conditional question appears in place without moving what is under it.
 *
 * The questions, their order and their conditions all come from ONE list in
 * config; this only draws it. Nothing here decides what is required — that is
 * lib/factfind.ts, which the Worker runs too.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { BRIDGING, BROKER, FACTFIND, type FactFindFieldSpec } from '../../config/bridging';
import { siteConfig } from '../../site.config';
import {
  EMPTY_FACTFIND, FACTFIND_STEPS, fieldsForStep, isFactFindComplete, stepErrors, type FactFind,
} from '../../lib/factfind';

export interface FactFindProps {
  /** The qualified enquiry these answers belong to. */
  enquiryId: string;
  /** From the account: shown, never asked for again. */
  email: string;
  /** From the account, into the name field — theirs to correct. */
  name: string;
  /** Told when it has gone, so the flow remembers it rather than the form. */
  onSent?: () => void;
  /** It has already gone in this sitting: show that, never the form again. */
  alreadySent?: boolean;
  /** This enquiry can never take a fact-find (it is gone, or the broker is not
   * set up). Told so the flow can let go rather than trap them on a dead form. */
  onUnavailable?: () => void;
}

/** The tab's own memory, so nothing is lost to a reload or a Back. Session, not
 * local: it belongs to this sitting, and it goes when the tab does. */
const REMEMBER = 'gb:factfind';
const remember = (state: { user: string; enquiryId: string; step: number; answers: FactFind }): void => {
  try { sessionStorage.setItem(REMEMBER, JSON.stringify(state)); } catch { /* private window */ }
};
/**
 * Only ever handed back to the SAME person and the SAME enquiry. A shared
 * computer is the ordinary case, not the exotic one: without the account check,
 * whoever signed in next on that tab would have been shown somebody else's date
 * of birth and home address (F2 review).
 */
const recall = (user: string, enquiryId: string): { step: number; answers: FactFind } | null => {
  try {
    const raw = sessionStorage.getItem(REMEMBER);
    if (raw === null) return null;
    const held = JSON.parse(raw) as { user?: string; enquiryId?: string; step?: number; answers?: FactFind };
    if (held.user !== user || held.enquiryId !== enquiryId) return null;
    if (typeof held.answers !== 'object' || held.answers === null) return null;
    return { step: Number(held.step) || 1, answers: { ...EMPTY_FACTFIND, ...held.answers } };
  } catch {
    return null;
  }
};
const forget = (): void => {
  try { sessionStorage.removeItem(REMEMBER); } catch { /* nothing to clear */ }
};

export function FactFind({ enquiryId, email, name, onSent, alreadySent, onUnavailable }: FactFindProps) {
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<FactFind>({ ...EMPTY_FACTFIND, name });
  const [showErrors, setShowErrors] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState(alreadySent === true);
  const heading = useRef<HTMLHeadingElement>(null);

  // Anything typed before a reload comes back, including which screen they were
  // on — to the same person, on the same enquiry, and to nobody else.
  useEffect(() => {
    const held = recall(email, enquiryId);
    if (held) {
      setAnswers(held.answers);
      setStep(Math.min(Math.max(1, held.step), FACTFIND_STEPS));
    }
  }, [enquiryId, email]);
  useEffect(() => { remember({ user: email, enquiryId, step, answers }); }, [enquiryId, email, step, answers]);
  // Moving screens moves focus, or a screen-reader user is left where they were.
  useEffect(() => { heading.current?.focus(); }, [step]);

  const set = (key: string, value: string): void => setAnswers((a) => ({ ...a, [key]: value }));
  const bad = stepErrors(step, answers);
  const fields = fieldsForStep(step, answers);
  const last = step === FACTFIND_STEPS;

  if (sent) {
    return (
      <section class="glass card" aria-labelledby="ff-done" role="status">
        <h2 id="ff-done">{FACTFIND.done.heading}</h2>
        {FACTFIND.done.body.map((line) => <p>{line}</p>)}
        <p class="hint bridge-disclaimer">{BRIDGING.disclaimer(siteConfig.siteName)}</p>
      </section>
    );
  }

  const submit = async (): Promise<void> => {
    setShowErrors(true);
    // An answer on an earlier screen can only be wrong if a later one changed
    // what is asked; say so rather than letting the button do nothing.
    if (!isFactFindComplete(answers)) { setFailed(FACTFIND.errors.incomplete); return; }
    if (Object.keys(bad).length > 0 || !consent) return;
    setSending(true);
    setFailed(null);
    try {
      const res = await fetch('/api/bridging/factfind', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...answers, enquiry_id: enquiryId, consent: true }),
      });
      if (!res.ok) {
        // 404 means this enquiry cannot take a fact-find at all (it is gone, or
        // the broker is no longer set up). Retrying will never work, so let go
        // of the remembered flow rather than trapping them on a dead form.
        if (res.status === 404) { forget(); onUnavailable?.(); }
        setFailed(FACTFIND.errors.failed);
        return;
      }
      forget();
      onSent?.();
      setSent(true);
    } catch {
      setFailed(FACTFIND.errors.failed);
    } finally {
      setSending(false);
    }
  };

  const field = (spec: FactFindFieldSpec) => {
    const id = `ff-${spec.key}`;
    const value = answers[spec.key] ?? '';
    const wrong = showErrors && bad[spec.key] === true;
    const described = spec.hint !== undefined ? `${id}-hint` : undefined;
    // Decided OUTSIDE the JSX: a kind key inside a child expression reads as
    // copy to the inline-copy ratchet, and it is not copy.
    const multiline = spec.kind === 'textarea';
    const inputType = spec.kind === 'date' ? 'date' : 'text';
    if (spec.kind === 'choice') {
      return (
        <fieldset class="bridge-field" aria-describedby={described}>
          <legend>{spec.label}</legend>
          {spec.hint !== undefined && <p class="field-hint" id={described}>{spec.hint}</p>}
          <div class="bridge-choices">
            {(spec.options ?? []).map((o) => (
              <label class={value === o.value ? 'bridge-choice is-picked' : 'bridge-choice'}>
                <input
                  type="radio" name={id} value={o.value} checked={value === o.value}
                  onChange={() => set(spec.key, o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          {wrong && <p class="field-error" role="alert">{spec.error}</p>}
        </fieldset>
      );
    }
    return (
      <div class="field">
        <label for={id}>{spec.label}</label>
        {spec.hint !== undefined && <p class="field-hint" id={described}>{spec.hint}</p>}
        {multiline ? (
          <textarea
            id={id} rows={3} value={value} maxLength={spec.max} autocomplete={spec.autocomplete}
            aria-describedby={described}
            onInput={(e) => set(spec.key, (e.target as HTMLTextAreaElement).value)}
          />
        ) : (
          <input
            id={id} type={inputType} value={value} maxLength={spec.max}
            autocomplete={spec.autocomplete} aria-describedby={described}
            onInput={(e) => set(spec.key, (e.target as HTMLInputElement).value)}
          />
        )}
        {wrong && <p class="field-error" role="alert">{spec.error}</p>}
      </div>
    );
  };

  return (
    <section class="glass card bridge-form factfind" aria-labelledby="ff-h">
      <h2 id="ff-h" ref={heading} tabIndex={-1}>{FACTFIND.heading}</h2>
      {FACTFIND.preamble.map((line) => <p class="ff-preamble">{line}</p>)}
      <p class="ff-progress" aria-live="polite">
        {FACTFIND.progress(step, FACTFIND_STEPS)} · {FACTFIND.steps[step]}
      </p>

      <div class="bridge-step">
        {step === 1 && (
          <p class="ff-account">
            <span class="ff-account-label">{FACTFIND.email.label}</span>
            <strong>{email}</strong>
            <span class="field-hint">{FACTFIND.email.note}</span>
          </p>
        )}
        {fields.map((spec) => field(spec))}

        {last && (
          <>
            <label class="bridge-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent((e.target as HTMLInputElement).checked)} />
              <span>{FACTFIND.consent.label(BROKER.name)}</span>
            </label>
            <p class="field-hint">{FACTFIND.consent.recipients}</p>
            {showErrors && !consent && <p class="field-error" role="alert">{FACTFIND.consent.required}</p>}
          </>
        )}

        {failed !== null && <p class="field-error" role="alert">{failed}</p>}
        {showErrors && Object.keys(bad).length > 0 && (
          <p class="field-error" role="alert">{FACTFIND.errors.incomplete}</p>
        )}

        <div class="bridge-actions">
          {step > 1 && (
            <button type="button" class="btn-secondary" onClick={() => { setShowErrors(false); setStep(step - 1); }}>
              {FACTFIND.back}
            </button>
          )}
          {last ? (
            <button type="button" class="btn-primary" disabled={sending} onClick={() => void submit()}>
              {sending ? FACTFIND.sending : FACTFIND.submit}
            </button>
          ) : (
            <button
              type="button"
              class="btn-primary"
              onClick={() => {
                setShowErrors(true);
                if (Object.keys(stepErrors(step, answers)).length === 0) { setShowErrors(false); setStep(step + 1); }
              }}
            >
              {FACTFIND.next}
            </button>
          )}
        </div>
      </div>
      {/* The one line that must never disappear, least of all on the longest and
          most personal step in the product (F2 review). */}
      <p class="hint bridge-disclaimer">{BRIDGING.disclaimer(siteConfig.siteName)}</p>
    </section>
  );
}
