/**
 * The login wall — one modal mounted in AppShell, opened via the
 * 'open-login-wall' event. Google's official sign-in button styling,
 * required T&C acceptance, an UNTICKED marketing checkbox, and a Turnstile
 * human check (server-verified only when an account is CREATED).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { LOGIN_WALL } from '../../config/account';
import { COPY } from '../../config/copy';
import { siteConfig } from '../../site.config';
import { cookiesBlocked } from '../../lib/auth/session';

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string };
  }
}

let turnstileScript: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (!turnstileScript) {
    turnstileScript = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve(); // widget missing → server still gates new accounts
      document.head.appendChild(s);
    });
  }
  return turnstileScript;
}

export function LoginWall() {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const [tsError, setTsError] = useState(false);
  const [copied, setCopied] = useState(false);
  const termsRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetRendered = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const blocked = typeof navigator !== 'undefined' && cookiesBlocked();

  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onOpen = () => {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    };
    document.addEventListener('open-login-wall', onOpen);
    return () => document.removeEventListener('open-login-wall', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    // terms text is server-rendered into a <template> by AppShell
    const tpl = document.getElementById('legal-terms') as HTMLTemplateElement | null;
    if (tpl && termsRef.current && termsRef.current.childElementCount === 0) {
      termsRef.current.appendChild(tpl.content.cloneNode(true));
    }
    if (!blocked && !widgetRendered.current) {
      void loadTurnstile().then(() => {
        if (widgetRendered.current || !widgetRef.current || !window.turnstile) return;
        widgetRendered.current = true;
        window.turnstile.render(widgetRef.current, {
          sitekey: siteConfig.turnstileSiteKey,
          theme: 'dark',
          callback: (token: string) => {
            setTsToken(token);
            setTsError(false);
          },
          'error-callback': () => {
            setTsError(true);
            return true; // we handled it — no console spam
          },
        });
      });
    }
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        // trap focus inside the dialog
        const wall = document.querySelector('.wall');
        if (!wall) return;
        const focusables = [...wall.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.classList.contains('wall-guard'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !wall.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !wall.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      // a fresh Turnstile widget (and token) every time the wall reopens —
      // the old widget's DOM died with the modal and tokens are single-use
      widgetRendered.current = false;
      setTsToken('');
      openerRef.current?.focus();
    };
  }, [open, blocked]);

  if (!open) return null;

  const startLogin = () => {
    const next = location.pathname + location.search;
    const q = new URLSearchParams({ next, marketing: marketing ? '1' : '0', ts: tsToken });
    location.href = `/auth/login?${q.toString()}`;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
    } catch {
      /* older browsers: the URL bar still works */
    }
  };

  const focusEdge = (which: 'first' | 'last') => {
    const wall = document.querySelector('.wall');
    if (!wall) return;
    const f = [...wall.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.classList.contains('wall-guard'));
    (which === 'first' ? f[0] : f[f.length - 1])?.focus();
  };

  return (
    <div class="wall-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      {/* focus guards: tabbing out of the dialog (incl. out of the Turnstile
          iframe, whose internal tabs we can't see) lands here and is sent
          straight back inside */}
      <div class="wall-guard" tabindex={0} onFocus={() => focusEdge('last')} />
      <div class="glass card wall" role="dialog" aria-modal="true" aria-labelledby="wall-title">
        <button type="button" class="wall-close" aria-label={LOGIN_WALL.closeAria} onClick={() => setOpen(false)}>×</button>
        <h2 id="wall-title" ref={headingRef} tabindex={-1}>{LOGIN_WALL.title(siteConfig.siteName)}</h2>
        <p class="hint">{COPY.account.loginWhy}</p>

        {blocked ? (
          <>
            <h3 class="state-h">{LOGIN_WALL.cookiesHeading}</h3>
            <p>{COPY.account.cookiesOff}</p>
            <button type="button" class="btn-secondary" onClick={copyLink}>{copied ? LOGIN_WALL.copied : LOGIN_WALL.copyLink}</button>
          </>
        ) : (
          <>
            <div class="wall-terms" ref={termsRef} tabindex={0} aria-label={LOGIN_WALL.termsAria} />
            <label class="wall-check">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)} />
              <span>{LOGIN_WALL.acceptTerms}</span>
            </label>
            <label class="wall-check">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing((e.target as HTMLInputElement).checked)} />
              <span>{LOGIN_WALL.marketing}</span>
            </label>
            <div class="wall-turnstile" ref={widgetRef} />
            {tsError && (
              <p class="hint" role="alert">{COPY.account.checkFailed}</p>
            )}
            <button type="button" class="gsi-button" disabled={!accepted} onClick={startLogin} aria-describedby={accepted ? undefined : 'wall-accept-first'}>
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{LOGIN_WALL.google}</span>
            </button>
            {!accepted && <p id="wall-accept-first" class="hint">{LOGIN_WALL.acceptFirst}</p>}
          </>
        )}
      </div>
      <div class="wall-guard" tabindex={0} onFocus={() => focusEdge('first')} />
    </div>
  );
}
