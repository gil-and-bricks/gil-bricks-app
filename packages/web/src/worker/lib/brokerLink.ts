/**
 * THE BROKER'S SINGLE-USE LINKS — minting them, and the one page shell both of
 * them render through.
 *
 * There are two single-use links: the fact-find (F2) and the enquiry (F3).
 * They show different answers, but the page around those answers — the reveal
 * button, the dead-link page, the markup, the inline CSS — is the same job,
 * and it is a job whose details are security decisions rather than styling:
 * noindex, no-referrer, a POST to reveal. One copy of it, so a fix to either
 * link's shell is a fix to both.
 *
 * No stylesheet is available here and no script runs, so the little CSS it
 * needs is inline — plain neutral colours, since this is a working document
 * rather than a brand surface.
 */

/** A token the broker can be given, and the hash we keep instead of it. */
export async function mintToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { token, hash: await hashToken(token) };
}

/** SHA-256, hex. The only form of a token that touches the database. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The furniture every broker page needs. Both view configs satisfy this. */
export interface BrokerView {
  title: string;
  heading: string;
  reveal: string;
  revealNote: string;
  contactHeading: string;
  answersHeading: string;
  collected: (when: string) => string;
  footer: string;
  gone: { heading: string; body: (inbox: string) => string };
  labels: { name: string; email: string; phone: string };
}

export const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>${escape(title)}</title>
<style>
 body { margin:0; padding:24px; font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; background:#111; color:#f4f4f4; }
 main { max-width: 46rem; margin: 0 auto; }
 h1 { font-size: 1.3rem; margin: 0 0 4px; }
 h2 { font-size: 1rem; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: .05em; opacity: .7; }
 dl { display: grid; grid-template-columns: 1fr; gap: 2px 16px; margin: 0; }
 dt { font-size: .8rem; opacity: .7; }
 dd { margin: 0 0 12px; font-weight: 600; overflow-wrap: anywhere; white-space: pre-wrap; }
 .note { opacity: .7; font-size: .85rem; }
 button { font: inherit; font-weight: 600; padding: 14px 20px; min-height: 48px; border-radius: 10px; border: 0; cursor: pointer; }
 @media (min-width: 40rem) { dl { grid-template-columns: 14rem 1fr; } dd { margin-bottom: 4px; } }
</style></head><body><main>${body}</main></body></html>`;
}

/** Step one: a button, not the details. A scanner following the link sees this. */
export function revealPage(view: BrokerView, action: string, token: string): string {
  return page(view.title, `
    <h1>${escape(view.heading)}</h1>
    <p class="note">${escape(view.revealNote)}</p>
    <form method="POST" action="${escape(action)}">
      <input type="hidden" name="t" value="${escape(token)}">
      <button type="submit">${escape(view.reveal)}</button>
    </form>`);
}

/** A link that has been used, has expired, or never existed. Says one thing. */
export function gonePage(view: BrokerView, inbox: string): string {
  return page(view.gone.heading, `
    <h1>${escape(view.gone.heading)}</h1>
    <p class="note">${escape(view.gone.body(inbox))}</p>`);
}

/** One answer as he reads it: the question, then what they said. */
export interface BrokerAnswer { label: string; value: string }

/** The details, once. Labels come from the same config the person answered. */
export function detailsPage(
  view: BrokerView,
  when: string,
  contact: readonly BrokerAnswer[],
  answers: readonly BrokerAnswer[],
): string {
  const list = (rows: readonly BrokerAnswer[]): string => rows
    .filter((r) => r.value.trim() !== '')
    .map((r) => `<dt>${escape(r.label)}</dt><dd>${escape(r.value)}</dd>`)
    .join('');
  return page(view.title, `
    <h1>${escape(view.heading)}</h1>
    <p class="note">${escape(view.collected(when))}</p>
    <h2>${escape(view.contactHeading)}</h2><dl>${list(contact)}</dl>
    <h2>${escape(view.answersHeading)}</h2><dl>${list(answers)}</dl>
    <p class="note">${escape(view.footer)}</p>`);
}
