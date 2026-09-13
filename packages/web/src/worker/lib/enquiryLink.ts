/**
 * F3 — THE BROKER'S ENQUIRY LINK: how he actually reads a qualified enquiry.
 *
 * WHY THIS EXISTS. The consent tick beside the enquiry form says "Share these
 * answers and my contact details with [him]". Before this, Kit was given an
 * email address and a first name, and every answer sat in bridging_enquiries
 * with no page that showed it to him — so the tick was claiming a disclosure
 * that never happened. The fix is the plumbing, not the wording.
 *
 * WHY IT COPIES THE FACT-FIND. That link (F2) is built, reviewed and honest:
 * single-use, expiring, only a SHA-256 hash stored, revealed by a POST so an
 * email scanner cannot spend the one use, and nothing personal through Kit.
 * The same threat model applies here, so it gets the same answer rather than a
 * second design nobody has reviewed.
 *
 * WHAT KIT IS TOLD: his own address, his own name, and a link. Not the loan,
 * not the deposit band, not the phone number, not a word of what they wrote.
 */
import { fmtMoney } from '@gil-bricks/core';

import { BRIDGING, BROKER, ENQUIRY_LINK_RULES, ENQUIRY_VIEW } from '../../config/bridging';
import * as broker from './brokerLink';

/** The row as the broker's page reads it. */
export interface EnquiryRow {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  phone: string;
  loan: number;
  deposit_band: string;
  property_state: string;
  entity: string;
  exit_route: string;
  story: string;
  timing: string;
  credit: string;
  outcome: string;
  created_at: string;
  token_hash: string | null;
  link_expires_at: string | null;
  link_viewed_at: string | null;
}

/**
 * The answers he is shown, in the order they were asked, each paired with the
 * form config that ASKED it. The label he reads is therefore the label they
 * read — there is no second wording anywhere for a question to drift into.
 */
const ANSWER_FIELDS = [
  { field: BRIDGING.form.loan, column: 'loan' },
  { field: BRIDGING.form.deposit, column: 'deposit_band' },
  { field: BRIDGING.form.property, column: 'property_state' },
  { field: BRIDGING.form.entity, column: 'entity' },
  { field: BRIDGING.form.exit, column: 'exit_route' },
  { field: BRIDGING.form.story, column: 'story' },
  { field: BRIDGING.form.timing, column: 'timing' },
  { field: BRIDGING.form.credit, column: 'credit' },
] as const;

/**
 * Every question on the form reaches him. Proved by a test, so adding a
 * question to the enquiry without showing it to him fails the build.
 *
 * A QUESTION is a block with a plain-string label. That deliberately excludes
 * the consent tick, whose label is a function of the broker's name and which is
 * how the answers reach him rather than one of them. `phone` is a question but
 * is contact, not an answer, so it is shown under Contact — hence the + 1.
 */
export function questionsOnTheForm(): string[] {
  return Object.keys(BRIDGING.form).filter((k) => {
    const v = (BRIDGING.form as Record<string, unknown>)[k] as { label?: unknown } | null;
    return v !== null && typeof v === 'object' && typeof v.label === 'string';
  });
}

export function answersCoverEveryQuestion(): boolean {
  const asked = questionsOnTheForm();
  return asked.length === ANSWER_FIELDS.length + 1 && asked.includes('phone');
}

/** The link the broker is given. Absolute, because it travels by email. */
export function enquiryLink(base: string, token: string): string {
  return `${base}/broker/enquiry?t=${encodeURIComponent(token)}`;
}

/** When a link minted now stops working. */
export function linkExpiry(nowMs = Date.now()): string {
  return new Date(nowMs + ENQUIRY_LINK_RULES.linkHours * 3_600_000).toISOString();
}

export function revealPage(token: string): string {
  return broker.revealPage(ENQUIRY_VIEW, '/broker/enquiry', token);
}

export function gonePage(): string {
  return broker.gonePage(ENQUIRY_VIEW, BROKER.inbox);
}

/**
 * What he reads. The money figure is FORMATTED, never recomputed — the stored
 * integer is the number they typed (charter rule 3).
 */
export function detailsPage(row: EnquiryRow): string {
  const answers = ANSWER_FIELDS.map(({ field, column }) => {
    const raw = (row as unknown as Record<string, unknown>)[column];
    const value = column === 'loan'
      ? fmtMoney(Number(raw ?? 0))
      : String(raw ?? '').trim();
    const options = (field as { options?: readonly { value: string; label: string }[] }).options;
    return { label: field.label, value: options?.find((o) => o.value === value)?.label ?? value };
  });
  const contact = [
    { label: ENQUIRY_VIEW.labels.name, value: row.first_name },
    { label: ENQUIRY_VIEW.labels.email, value: row.email },
    { label: ENQUIRY_VIEW.labels.phone, value: row.phone },
  ];
  return broker.detailsPage(ENQUIRY_VIEW, row.created_at.slice(0, 10), contact, answers);
}

/**
 * THE RETENTION SWEEP, run by the existing cron.
 *
 * IT CLEARS THE LINK, NOT THE ENQUIRY. An enquiry is the person's own record:
 * the privacy policy says it is kept until they delete it, and migration 0020
 * keeps the consent evidence on it deliberately. What has a short life is the
 * token — a bearer credential with nothing left to protect once he has read it,
 * or once it has expired unread. So the three link columns go back to NULL and
 * every answer stays exactly where it was.
 *
 * The notification that carried the link goes too. It holds no answer, but it
 * is an artefact of a transaction that is over.
 */
export async function purgeEnquiryLinks(db: D1Database, nowMs = Date.now()): Promise<void> {
  const day = 86_400_000;
  const viewedBefore = new Date(nowMs - ENQUIRY_LINK_RULES.keepAfterViewedDays * day).toISOString();
  const createdBefore = new Date(nowMs - ENQUIRY_LINK_RULES.keepMaxDays * day).toISOString();
  const clear = 'UPDATE bridging_enquiries SET token_hash = NULL, link_expires_at = NULL, link_viewed_at = NULL';
  await db.batch([
    db.prepare(`${clear} WHERE token_hash IS NOT NULL AND link_viewed_at IS NOT NULL AND link_viewed_at < ?`).bind(viewedBefore),
    db.prepare(`${clear} WHERE token_hash IS NOT NULL AND created_at < ?`).bind(createdBefore),
    db.prepare("DELETE FROM kit_outbox WHERE action = 'enquiry-ready' AND created_at < ?").bind(createdBefore),
  ]);
}

/** The Kit custom field carrying the link — the ONLY thing Kit is told. */
export const KIT_ENQUIRY_FIELD = 'enquiry_link';

/** Who the notification goes to: the broker, at his own address. */
export const enquiryRecipient = (): { email: string; name: string } => ({ email: BROKER.email, name: BROKER.name });
