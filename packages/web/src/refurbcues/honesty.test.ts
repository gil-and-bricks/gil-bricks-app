/**
 * R3 — THE HONESTY GUARDRAIL.
 *
 * This is the test the whole feature rests on. A tip that claims to have SEEN
 * something, or that DIAGNOSES what a survey would be needed to confirm, is not
 * a style problem — in the operator's own words it "could cost someone a deal or
 * thousands of pounds". So the rules are enforced on every cue in the library,
 * and the same rules are applied to a set of FIXTURES here, so the guard itself
 * is proved to catch what it claims to catch rather than passing vacuously.
 *
 * R3.1 — WHAT CHANGED WHEN THE REAL LIBRARY ARRIVED. Two gaps showed up the
 * moment forty real tips were run through it:
 *
 *  1. IT DID NOT CATCH AN ASSERTION. "The fuse box looks old" contains none of
 *     the banned phrases, but it still tells someone the photograph has a fuse
 *     box in it, which we cannot know. The guard now catches a sentence that
 *     OPENS by asserting the thing is there. Two of the forty failed on this
 *     and were withheld rather than reworded; the operator has since reworded
 *     their openings, so all forty now ship and WITHHELD is empty. The rule
 *     that caught them has NOT been relaxed — see the fixtures below.
 *  2. ITS HEDGE VOCABULARY WAS TOO SMALL. It knew "may" and "might" but not
 *     "can mean", "usually", "checked" or "ask". Those are real hedges, so the
 *     list grew and the matching became word-stem based. This is the guard
 *     learning English, NOT a tip being softened: no cue's wording was touched
 *     to make it pass, and the fixtures below still prove flat assertions fail.
 *
 * R3.1 — AND FOUR MORE, FOUND BY TRYING TO FOOL IT ON PURPOSE. Every one was
 * demonstrated with a wording that scored zero problems, and each now has a
 * fixture below that would fail without the fix:
 *
 *  3. THE CAVEAT WAS NEVER READ. It is a third of every tip's visible text and
 *     the guard only checked it was not empty, so "the photo clearly shows
 *     scorching, so it is unsafe" passed as a caveat. All the content rules now
 *     apply to it.
 *  4. THE SIGHT LIST WAS SINGULAR-ONLY. "The photo shows" was banned; "These
 *     photos show" was not. One letter defeated the rule the feature rests on.
 *  5. "EXPECT" WAS COUNTED AS A HEDGE. It is the opposite — an instruction to
 *     ASSUME a defect. Removed. Genuine prompts to investigate ("ask", "check")
 *     stay, because reading as a prompt to investigate IS the rule.
 *     The escape that exposed it — "You can expect a full rewire on THIS ONE.
 *     Ask your electrician to price it." — is really a different fault: it is a
 *     claim about THIS property, which we have never seen. So there is now a
 *     rule for that, and it is the sharper one.
 *     (Requiring the hedge in the CLAIM sentence rather than anywhere in
 *     `means` was tried first and rejected: it fails 15 of the 30 indicative
 *     and weak cues, including honest general statements like "Bathrooms need
 *     good air flow" and "Wide-angle photos make rooms look bigger". A rule
 *     that withholds half the library over correct English is a bad rule.)
 *  6. THE DIAGNOSIS LIST WAS LITERAL SUBSTRINGS, so near-synonyms walked
 *     through: "is not safe", "will need a rewire", "would fail an EICR",
 *     "has rotted through", "is a fire risk". Widened, and matched on word
 *     boundaries so "needs a" no longer trips on "needs an EICR".
 */
import { describe, expect, it } from 'vitest';
import { CUES, REGULATIONS, WITHHELD, libraryReady } from './library';
import { REFURB_ITEMS, REFURB_PHOTOS } from '../config/refurb';
import { CUE_ROOMS, type RefurbCue } from './types';

