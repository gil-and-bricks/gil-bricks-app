/**
 * Bridging enquiry: validation and qualification (F1). PURE — no DOM, no
 * network, no copy. The browser uses it to show errors early; the WORKER uses
 * the same functions to decide, so what the user sees and what is stored can
 * never disagree, and nothing here can be bypassed from the client.
 *
 * TWO buckets only, on purpose: qualified, or not yet. A third would need an
 * admin system nobody has.
 */
import { BRIDGING_RULES } from '../config/bridging';

export type DepositBand = 'under-10' | '10-24' | '25-plus' | 'not-sure';
export type PropertyState = 'found' | 'auction' | 'looking';
export type Entity = 'personal' | 'ltd' | 'not-sure';
export type ExitRoute = 'refinance' | 'sell' | 'other';
export type Timing = '4-weeks' | '1-3-months' | 'researching';
export type CreditAnswer = 'none' | 'some' | 'discuss';

export interface Enquiry {
  loan: string;
  deposit: DepositBand | '';
  property: PropertyState | '';
  entity: Entity | '';
  exit: ExitRoute | '';
  story: string;
  timing: Timing | '';
  credit: CreditAnswer | '';
  phone: string;
  consent: boolean;
}

export const EMPTY_ENQUIRY: Enquiry = {
  loan: '', deposit: '', property: '', entity: '', exit: '', story: '',
  timing: '', credit: '', phone: '', consent: false,
};

const DEPOSITS: DepositBand[] = ['under-10', '10-24', '25-plus', 'not-sure'];
const PROPERTIES: PropertyState[] = ['found', 'auction', 'looking'];
const ENTITIES: Entity[] = ['personal', 'ltd', 'not-sure'];
const EXITS: ExitRoute[] = ['refinance', 'sell', 'other'];
const TIMINGS: Timing[] = ['4-weeks', '1-3-months', 'researching'];
const CREDITS: CreditAnswer[] = ['none', 'some', 'discuss'];

/** Digits only — what we store and what a phone actually is. */
export function phoneDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export function isPhone(raw: string): boolean {
  const d = phoneDigits(raw);
  return d.length >= BRIDGING_RULES.minPhoneDigits && d.length <= BRIDGING_RULES.maxPhoneDigits;
}

/** The loan as a number; '' and rubbish both mean 0, never NaN. */
export function loanAmount(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits === '' ? 0 : Number(digits);
}

/** Step 1 is complete — step 2 does not exist until this is true. */
export function step1Errors(e: Enquiry): Partial<Record<keyof Enquiry, true>> {
  const bad: Partial<Record<keyof Enquiry, true>> = {};
  if (loanAmount(e.loan) <= 0) bad.loan = true;
  if (!DEPOSITS.includes(e.deposit as DepositBand)) bad.deposit = true;
  if (!PROPERTIES.includes(e.property as PropertyState)) bad.property = true;
  if (!ENTITIES.includes(e.entity as Entity)) bad.entity = true;
  return bad;
}

export function step2Errors(e: Enquiry): Partial<Record<keyof Enquiry, true>> {
  const bad: Partial<Record<keyof Enquiry, true>> = {};
  if (!EXITS.includes(e.exit as ExitRoute)) bad.exit = true;
  if (e.story.trim().length < BRIDGING_RULES.minStoryChars) bad.story = true;
  if (!TIMINGS.includes(e.timing as Timing)) bad.timing = true;
  if (!CREDITS.includes(e.credit as CreditAnswer)) bad.credit = true;
  if (!isPhone(e.phone)) bad.phone = true;
  if (!e.consent) bad.consent = true;
  return bad;
}

export function isComplete(e: Enquiry): boolean {
  return Object.keys(step1Errors(e)).length === 0 && Object.keys(step2Errors(e)).length === 0;
}

/**
 * Does the free text read like someone who has thought about it? Length alone
 * is easy to game, so it also wants distinct words and some sign of the exit
 * they picked. Never a judgement of the person — only of the effort.
 */
export function storyQuality(story: string, exit: ExitRoute | ''): { ok: boolean; reason: string } {
  const text = story.trim();
  if (text.length < BRIDGING_RULES.minStoryChars) return { ok: false, reason: 'too-short' };
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z£0-9][a-z£0-9'’-]*/g) ?? [];
  if (words.length < BRIDGING_RULES.minStoryWords) return { ok: false, reason: 'too-few-words' };
  // Padding: the same words over and over, or one sentence pasted twice.
  const distinct = new Set(words);
  if (distinct.size < Math.ceil(words.length * BRIDGING_RULES.minDistinctWordRatio)) {
    return { ok: false, reason: 'repetitive' };
  }
  const sentences = lower.split(/[.!?\n]+/).map((x) => x.trim().replace(/\s+/g, ' ')).filter((x) => x.length > 12);
  if (new Set(sentences).size < sentences.length) return { ok: false, reason: 'repetitive' };
  // The page's own words pasted back are not an answer.
  if (looksCopiedFromPage(lower)) return { ok: false, reason: 'repetitive' };
  // The repayment route the person PICKED has to show up in what they wrote —
  // that is the whole point of the question. The general list covers people who
  // describe repayment in their own words instead.
  const forExit = exit === 'refinance' ? BRIDGING_RULES.repaymentWords.refinance
    : exit === 'sell' ? BRIDGING_RULES.repaymentWords.sell
    : BRIDGING_RULES.repaymentWords.other;
  const vocabulary = [...forExit, ...BRIDGING_RULES.repaymentWords.other];
  if (!vocabulary.some((w) => lower.includes(w))) return { ok: false, reason: 'no-repayment-route' };
  return { ok: true, reason: 'ok' };
}

/** The form's own labels and hints (config), pasted back, read as filler. */
function looksCopiedFromPage(lower: string): boolean {
  const stripped = BRIDGING_RULES.pagePhrases.reduce((acc, p) => acc.split(p).join(' '), lower).replace(/\s+/g, ' ').trim();
  // if removing our own words leaves less than half the length, it was ours
  return stripped.length < lower.trim().length * 0.5;
}

/** The deposit gate, read from config: the bands are ordered worst to best and
 * anything below the configured minimum fails. Change the threshold in config
 * and this follows it. */
export function depositPasses(band: DepositBand | ''): boolean {
  const order = BRIDGING_RULES.depositBands as readonly string[];
  const min = order.indexOf(BRIDGING_RULES.minDepositBand);
  const here = order.indexOf(band);
  return here >= 0 && min >= 0 && here >= min;
}

export type Outcome = 'qualified' | 'not-yet';

export interface Decision {
  outcome: Outcome;
  /** Stable keys, stored with the enquiry so the operator can see WHY. */
  reasons: string[];
}

/**
 * The whole rule, in one place: qualified only when every gate passes, not-yet
 * otherwise, with the reasons recorded. Thresholds come from config.
 */
export function qualify(e: Enquiry): Decision {
  const reasons: string[] = [];
  if (loanAmount(e.loan) < BRIDGING_RULES.minLoan) reasons.push('loan-below-minimum');
  if (!depositPasses(e.deposit)) reasons.push('deposit-below-minimum');
  if (e.property === 'looking' || e.property === '') reasons.push('no-property-yet');
  if (e.exit === '' ) reasons.push('no-repayment-route');
  const quality = storyQuality(e.story, e.exit as ExitRoute | '');
  if (!quality.ok) reasons.push(`story-${quality.reason}`);
  if (e.timing === 'researching') reasons.push('just-researching');
  return { outcome: reasons.length === 0 ? 'qualified' : 'not-yet', reasons };
}
