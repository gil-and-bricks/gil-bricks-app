/**
 * ███ THE CUE LIBRARY — THIS FILE IS THE RESEARCH'S, NOT CLAUDE'S ███
 *
 * WHY IT IS EMPTY. The R3 brief said "I am pasting a research document below
 * with a library of 40 visual refurbishment cues, each tied to a real UK
 * regulation, with confidence levels and honest caveats". No document was
 * pasted — the message ended with a link to a chat artifact this session cannot
 * open. See docs/DECISIONS_LOG.md (R3).
 *
 * These are not tolerances that could be sensibly chosen, like T1's. They are
 * FACTUAL CLAIMS ABOUT UK REGULATIONS attached to advice with financial and
 * safety consequences — the operator's own words were that getting one wrong
 * "could cost someone a deal or thousands of pounds". Inventing forty of them,
 * with invented regulation references and invented confidence levels, would be
 * the single most damaging thing this product could ship.
 *
 * So the whole machine is built and this table is empty. Paste the library in
 * and the carousel starts serving tips; nothing else needs changing.
 *
 * WHILE IT IS EMPTY: the photo carousel works, rooms can be tagged, and each
 * photo simply carries no pointer. The section says so honestly rather than
 * showing a blank space where advice should be.
 *
 * ── HOW TO FILL IT IN ───────────────────────────────────────────────────────
 *
 * REGULATIONS FIRST. Each one is referenced by key, so changing a regulation is
 * one edit that cascades to every tip citing it:
 *
 *     'part-p': {
 *       name: 'Building Regulations Part P',
 *       what: 'Electrical safety in dwellings.',
 *       lastChecked: '2026-09-01',
 *     },
 *
 * THEN THE TIPS. One per cue, each naming the regulation it rests on, the cost
 * item it implicates, its confidence, and its caveat:
 *
 *     {
 *       key: 'fuse-box-rewireable',
 *       room: 'hall',
 *       confidence: 'indicative',
 *       costItem: 'rewire',
 *       regulation: 'part-p',
 *       look: 'Look for a fuse box with rewireable fuses rather than breakers.',
 *       means: 'An old board does not always mean a full rewire, but budget for an electrician to test it.',
 *       caveat: 'Only an EICR can say what the wiring behind it is like.',
 *     },
 *
 * ── THE RULES THE WORDING MUST OBEY ─────────────────────────────────────────
 * These are enforced by `honesty.test.ts`, which fails the build. They are not
 * style preferences; they are what keeps this defensible.
 *
 *  1. NEVER CLAIM TO HAVE SEEN ANYTHING. We cannot look at a photograph. Every
 *     tip says what to LOOK FOR and what it MIGHT mean. Banned outright: "we
 *     can see", "this photo shows", "the image shows", "we have spotted",
 *     "detected", "appears to be", "looks like it has".
 *  2. NEVER DIAGNOSE. "This property needs rewiring" is indefensible. Banned:
 *     "needs a", "requires a", "must be replaced", "is unsafe", "will fail".
 *  3. CONFIDENCE CHANGES THE WORDING, and the test checks it:
 *       'conclusive'  — may be stated plainly. Still no diagnosis.
 *       'indicative'  — MUST read as a prompt to investigate: the `means` line
 *                       has to contain a hedge ("may", "might", "could",
 *                       "not always", "budget for", "worth checking", "ask").
 *       'weak'        — the same hedging, AND it is shown last and rarely.
 *  4. EVERY TIP CARRIES A CAVEAT, and it may not be empty.
 *  5. EVERY TIP NAMES A REAL COST ITEM from src/config/refurb.ts, so seeing it
 *     can tick it.
 *  6. EVERY TIP NAMES A REGULATION THAT EXISTS IN THE TABLE BELOW.
 */
import type { RefurbCue, RegulationRef } from './types';

/** Regulations, by key. A change here cascades to every tip that cites it. */
export const REGULATIONS: Record<string, RegulationRef> = {
  // Paste the research's regulation table here.
};

/** The cues. Paste the research's forty here. */
export const CUES: readonly RefurbCue[] = [
  // Paste the research's cue library here.
];

/** True once the operator's research is in. Nothing is served until it is. */
export function libraryReady(): boolean {
  return CUES.length > 0 && Object.keys(REGULATIONS).length > 0;
}
