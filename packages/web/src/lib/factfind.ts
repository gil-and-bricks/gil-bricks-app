/**
 * THE BROKER'S FACT-FIND (F2) — validation, from the ONE field list.
 *
 * PURE: no DOM, no network, no copy of its own. The browser uses it to show
 * errors early and to decide which conditional questions are on screen; the
 * WORKER uses the same functions to decide what to store — so what a person sees
 * and what is kept can never disagree, and nothing here can be bypassed from the
 * client.
 *
 * Every field is required. A CONDITIONAL field is required only when its
 * condition holds, and is refused when it does not: a limited-company name is
 * never demanded of somebody buying personally, and never stored from one
 * either.
 */
import { FACTFIND, type FactFindFieldSpec } from '../config/bridging';

/** The answers, keyed by the config's own field keys. */
export type FactFind = Record<string, string>;

/** Every key the form can hold, in the order the broker asked for them. */
export const FACTFIND_KEYS: readonly string[] = FACTFIND.fields.map((f) => f.key);

export const EMPTY_FACTFIND: FactFind = Object.fromEntries(FACTFIND_KEYS.map((k) => [k, '']));

/** Is this question on screen, given the answers so far? */
export function isAsked(field: FactFindFieldSpec, answers: FactFind): boolean {
  if (!field.showWhen) return true;
  return (answers[field.showWhen.field] ?? '') === field.showWhen.is;
}

/** The questions actually being asked, in config order. */
export function askedFields(answers: FactFind): FactFindFieldSpec[] {
  return FACTFIND.fields.filter((f) => isAsked(f, answers));
}

/** The questions on one screen — conditionals included, when they apply. */
export function fieldsForStep(step: number, answers: FactFind): FactFindFieldSpec[] {
  return askedFields(answers).filter((f) => f.step === step);
}

/** How many screens the config describes. Never a number typed twice. */
export const FACTFIND_STEPS: number = FACTFIND.fields.reduce((n, f) => Math.max(n, f.step), 1);

/** A date of birth has to be a real past day, and a person. */
export function isDateOfBirth(value: string, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T12:00:00Z`);
  if (Number.isNaN(at)) return false;
  // the same day back out again, so 2026-02-31 cannot slip through
  if (new Date(at).toISOString().slice(0, 10) !== value) return false;
  // Counted in CALENDAR years, not in average ones: an eighteenth birthday is
  // eighteen, and a 365.25-day year turns half of them away (F2 review).
  const born = new Date(at);
  const today = new Date(now);
  const eighteenth = new Date(Date.UTC(born.getUTCFullYear() + 18, born.getUTCMonth(), born.getUTCDate(), 12));
  const oldest = new Date(Date.UTC(born.getUTCFullYear() + 120, born.getUTCMonth(), born.getUTCDate(), 12));
  return eighteenth.getTime() <= today.getTime() && today.getTime() <= oldest.getTime();
}

/** Which answers are missing or wrong, by key. Only ever asked questions. */
export function factFindErrors(answers: FactFind, now = Date.now()): Record<string, true> {
  const bad: Record<string, true> = {};
  for (const field of askedFields(answers)) {
    const value = (answers[field.key] ?? '').trim();
    if (value === '') { bad[field.key] = true; continue; }
    if (field.kind === 'choice' && !(field.options ?? []).some((o) => o.value === value)) bad[field.key] = true;
    if (field.kind === 'date' && !isDateOfBirth(value, now)) bad[field.key] = true;
    if (field.max !== undefined && value.length > field.max) bad[field.key] = true;
  }
  return bad;
}

/** Is one screen finished? Step 3 also needs the consent tick, in the caller. */
export function stepErrors(step: number, answers: FactFind, now = Date.now()): Record<string, true> {
  const all = factFindErrors(answers, now);
  const onThisStep = new Set(fieldsForStep(step, answers).map((f) => f.key));
  return Object.fromEntries(Object.entries(all).filter(([k]) => onThisStep.has(k))) as Record<string, true>;
}

export function isFactFindComplete(answers: FactFind, now = Date.now()): boolean {
  return Object.keys(factFindErrors(answers, now)).length === 0;
}

/**
 * The answers as they will be STORED: trimmed, capped, and with every question
 * that was not asked emptied. A company name from somebody buying personally is
 * not a typo to tidy up later — it is data we were never entitled to keep.
 */
export function cleanFactFind(answers: FactFind): FactFind {
  const out: FactFind = {};
  for (const field of FACTFIND.fields) {
    const asked = isAsked(field, answers);
    const raw = (answers[field.key] ?? '').trim();
    out[field.key] = asked ? raw.slice(0, field.max ?? 300) : '';
  }
  return out;
}