/** Claiming to have looked at the photograph. We cannot see anything. */
const CLAIMS_SIGHT = [
  'we can see', 'we see', 'this photo shows', 'the photo shows', 'the image shows',
  'we have spotted', 'we spotted', 'we detected', 'detected', 'appears to be',
  'looks like it has', 'visible in this', 'shown here', 'as seen',
  // R3.2 — all verified walking through. Note "you can see" is NOT banned:
  // a shipped cue honestly says "rot you can see", meaning what the READER can
  // see on the viewing. Locating the claim in the photograph is the fault.
  'in the photo', 'in this photo', 'in the photograph', 'in the image',
  'in these photos', 'in the picture', 'we noticed', 'we can tell', 'visible here',
  'we have seen', 'we have looked',
];

/**
 * The same claim in any number: "these photos show", "the images reveal". The
 * list above could only ever be singular, and one letter defeated it.
 */
const SIGHT_RE = new RegExp(
  '\\b(photo|photos|photograph|photographs|image|images|picture|pictures|shot|shots)\\s+'
  // NOT a claim when it is a denial — "photos rarely show the whole roof" and
  // "a photo cannot tell condensation from a leak" are honest and shipped.
  + '(?!rarely|never|seldom|barely|hardly|cannot|can\'t|do not|will not|may not)'
  // one adverb is all it took: "The photo CLEARLY shows…", "These photos ALL show…"
  + '(?:[a-z]+ly\\s+|all\\s+|already\\s+)?'
  + '(show|shows|showed|reveal|reveals|confirm|confirms|prove|proves|suggest|suggests|indicate|indicates)\\b',
);

/**
 * A claim about THIS property. Every tip is general by construction — it is
 * written once and shown against thousands of houses we have never seen — so
 * "on this one", "this property", "that house" cannot be honest, whatever
 * follows. The operator's own example of the indefensible was exactly this
 * shape: "This property needs rewiring".
 */
const ABOUT_THIS_ONE = /\b(this|that)\s+(property|house|home|flat|place|one|listing|address|kitchen|bathroom|bedroom|room|roof|board|boiler|extension|chimney|wall|window|unit|garden)\b/;

/**
 * Stating a conclusion only a survey, an EICR or a gas check could reach.
 * Matched on WORD BOUNDARIES, so "needs a" catches "needs a rewire" and leaves
 * "needs an EICR" — which is the honest opposite — alone.
 */
const DIAGNOSES = [
  'needs a full', 'needs rewiring', 'needs replacing', 'requires a full', 'must be replaced',
  'must be rewired', 'is unsafe', 'will fail', 'is dangerous', 'has damp', 'is damp',
  'has subsidence', 'is rotten', 'will need replacing',
  // R3.1 — every one of these was demonstrated walking straight through.
  'is not safe', 'are not safe', 'needs a', 'requires a', 'will need a', 'would fail',
  'is subsiding', 'has rotted', 'have rotted', 'is a fire risk', 'rising damp',
  'must come out', 'does not comply', 'is illegal', 'contains asbestos',
  // R3.2 — the plural of a banned verdict was never banned, which is the same
  // one-letter fault the sight rule learned in R3.1. Also the near-synonyms.
  'are unsafe', 'are dangerous', 'are rotten', 'are damp', 'are a fire risk',
  'contain asbestos', 'need replacing', 'need rewiring',
  // NOT banned: 'is a safety worry'. Cue #5 ships "A socket right beside the
  // sink is a safety worry" and the research calls that placement "a legitimate
  // EICR/safety concern". A worry is a precaution; "unsafe" and "hazard" are
  // verdicts on an installation nobody has inspected. If the operator disagrees,
  // add the phrase here and #5 moves to WITHHELD — the guard decides, not taste.
  'is a safety hazard', 'are a safety hazard',
  'is penetrating damp', 'is water damage', 'is asbestos', 'is finished',
  'needs to be replaced', 'will need rewiring', 'needs a new',
];

