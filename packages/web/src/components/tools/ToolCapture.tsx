/**
 * The post-answer offer (T3), shared by all three tools.
 *
 * THE LAW: the answer is never gated. This component renders ONLY inside an
 * answer card that already exists, it can be dismissed for the session, and
 * until someone chooses to take the offer it makes NO network request — the
 * human check only loads if they choose to type an address.
 *
 * It offers one honest, specific thing: their own figures, by email, produced
 * from the numbers already on their screen. If the tool's Kit tag or the Kit
 * automation is not live (`captureReady`), the whole block is hidden rather
 * than promising an email nobody set up.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CAPTURE_COPY, captureFor, captureReady } from '../../config/capture';
import { features } from '../../config/features';
import { siteConfig } from '../../site.config';
import { me } from '../../lib/auth/session';

/** What the page already shows, handed over as strings — never recomputed. */
export interface LeadFigures {
  headline: string;
  detail: string;
  maths: string;
}

/** UI states — identifiers, never shown to anyone. */
const STATE = { idle: 'idle', typing: 'typing', sending: 'sending', sent: 'sent' } as const;
type State = (typeof STATE)[keyof typeof STATE];

/** Dismissed for THIS TAB until it is closed. Never a cookie, never a nag. */
const dismissKey = (slug: string): string => `proplaunch.capture.${slug}`;

const readSession = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeSession = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode — the offer simply reappears next time */
  }
};
const clearSession = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
};

/** Loaded ONLY when someone chooses to type an address — never on page load. */
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

const looksLikeEmail = (v: string): boolean => /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v.trim());

export function ToolCapture({ slug, figures }: { slug: string; figures: LeadFigures }) {
  if (!features.toolCapture || !captureReady(slug)) return null;
  const tool = captureFor(slug);
  const [hidden, setHidden] = useState(false);
  const [state, setState] = useState<State>(STATE.idle);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  /** Which path they took, so a failure returns them to the right one. */
  const wasTyped = useRef(false);
  const figuresRef = useRef(figures);
  figuresRef.current = figures;

  /** A Turnstile token is single-use: a retry needs a fresh one, or the server
   *  refuses forever and the box looks broken. */
  const backToTyping = (message: string): boolean => {
    setError(message);
    setState(wasTyped.current ? STATE.typing : STATE.idle);
    setToken('');
    if (widgetId.current !== null && window.turnstile) {
      try {
        window.turnstile.reset(widgetId.current);
      } catch {
        /* the widget went with the DOM — the next render makes a new one */
        widgetId.current = null;
      }
    }
    return false;
  };

  const send = async (address: string, human: string, agreed: boolean): Promise<boolean> => {
    setState(STATE.sending);
    setError(null);
    try {
      const res = await fetch('/api/tools/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: slug,
          email: address,
          turnstile: human,
          consent: agreed,
          headline: figuresRef.current.headline,
          detail: figuresRef.current.detail,
          maths: figuresRef.current.maths,
        }),
      });
      if (res.status === 403) return backToTyping(CAPTURE_COPY.humanFailed);
      if (!res.ok) return backToTyping(CAPTURE_COPY.failed);
      setState(STATE.sent);
      return true;
    } catch {
      return backToTyping(CAPTURE_COPY.failed);
    }
  };

  useEffect(() => {
    if (readSession(dismissKey(slug)) !== null) setHidden(true);
  }, [slug]);

  // The human check is rendered only on the typed path, and only once — the
  // form STAYS MOUNTED while sending, so a failure leaves a working widget.
  useEffect(() => {
    if (state !== STATE.typing) return;
    void loadTurnstile().then(() => {
      if (widgetId.current !== null || !widget.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(widget.current, {
        sitekey: siteConfig.turnstileSiteKey,
        theme: 'dark',
        callback: (t: string) => setToken(t),
      }) ?? null;
    });
  }, [state]);

  if (hidden || tool === undefined) return null;

  // One tap, and only for someone we already know. Sending a signed-out visitor
  // to Google is a full page trip that loses the answer they were asking us to
  // email — so they get the one field instead, which is less work anyway.
  const withGoogle = (): void => {
    if (!consent) {
      setError(CAPTURE_COPY.consentRequired);
      return;
    }
    setError(null);
    wasTyped.current = false;
    void send('', '', true);
  };

  const withTyped = (): void => {
    if (!consent) {
      setError(CAPTURE_COPY.consentRequired);
      return;
    }
    if (!looksLikeEmail(email)) {
      setError(CAPTURE_COPY.emailInvalid);
      return;
    }
    setError(null);
    wasTyped.current = true;
    void send(email.trim(), token, true);
  };

  return (
    <div class="tool-capture">
      {state === STATE.sent ? (
        <p class="hint" role="status">{CAPTURE_COPY.sent}</p>
      ) : (
        <>
          <h3 class="state-h">{CAPTURE_COPY.heading}</h3>
          <p>{tool.offer}</p>
          <p class="hint">{CAPTURE_COPY.sub}</p>

          <label class="capture-consent">
            <input type="checkbox" checked={consent} onChange={(e) => { setConsent((e.target as HTMLInputElement).checked); setError(null); }} />
            <span>{CAPTURE_COPY.consent}</span>
          </label>

          {state === STATE.typing || (state === STATE.sending && wasTyped.current) ? (
            <div class="capture-typed">
              <label for={`cap-email-${slug}`}>{CAPTURE_COPY.emailLabel}</label>
              <input
                id={`cap-email-${slug}`}
                type="email"
                inputMode="email"
                autocomplete="email"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              />
              <div class="capture-turnstile" ref={widget} />
              <button type="button" class="btn-primary" disabled={state === STATE.sending} onClick={withTyped}>
                {state === STATE.sending ? CAPTURE_COPY.sending : CAPTURE_COPY.send}
              </button>
            </div>
          ) : (
            <div class="capture-actions">
              {me.value !== null && me.value !== undefined && (
                <button type="button" class="btn-primary" disabled={state === STATE.sending} onClick={withGoogle}>
                  {state === STATE.sending ? CAPTURE_COPY.sending : CAPTURE_COPY.googleSignedIn(me.value.email)}
                </button>
              )}
              <button
                type="button"
                class={me.value ? 'btn-secondary' : 'btn-primary'}
                onClick={() => { setState(STATE.typing); setError(null); }}
              >
                {me.value ? CAPTURE_COPY.typed : CAPTURE_COPY.byEmail}
              </button>
            </div>
          )}

          {error !== null && <p class="field-error" role="alert">{error}</p>}

          <p class="hint capture-small">
            {CAPTURE_COPY.privacyBefore}
            <a href="/privacy">{CAPTURE_COPY.privacyLink}</a>
            {CAPTURE_COPY.privacyAfter}
          </p>
          <button
            type="button"
            class="capture-dismiss"
            aria-label={CAPTURE_COPY.dismissLabel}
            onClick={() => { writeSession(dismissKey(slug), '1'); setHidden(true); }}
          >
            {CAPTURE_COPY.dismiss}
          </button>
        </>
      )}
    </div>
  );
}
