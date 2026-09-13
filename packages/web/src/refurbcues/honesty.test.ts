/**
 * R3 — THE HONESTY GUARDRAIL.
 *
 * This is the test the whole feature rests on. A tip that claims to have SEEN
 * something, or that DIAGNOSES what a survey would be needed to confirm, is not
 * a style problem — in the operator's own words it "could cost someone a deal or
 * thousands of pounds". So the rules are enforced on every cue in the library,
 * and the same rules are applied to a set of FIXTURES here, so the guard itself
 * is proved to catch what it claims to catch rather than passing vacuously on an
 * empty library.
 */
import { describe, expect, it } from 'vitest';
import { CUES, REGULATIONS, libraryReady } from './library';
import { REFURB_ITEMS } from '../config/refurb';
import { CUE_ROOMS, type RefurbCue } from './types';

/** Claiming to have looked at the photograph. We cannot see anything. */
const CLAIMS_SIGHT = [
  'we can see', 'we see', 'this photo shows', 'the photo shows', 'the image shows',
  'we have spotted', 'we spotted', 'we detected', 'detected', 'appears to be',
  'looks like it has', 'visible in this', 'shown here', 'as seen',
];

/** Stating a conclusion only a survey, an EICR or a gas check could reach. */
const DIAGNOSES = [
  'needs a full', 'needs rewiring', 'needs replacing', 'requires a full', 'must be replaced',
  'must be rewired', 'is unsafe', 'will fail', 'is dangerous', 'has damp', 'is damp',
  'has subsidence', 'is rotten', 'will need replacing',
];

/** Words that turn a statement into a prompt to investigate. */
const HEDGES = [
  'may', 'might', 'could', 'not always', 'budget for', 'worth checking', 'worth asking',
  'ask ', 'check ', 'can be', 'often', 'sometimes', 'consider', 'allow for', 'no guarantee',
];

const lower = (c: RefurbCue): string => `${c.look} ${c.means}`.toLowerCase();

/** The rules, as one function, so fixtures and the real library face the same. */
export function honestyProblems(cue: RefurbCue): string[] {
  const out: string[] = [];
  const text = lower(cue);
  for (const phrase of CLAIMS_SIGHT) if (text.includes(phrase)) out.push(`${cue.key}: claims sight — "${phrase}"`);
  for (const phrase of DIAGNOSES) if (text.includes(phrase)) out.push(`${cue.key}: diagnoses — "${phrase}"`);
  if (cue.caveat.trim() === '') out.push(`${cue.key}: no caveat`);
  if (cue.confidence !== 'conclusive') {
    const hedged = HEDGES.some((h) => cue.means.toLowerCase().includes(h));
    if (!hedged) out.push(`${cue.key}: ${cue.confidence} but states it flatly — no hedge in "means"`);
  }
  return out;
}

describe('the guard catches what it claims to catch', () => {
  const base: RefurbCue = {
    key: 'fixture', room: 'hall', confidence: 'indicative', costItem: 'rewire',
    regulation: 'r', look: 'Look for a consumer unit with rewireable fuses.',
    means: 'An old board does not always mean a rewire, but budget for an electrician to test it.',
    caveat: 'Only an EICR can say what the wiring behind it is like.',
  };

  it('passes a properly written indicative tip', () => {
    expect(honestyProblems(base)).toEqual([]);
  });

  it('CATCHES a tip that claims to have seen something', () => {
    for (const bad of ['We can see an old fuse box here.', 'This photo shows a rewireable board.', 'We have spotted damp.']) {
      expect(honestyProblems({ ...base, look: bad }), bad).not.toEqual([]);
    }
  });

  it('CATCHES a tip that diagnoses', () => {
    for (const bad of ['This property needs rewiring.', 'The wiring is unsafe.', 'It has damp.']) {
      expect(honestyProblems({ ...base, means: bad }), bad).not.toEqual([]);
    }
  });

  it('CATCHES an indicative tip stated as flat fact', () => {
    const flat = { ...base, means: 'The consumer unit is from the 1970s.' };
    expect(honestyProblems(flat).join(' ')).toContain('no hedge');
  });

  it('CATCHES a weak tip stated as flat fact', () => {
    const flat: RefurbCue = { ...base, confidence: 'weak', means: 'The windows are single glazed.' };
    expect(honestyProblems(flat).join(' ')).toContain('no hedge');
  });

  it('CATCHES a dropped caveat', () => {
    expect(honestyProblems({ ...base, caveat: '   ' }).join(' ')).toContain('no caveat');
  });

  it('allows a CONCLUSIVE tip to be stated plainly — but still not to diagnose', () => {
    const conclusive: RefurbCue = { ...base, confidence: 'conclusive', means: 'That is a rewireable fuse board.' };
    expect(honestyProblems(conclusive)).toEqual([]);
    expect(honestyProblems({ ...conclusive, means: 'That board is unsafe.' })).not.toEqual([]);
  });
});

describe('every shipped cue obeys the rules', () => {
  it('none claims sight, diagnoses, drops its caveat, or states a hedge-needing tip flatly', () => {
    const problems = CUES.flatMap(honestyProblems);
    expect(problems).toEqual([]);
  });

  it('every cue names a cost item that exists, so seeing it can tick it', () => {
    const keys = new Set(REFURB_ITEMS.map((i) => i.key));
    for (const c of CUES) expect(keys.has(c.costItem), `${c.key} → ${c.costItem}`).toBe(true);
  });

  it('every cue names a regulation that exists, with a date it was last checked', () => {
    for (const c of CUES) {
      const reg = REGULATIONS[c.regulation];
      expect(reg, `${c.key} → ${c.regulation}`).toBeDefined();
      expect(reg.lastChecked, `${c.regulation} lastChecked`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(reg.name.trim(), `${c.regulation} name`).not.toBe('');
    }
  });

  it('every cue has a real room, and a unique key', () => {
    const seen = new Set<string>();
    for (const c of CUES) {
      expect([...CUE_ROOMS, 'any'], c.key).toContain(c.room);
      expect(seen.has(c.key), `duplicate key ${c.key}`).toBe(false);
      seen.add(c.key);
    }
  });

  it('and until the research is pasted in, the library is honestly EMPTY', () => {
    // R3 shipped with no cues: the brief's research document never arrived, and
    // forty invented regulatory claims is the one thing this must never do.
    // When the library is filled this expectation flips to true and the two
    // tests above start doing the work.
    expect(libraryReady()).toBe(CUES.length > 0);
  });
});