/**
 * A verdict is not a verdict when it is hedged. "can contain asbestos" and
 * "often need replacing" are honest, shipped, and would otherwise be banned by
 * the list above — so a hedging word immediately before the phrase disarms it,
 * and a bare "contain asbestos" still fails.
 */
const DISARMS = /\b(can|could|may|might|often|usually|sometimes|rarely|never|not|do not|cannot)\s$/;

/**
 * Word STEMS that turn a statement into a prompt to investigate. Matched at a
 * word boundary, so 'check' also covers "checked" and "checking".
 */
const HEDGES = [
  'may', 'might', 'could', 'not always', 'budget for', 'worth', 'usually', 'often',
  'sometimes', 'can be', 'can mean', 'can hide', 'can contain', 'can put off',
  'suggest', 'consider', 'allow for', 'no guarantee', 'ask', 'check',
  'test', 'measure', 'price',
];
// NOT a hedge, and deliberately absent: 'expect'. "Expect it to need work" tells
// someone to ASSUME a defect they cannot see, which is the thing being guarded
// against, not a softening of it.

/**
 * A sentence that OPENS by asserting the thing is in the photograph: a
 * demonstrative, a noun phrase, then a linking verb — "The fuse box looks old",
 * "This plastic fuse box is legal". The one to three words in the middle are
 * what separate an assertion from a plain reference like "That is cheap".
 */
