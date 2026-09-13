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
import * as broker from './brokerLink';

/** One implementation of the token pair, shared with the enquiry link (F3).
 * Re-exported because this module was their home first. */
export const mintToken = broker.mintToken;
export const hashToken = broker.hashToken;

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

/** Step one: a button, not the details. A scanner following the link sees this. */
export function revealPage(token: string): string {
  return broker.revealPage(FACTFIND_VIEW, '/broker/factfind', token);
}

/** A link that has been used, has expired, or never existed. Says one thing. */
export function gonePage(): string {
  return broker.gonePage(FACTFIND_VIEW, BROKER.inbox);
}

/**
 * The details, once. Every label comes from FACTFIND — the same config the
 * person answered — so nothing is re-worded between the asking and the reading.
 * A question that was never asked has no value and is not shown.
 */
export function detailsPage(row: FactFindRow): string {
  const answers = FACTFIND.fields.map((field) => {
    const value = String(row[FACTFIND_COLUMNS[field.key]] ?? '').trim();
    return { label: field.label, value: field.options?.find((o) => o.value === value)?.label ?? value };
  });
  const contact = [
    { label: FACTFIND_VIEW.labels.name, value: row.applicant_name },
    { label: FACTFIND_VIEW.labels.email, value: row.email },
    { label: FACTFIND_VIEW.labels.phone, value: row.phone },
  ];
  return broker.detailsPage(FACTFIND_VIEW, row.created_at.slice(0, 10), contact, answers);
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
