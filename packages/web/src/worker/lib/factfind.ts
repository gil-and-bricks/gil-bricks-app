/**
 * THE FACT-FIND, SERVER SIDE (F2): storing it, the one-time link, and the page
 * the broker reads it on.
 *
 * WHY IT IS NOT EMAILED. This is a date of birth, a home address and a credit
 * answer. Kit is a marketing platform, and personal data of that kind must not
 * be put in one — nor travel in the body of an email nobody encrypted. So the
 * answers stay in D1, and the broker gets a link.
 *
 * THE LINK, and the trade-off, stated plainly: a bearer token in an email. It is
 * single-use and expires in hours, only its SHA-256 hash is stored (a database
 * leak yields no working links), the page is `noindex` and `no-store`, and the
 * details are revealed by a POST — because email security scanners follow links,
 * and a scanner must never be able to spend the one use.
 */
import { FACTFIND, FACTFIND_VIEW, FACTFIND_RULES, BROKER } from '../../config/bridging';
import { FACTFIND_KEYS } from '../../lib/factfind';

/** A token the broker can be given, and the hash we keep instead of it. */
export async function mintToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { token, hash: await hashToken(token) };
}

/** SHA-256, hex. The only form of the token that touches the database. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The row as the broker's page reads it. */
export interface FactFindRow {
  id: string;
  email: string;
  phone: string;
  applicant_name: string;
  buying_ltd: string;
  company_name: string;
  dob: string;
  address: string;
  owns_home: string;
  mortgage_provider: string;
  other_properties: string;
  refurb_experience: string;
  good_credit: string;
  credit_report: string;
  savings: string;
  deposit_source: string;
  gift_from: string;
  equity_property: string;
  created_at: string;
  expires_at: string;
  viewed_at: string | null;
}

/** config key (camelCase) → column. One map, used to store AND to read back. */
export const FACTFIND_COLUMNS: Record<string, keyof FactFindRow> = {
  name: 'applicant_name',
  ltd: 'buying_ltd',
  companyName: 'company_name',
  dob: 'dob',
  address: 'address',
  ownsHome: 'owns_home',
  mortgageProvider: 'mortgage_provider',
  otherProperties: 'other_properties',
  refurbExperience: 'refurb_experience',
  goodCredit: 'good_credit',
  creditReport: 'credit_report',
  savings: 'savings',
  depositSource: 'deposit_source',
  giftFrom: 'gift_from',
  equityProperty: 'equity_property',
};

/** Every configured question has a column, and vice versa. Proved by a test. */
export function columnsCoverEveryField(): boolean {
  return FACTFIND_KEYS.every((k) => FACTFIND_COLUMNS[k] !== undefined)
    && Object.keys(FACTFIND_COLUMNS).length === FACTFIND_KEYS.length;
}

/** The link the broker is given. Absolute, because it travels by email. */
export function factFindLink(base: string, token: string): string {
  return `${base}/broker/factfind?t=${encodeURIComponent(token)}`;
}

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The whole page, server-rendered. No stylesheet is available here and no script
 * runs, so the little CSS it needs is inline — plain neutral colours, since this
 * is a working document rather than a brand surface.
 */
function page(title: string, body: string): string {
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
export function revealPage(token: string): string {
  return page(FACTFIND_VIEW.title, `
    <h1>${escape(FACTFIND_VIEW.heading)}</h1>
    <p class="note">${escape(FACTFIND_VIEW.revealNote)}</p>
    <form method="POST" action="/broker/factfind">
      <input type="hidden" name="t" value="${escape(token)}">
      <button type="submit">${escape(FACTFIND_VIEW.reveal)}</button>
    </form>`);
}

/** A link that has been used, has expired, or never existed. Says one thing. */
export function gonePage(): string {
  return page(FACTFIND_VIEW.gone.heading, `
    <h1>${escape(FACTFIND_VIEW.gone.heading)}</h1>
    <p class="note">${escape(FACTFIND_VIEW.gone.body(BROKER.inbox))}</p>`);
}

/** The details, once. Labels come from the same config the person answered. */
export function detailsPage(row: FactFindRow): string {
  const v = FACTFIND_VIEW;
  const answers = FACTFIND.fields
    .map((field) => {
      const value = String(row[FACTFIND_COLUMNS[field.key]] ?? '').trim();
      if (value === '') return ''; // a question that was not asked
      const shown = field.options?.find((o) => o.value === value)?.label ?? value;
      return `<dt>${escape(field.label)}</dt><dd>${escape(shown)}</dd>`;
    })
    .join('');
  const contact = [
    [v.labels.name, row.applicant_name],
    [v.labels.email, row.email],
    [v.labels.phone, row.phone],
  ].filter(([, value]) => String(value).trim() !== '')
    .map(([label, value]) => `<dt>${escape(String(label))}</dt><dd>${escape(String(value))}</dd>`)
    .join('');
  return page(v.title, `
    <h1>${escape(v.heading)}</h1>
    <p class="note">${escape(v.collected(row.created_at.slice(0, 10)))}</p>
    <h2>${escape(v.contactHeading)}</h2><dl>${contact}</dl>
    <h2>${escape(v.answersHeading)}</h2><dl>${answers}</dl>
    <p class="note">${escape(v.footer)}</p>`);
}

/**
 * THE RETENTION SWEEP, run by the existing cron. Two rules, both from config:
 * once the broker has read a fact-find it is his record and ours goes within
 * days; if he never reads it, it goes at the maximum age regardless.
 */
export async function purgeFactFinds(db: D1Database, nowMs = Date.now()): Promise<void> {
  const day = 86_400_000;
  const viewedBefore = new Date(nowMs - FACTFIND_RULES.keepAfterViewedDays * day).toISOString();
  const createdBefore = new Date(nowMs - FACTFIND_RULES.keepMaxDays * day).toISOString();
  await db.batch([
    db.prepare('DELETE FROM bridging_factfinds WHERE viewed_at IS NOT NULL AND viewed_at < ?').bind(viewedBefore),
    db.prepare('DELETE FROM bridging_factfinds WHERE created_at < ?').bind(createdBefore),
    // And the notification that carried the link. It holds no personal answer,
    // but it is an artefact of a transaction that is over, and a link with
    // nothing behind it is still a thing nobody needs to keep.
    db.prepare("DELETE FROM kit_outbox WHERE action = 'factfind-ready' AND created_at < ?").bind(createdBefore),
  ]);
}

/** The Kit custom field carrying the link — the ONLY thing Kit is told. */
export const KIT_FACTFIND_FIELD = 'factfind_link';

/** Who the notification goes to: the broker, at his own address. */
export const factFindRecipient = (): { email: string; name: string } => ({ email: BROKER.email, name: BROKER.name });