const ASSERTS = /^(this|that|these|those|the)\s+(?:[a-z0-9'’-]+\s+){1,5}(is|are|was|were|looks|look|has|have|shows|show)\b/;

/**
 * ASSERTS is anchored, so it only ever sees the start of a CLAUSE — and the
 * sentence splitter only broke on . ! ?. A comma, semicolon, dash or colon hid
 * an assertion completely: "Worth noting, the fuse box is an old rewireable
 * one." So clauses are split on those too.
 */
const clauses = (s: string): string[] => s.split(/[.!?;:,—]+\s*/).map((x) => x.trim()).filter(Boolean);

const sentences = (s: string): string[] => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const hedged = (s: string): boolean => HEDGES.some((h) => new RegExp(`\\b${h}`, 'i').test(s));

/** The rules, as one function, so fixtures and the real library face the same. */
export function honestyProblems(cue: RefurbCue): string[] {
  const out: string[] = [];
  // THE CAVEAT IS IN HERE. It is rendered on screen beside the tip, so it is
  // held to the same rules as the rest of it.
  const text = `${cue.look} ${cue.means} ${cue.caveat}`.toLowerCase();
  for (const phrase of CLAIMS_SIGHT) if (text.includes(phrase)) out.push(`${cue.key}: claims sight — "${phrase}"`);
  if (SIGHT_RE.test(text)) out.push(`${cue.key}: claims sight — "${SIGHT_RE.exec(text)?.[0]}"`);
  if (ABOUT_THIS_ONE.test(text)) out.push(`${cue.key}: speaks about THIS property — "${ABOUT_THIS_ONE.exec(text)?.[0]}"`);
  for (const phrase of DIAGNOSES) {
    const at = new RegExp(`\\b${phrase}\\b`).exec(text);
    if (at !== null && !DISARMS.test(text.slice(0, at.index))) {
      out.push(`${cue.key}: diagnoses — "${phrase}"`);
    }
  }
  for (const s of [...clauses(cue.look), ...clauses(cue.means), ...clauses(cue.caveat)]) {
    if (ASSERTS.test(s.toLowerCase())) out.push(`${cue.key}: asserts the photo contains it — "${s}"`);
  }
  // A caveat of "." or "n/a" satisfied "not empty" while rendering as a third
  // of the tip saying nothing. The shortest honest one shipped is 12 characters.
  if (cue.caveat.trim().length < 10) out.push(`${cue.key}: no real caveat`);
  if (cue.confidence === 'indicative' || cue.confidence === 'weak') {
    if (!hedged(cue.means)) out.push(`${cue.key}: ${cue.confidence} but states it flatly — no hedge in "means"`);
  }
  return out;
}

describe('the guard catches what it claims to catch', () => {
  const base: RefurbCue = {
    key: 'fixture', room: 'hall', confidence: 'indicative', costItem: 'rewire',
    regulation: 'r', basis: 'standard', look: 'Look for a consumer unit with rewireable fuses.',
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

  it('CATCHES a tip that OPENS by asserting the photo contains the thing', () => {
    for (const bad of [
      'The fuse box looks old.',
      'This plastic fuse box is legal.',
      'These timber windows have rotted.',
      'That consumer unit is plastic.',
    ]) {
      expect(honestyProblems({ ...base, means: `${bad} It may still be fine.` }).join(' '), bad)
        .toContain('asserts the photo contains it');
    }
  });

  it('but does NOT trip on a plain back-reference or a general rule', () => {
    for (const fine of [
      'That is cheap and helps the energy rating.',
      'An old fuse box under the stairs is common.',
      'Thin single radiators are older.',
      'A few loose tiles is a repair.',
    ]) {
      expect(honestyProblems({ ...base, means: `${fine} It may still be worth checking.` }).join(' '), fine)
        .not.toContain('asserts');
    }
  });

  it('CATCHES an indicative tip stated as flat fact', () => {
    const flat = { ...base, means: 'A consumer unit of that age was fitted in the 1970s.' };
    expect(honestyProblems(flat).join(' ')).toContain('no hedge');
  });

  it('CATCHES a weak tip stated as flat fact', () => {
    const flat: RefurbCue = { ...base, confidence: 'weak', means: 'Those windows were single glazed.' };
    expect(honestyProblems(flat).join(' ')).toContain('no hedge');
  });

  /**
   * THE FOUR ESCAPES, each one a wording that was VERIFIED scoring zero
   * problems before the guard was tightened. If a future edit reopens any of
   * these holes, the build stops here.
   */
  it('CATCHES a dishonest CAVEAT — it is on screen, so it is guarded', () => {
    const bad = { ...base, caveat: 'the photo clearly shows scorching on the board, so it is unsafe.' };
    expect(honestyProblems(bad)).not.toEqual([]);
  });

  it('CATCHES a sight claim in the PLURAL', () => {
    for (const bad of [
      'These photos show rising damp across the ground-floor walls.',
      'The images show a rewireable fuse board.',
      'The pictures confirm a failed damp course.',
    ]) {
      expect(honestyProblems({ ...base, means: `${bad} Ask for a report.` }), bad).not.toEqual([]);
    }
  });

  it('CATCHES a tip that speaks about THIS property, which it has never seen', () => {
    for (const bad of [
      'You can expect a full rewire on this one. Ask your electrician to price it.',
      'This property needs work throughout. Worth checking.',
      'That house may have been rewired. Ask the agent.',
    ]) {
      expect(honestyProblems({ ...base, means: bad }).join(' '), bad).toContain('THIS property');
    }
  });

  it('and does NOT count an instruction to ASSUME as a hedge', () => {
    // 'expect' is deliberately absent from HEDGES; only the real hedge saves it
    const bad = { ...base, means: 'Older wiring is a problem. Expect to replace it.' };
    expect(honestyProblems(bad).join(' ')).toContain('no hedge');
  });

  it('CATCHES a diagnosis dressed in a synonym', () => {
    for (const bad of [
      'Wiring like that is not safe and will need a rewire before you let it.',
      'Wiring of that age would fail an EICR today.',
      'A crack pattern like that means the bay is subsiding.',
      'Frames like that have rotted through.',
      'A board like that is a fire risk.',
      'A stain like that is rising damp.',
    ]) {
      expect(honestyProblems({ ...base, means: `${bad} Worth checking.` }), bad).not.toEqual([]);
    }
  });

  it('but still lets the honest opposite through — "needs an EICR" is not a diagnosis', () => {
    const fine = { ...base, caveat: 'needs an EICR.', means: 'An old board may mean work; worth checking.' };
    expect(honestyProblems(fine)).toEqual([]);
  });

  /**
   * R3.2 — A SECOND ADVERSARIAL PASS. Every wording below was VERIFIED scoring
   * zero problems against the R3.1 guard. They are here so the holes cannot
   * reopen, and because a guard nobody attacks is a guard nobody has tested.
   */
  it('CATCHES "photograph" — the synonym that defeated both sight rules', () => {
    for (const bad of [
      'The photograph shows an old fuse box with rewireable fuses.',
      'The photographs reveal a cracked chimney stack.',
      'The photo clearly shows scorching around the board.',
      'These photos all show damp staining along the skirting.',
      'These images suggest a rewireable board behind the door.',
    ]) {
      expect(honestyProblems({ ...base, means: `${bad} Ask an electrician to check it.` }), bad).not.toEqual([]);
    }
  });

  it('CATCHES a claim located in the photograph', () => {
    for (const bad of [
      'In the photo you can see black mould around the shower seal.',
      'We noticed an old fuse box in the hall.',
    ]) {
      expect(honestyProblems({ ...base, look: bad }), bad).not.toEqual([]);
    }
  });

  it('but leaves "rot you can see" alone — that is the READER looking, on the viewing', () => {
    const fine = { ...base, look: 'Look for old timber windows with peeling paint, or rot you can see.' };
    expect(honestyProblems(fine)).toEqual([]);
  });

  it('CATCHES an assertion hidden behind a prepositional phrase or a comma', () => {
    for (const bad of [
      'The fuse box in the hall is old and tired.',
      'The fuse box under the stairs is old and tired.',
      'Worth noting, the fuse box is an old rewireable one.',
      'Budget for an electrician; the consumer unit is plastic and original.',
    ]) {
      expect(honestyProblems({ ...base, means: `${bad} Ask for an EICR.` }).join(' '), bad).toContain('asserts');
    }
  });

  it('CATCHES a claim about this kitchen, this roof, this listing', () => {
    for (const bad of [
      'You can expect a full rewire in this kitchen.',
      'This roof will cost about £8,000 to replace.',
      'In this listing the kitchen is the original one.',
    ]) {
      expect(honestyProblems({ ...base, means: `${bad} Ask for quotes.` }).join(' '), bad).toContain('THIS property');
    }
  });

  it('CATCHES the PLURAL of a banned verdict — the same one-letter fault, again', () => {
    for (const bad of [
      'Fuse boards of that age are unsafe.',
      'Textured ceilings of that age contain asbestos.',
      'Walls like that are damp behind the plaster.',
      'Boilers of that age need replacing now.',
    ]) {
      expect(honestyProblems({ ...base, means: `${bad} Ask a surveyor to check.` }), bad).not.toEqual([]);
    }
  });

  it('but a HEDGED verdict is not a verdict — both of these are shipped and honest', () => {
    for (const fine of [
      'Textured ‘Artex’ ceilings in older homes can contain asbestos. Get it tested before any work.',
      'Old boilers often need replacing soon. Ask its age and for the gas safety record.',
    ]) {
      expect(honestyProblems({ ...base, means: fine }), fine).toEqual([]);
    }
  });

  it('CATCHES the cue whose every field was dishonest and scored zero', () => {
    const bad: RefurbCue = {
      ...base,
      look: 'In the photo you can see a rewireable fuse box under the stairs.',
      means: 'The photograph shows scorching around the fuses. Worth pricing a full rewire at about £6,000.',
      caveat: 'the photos clearly show the board is past its life, so price it in.',
    };
    expect(honestyProblems(bad).length).toBeGreaterThan(2);
  });

  it('CATCHES a dropped caveat — and one that is there in name only', () => {
    expect(honestyProblems({ ...base, caveat: '   ' }).join(' ')).toContain('no real caveat');
    // "not empty" was satisfied by a full stop, which renders as a third of the
    // tip saying nothing while the build stays green
    for (const thin of ['.', '—', 'n/a', 'tbc']) {
      expect(honestyProblems({ ...base, caveat: thin }).join(' '), thin).toContain('no real caveat');
    }
  });

  it('lets CONCLUSIVE and STRONG state the general fact plainly — never diagnose', () => {
    const strong: RefurbCue = { ...base, confidence: 'strong', means: 'A water tank in the loft means an older heating system.' };
    expect(honestyProblems(strong)).toEqual([]);
    expect(honestyProblems({ ...strong, means: 'A water tank in the loft is dangerous.' })).not.toEqual([]);
  });
});

describe('every shipped cue obeys the rules', () => {
  it('none claims sight, asserts, diagnoses, drops its caveat, or states a hedge-needing tip flatly', () => {
    const problems = CUES.flatMap(honestyProblems);
    expect(problems).toEqual([]);
  });

  it('every cost item it names exists, so seeing it can tick it', () => {
    const keys = new Set(REFURB_ITEMS.map((i) => i.key));
    for (const c of CUES) {
      if (c.costItem === null) continue;
      expect(keys.has(c.costItem), `${c.key} → ${c.costItem}`).toBe(true);
    }
  });

  it('every regulation it names exists, with a date it was last checked', () => {
    for (const c of CUES) {
      if (c.regulation === null) continue;
      const reg = REGULATIONS[c.regulation];
      expect(reg, `${c.key} → ${c.regulation}`).toBeDefined();
      expect(reg.lastChecked, `${c.regulation} lastChecked`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(reg.name.trim(), `${c.regulation} name`).not.toBe('');
    }
  });

  it('a cue with NO regulation says it is trade experience, not law', () => {
    for (const c of CUES) {
      if (c.regulation === null) expect(c.basis, c.key).toBe('practitioner');
    }
  });

  it('every basis and confidence has words on screen, so nothing renders blank', () => {
    for (const c of CUES) {
      expect(REFURB_PHOTOS.tip.basis[c.basis], c.key).toBeTruthy();
      expect(REFURB_PHOTOS.tip.confidence[c.confidence], c.key).toBeTruthy();
    }
  });

  /**
   * ENGLAND AND WALES, and the difference matters. Four of the instruments the
   * research cites bind England only; Wales licenses HMOs, sets boiler rules
   * and requires alarms under its own devolved law. A Welsh user shown
   * "Boiler Plus · The law" with no qualifier is being told something untrue,
   * so the name carries the qualifier the research's own text carries.
   */
  it('an England-only instrument says England in its name', () => {
    for (const key of ['part-p', 'boiler-plus', 'smoke-co-2022', 'si-2018-616']) {
      expect(REGULATIONS[key], key).toBeDefined();
      expect(REGULATIONS[key].name, key).toContain('England');
    }
  });

  it('and no regulation names a country we do not serve', () => {
    for (const [key, reg] of Object.entries(REGULATIONS)) {
      const said = `${reg.name} ${reg.what}`;
      for (const out of ['Scotland', 'Northern Ireland']) expect(said, `${key} → ${out}`).not.toContain(out);
    }
  });

  /**
   * THE COUNTS THE PROSE QUOTES. types.ts and carousel.tsx both state how many
   * cues rest on trade experience, and docs/FEATURE_FLAGS.md quotes both
   * numbers. "Twelve" survived in three files after MEES was dropped from three
   * more cues, because nothing checked it. If this fails, fix the prose.
   */
  it('fifteen cues carry no regulation, five carry no cost item', () => {
    expect(CUES.filter((c) => c.regulation === null)).toHaveLength(15);
    expect(CUES.filter((c) => c.costItem === null)).toHaveLength(5);
  });

  it('every cue has a real room, and a unique key', () => {
    const seen = new Set<string>();
    for (const c of CUES) {
      expect([...CUE_ROOMS, 'any'], c.key).toContain(c.room);
      expect(seen.has(c.key), `duplicate key ${c.key}`).toBe(false);
      seen.add(c.key);
    }
  });

  /**
   * `confidence` is data in the same paste as the wording, and it is the switch
   * for the hedge rule — set it to 'conclusive' and that rule is skipped. The
   * research assigns 'conclusive' to NOTHING, so neither do we: a cue cannot
   * opt itself out of the one rule that still bites once the lists are dodged.
   */
  it('no cue declares itself conclusive — the research never does either', () => {
    for (const c of CUES) expect(c.confidence, c.key).not.toBe('conclusive');
  });

  it('the library is in, and covers every room a person can tap', () => {
    expect(libraryReady()).toBe(true);
    for (const room of CUE_ROOMS) {
      expect(CUES.some((c) => c.room === room), `no cue for ${room}`).toBe(true);
    }
  });

  it('all forty of the research are accounted for — served or withheld, none lost', () => {
    expect(CUES.length + WITHHELD.length).toBe(40);
  });

  /**
   * THE N5 COPY RULES APPLY HERE TOO. Each line is its own block on screen, so
   * each is held to two sentences and about thirty words — the same law as the
   * rest of the app, and it is not enforced anywhere else for this file because
   * the copy gate walks rendered PAGES and a tip only renders with photos in
   * the URL.
   *
   * THREE ARE EXEMPT, named with the reason, exactly as copy.test.ts does it.
   * Each runs to three short sentences because the third is a SAFETY
   * instruction — do not scrape it, do not break it — and the wording is the
   * operator's research verbatim. Shortening one would mean rewording it, which
   * the brief forbids. All three are well inside the word cap.
   */
  const THREE_SENTENCE_EXEMPT: Record<string, string> = {
    'artex-textured-ceiling': 'third sentence is the asbestos safety instruction',
    'hall-consumer-unit-understairs': 'third sentence is the action to take',
    'outbuilding-asbestos-roof': 'third sentence is the asbestos safety instruction',
  };

  it('no line on screen runs over thirty words or past two sentences', () => {
    const words = (s: string): number => (s.trim().match(/[A-Za-z0-9£%.,'’·—-]+/g) ?? []).length;
    const sentenceCount = (s: string): number => sentences(s).length;
    const offenders: string[] = [];
    for (const c of CUES) {
      for (const [field, text] of [['look', c.look], ['means', c.means], ['caveat', c.caveat]] as const) {
        if (words(text) > 30) offenders.push(`${c.key}.${field}: ${words(text)} words`);
        if (sentenceCount(text) > 2 && !(field === 'means' && c.key in THREE_SENTENCE_EXEMPT)) {
          offenders.push(`${c.key}.${field}: ${sentenceCount(text)} sentences`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and every exemption names a cue that really is over, so none is stale', () => {
    for (const key of Object.keys(THREE_SENTENCE_EXEMPT)) {
      const cue = CUES.find((c) => c.key === key);
      expect(cue, key).toBeDefined();
      expect(sentences(cue!.means).length, key).toBeGreaterThan(2);
    }
  });
});

describe('the withheld cues were withheld FOR CAUSE, and are provably out', () => {
  /**
   * Nothing is withheld today: all forty are served. Said out loud, because the
   * three loops below pass vacuously on an empty list and a reader deserves to
   * know which of the two situations they are in.
   */
  it('right now NOTHING is withheld — all forty ship', () => {
    expect(WITHHELD).toEqual([]);
    expect(CUES).toHaveLength(40);
  });

  it('each one actually fails the guard — it is not a matter of taste', () => {
    for (const { cue } of WITHHELD) {
      expect(honestyProblems(cue), cue.key).not.toEqual([]);
    }
  });

  it('each one says why, in words', () => {
    for (const { cue, reason } of WITHHELD) {
      expect(reason.trim().length, cue.key).toBeGreaterThan(20);
    }
  });

  it('and none of them can reach a user', () => {
    const served = new Set(CUES.map((c) => c.key));
    for (const { cue } of WITHHELD) expect(served.has(cue.key), cue.key).toBe(false);
  });
});
