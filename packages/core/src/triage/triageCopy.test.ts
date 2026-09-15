/**
 * X1 — THE PANEL MAY WARN. IT MAY STATE FACTS. IT MAY NEVER BLESS.
 *
 * This is the test the sprint turns on. No free dataset resolves below about
 * 1,500 people, so the panel cannot see the street, the neighbours, the
 * condition or the layout — the things that most often kill a deal. An
 * endorsement built on what it CAN see would be confidently wrong about the
 * thing that matters, and that is the most damaging thing this product could do.
 *
 * It sweeps the copy AND the rendered panel source, because copy that reaches a
 * user through a template literal is still copy.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TRIAGE_COPY } from './copy';

/** The words that turn information into a blessing. */
const FORBIDDEN = ['good', 'great', 'bargain', 'safe', 'opportunity', 'value'];

/** Every string in the copy tree, however deeply nested, functions applied. */
function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (typeof node === 'function') {
    // A copy function is copy: call it with plausible arguments and read it.
    try { out.push(String((node as (...a: unknown[]) => unknown)(7, '£1,000', '£2,000'))); } catch { /* arity */ }
  } else if (node !== null && typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) strings(v, out);
  }
  return out;
}

const ALL = strings(TRIAGE_COPY);

describe('the panel never blesses', () => {
  it('reads a real amount of copy — a vacuous sweep proves nothing', () => {
    expect(ALL.length).toBeGreaterThan(25);
    expect(ALL.join(' ').length).toBeGreaterThan(900);
  });

  it('contains no endorsement word, anywhere, in any form', () => {
    for (const word of FORBIDDEN) {
      const rx = new RegExp(`\\b${word}\\w*\\b`, 'i');
      const hits = ALL.filter((s) => rx.test(s));
      expect(hits, `"${word}" appears in panel copy: ${JSON.stringify(hits.slice(0, 2))}`).toEqual([]);
    }
  });

  it('THE DETECTOR BITES — each word is caught when planted', () => {
    /**
     * A rule nobody has watched fail is a rule nobody knows works. Each
     * forbidden word is planted in a copy-shaped object in turn.
     */
    for (const word of FORBIDDEN) {
      const planted = strings({ band: { within: `A ${word} place to buy` } });
      const caught = FORBIDDEN.some((w) => planted.some((s) => new RegExp(`\\b${w}\\w*\\b`, 'i').test(s)));
      expect(caught, `planting "${word}" was not caught`).toBe(true);
    }
  });

  it('carries no score, no verdict and no rating', () => {
    const joined = ALL.join(' ').toLowerCase();
    for (const banned of ['score', 'verdict', 'out of 10', 'rating', 'recommend']) {
      expect(joined, `panel copy mentions "${banned}"`).not.toContain(banned);
    }
  });

  it('never claims a thing is ABSENT — only that we found none in what we read', () => {
    /**
     * "No red flags FOUND" is honest. "No red flags" is a claim about a property
     * nobody has visited.
     *
     * X3 shortened this line to "Nothing flagged from this listing." — which
     * keeps the guarantee by SCOPING it ("from this listing") rather than by
     * using the word "found". So what is asserted here is the guarantee: the
     * empty state must say where it looked, and must never be a bare "no red
     * flags".
     */
    expect(
      TRIAGE_COPY.flags.nothing,
      'the empty state must say what it looked at — "found", or the listing itself',
    ).toMatch(/\bfound\b|\bfrom this listing\b|\bin this listing\b/i);
    expect(TRIAGE_COPY.flags.nothing, 'never a bare claim about the property')
      .not.toMatch(/^(there are )?no (red )?flags\.?$/i);
    expect(TRIAGE_COPY.flags.nothingWhy).toMatch(/not an all clear/i);
    for (const s of ALL) {
      expect(s, `"${s}" asserts freehold`).not.toMatch(/\bis freehold\b|\bno flood\b|\bnot listed\b/i);
    }
  });

  /**
   * X3 — THE GUARANTEE SURVIVED THE REWRITE; THE WORDING DID NOT.
   *
   * This used to require every flag to start "The listing says…", which was the
   * honest shape when the flag NAMED the fact. But naming the fact was worth
   * nothing: "the listing mentions auction", on a listing from an agent called
   * Peter Alan Auctions with a guide price on it, tells a reader what they can
   * already see. The flags now name the CONSEQUENCE.
   *
   * The thing that must not change is that we never assert a fact about a
   * property nobody has inspected. A consequence line keeps that promise by
   * being HEDGED — often, usually, can, many — or by being a QUESTION to put to
   * the agent. A flat assertion is what this now forbids.
   */
  it('every risk names a consequence, hedged or asked — never a flat assertion', async () => {
    const { FINDING_COPY } = await import('../findings/copy');
    const HEDGE = /\b(often|usually|can|could|may|might|some|many|about|sometimes)\b/i;
    const ASKS = /\bask\b/i;
    for (const code of ['LEASE', 'AUCT', 'TENANT', 'CASH', 'CONSTR', 'COMM'] as const) {
      const why = FINDING_COPY[code].why;
      expect(
        HEDGE.test(why) || ASKS.test(why),
        `${code} states a consequence as certain: "${why}" — hedge it or ask it`,
      ).toBe(true);
    }
  });

  it('and no finding claims the property IS the thing, only what would follow', async () => {
    const { FINDING_COPY } = await import('../findings/copy');
    for (const [code, w] of Object.entries(FINDING_COPY)) {
      const said = `${w.label} ${w.why}`;
      expect(said, `${code} asserts a fact about the property`).not.toMatch(/\bthis property is\b|\bit is definitely\b|\bwill be\b/i);
    }
  });

  it('the price comparison states a POSITION, in the exact words the brief set', () => {
    for (const k of ['within', 'above', 'below'] as const) {
      expect(TRIAGE_COPY.band[k]).toMatch(
        new RegExp(`^${k[0]?.toUpperCase()}${k.slice(1)} the typical range for this size and type in this area$`),
      );
    }
  });

  it('the caveats that must always be present, are', () => {
    expect(TRIAGE_COPY.band.caveat).toMatch(/size, not quality/i);
    expect(TRIAGE_COPY.band.caveat).toMatch(/cheap for a reason/i);
    expect(TRIAGE_COPY.areaCaveat).toMatch(/1,500 people/);
    expect(TRIAGE_COPY.flexibility.caveat).toMatch(/not proof/i);
  });

  it('says ROI where it explains the return — a novice needs the common name', () => {
    expect(TRIAGE_COPY.numbers.returnOnCash).toContain('(ROI)');
  });

  it('obeys the N5 length rules for every visible block', () => {
    for (const s of ALL) {
      const words = s.split(/\s+/).filter(Boolean).length;
      const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean).length;
      expect(words, `over 30 words: "${s}"`).toBeLessThanOrEqual(30);
      expect(sentences, `over 2 sentences: "${s}"`).toBeLessThanOrEqual(2);
    }
  });
});

describe('and the rendered panel does not reintroduce any of it', () => {
  const PANEL = join(dirname(fileURLToPath(import.meta.url)), '../../../extension/entrypoints/sidepanel');

  it('the panel source is where this test thinks it is', () => {
    expect(existsSync(PANEL), `no panel at ${PANEL}`).toBe(true);
  });

  it('the panel detector still bites on a real endorsement', () => {
    // The two narrowings above must not have opened a hole. A judgement in
    // prose is still caught; a property access and "end value" are not.
    const isCode = (s: string): boolean => /[.(){};=]|\|\||=>|\bconst\b/.test(s) && !/[a-z] [a-z]+ [a-z]/i.test(s);
    const allowed = (s: string, w: string): boolean => w === 'value' && /\bend value\b/i.test(s);
    const judge = 'This looks like good value for the area';
    expect(isCode(judge)).toBe(false);
    expect(allowed(judge, 'value')).toBe(false);
    expect(isCode('L.postcode.value ||')).toBe(true);
    expect(allowed('needed for a credible end value', 'value')).toBe(true);
  });

  it('no endorsement word reaches the panel through a string literal', () => {
    const files = readdirSync(PANEL).filter((f) => /\.(ts|html)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(PANEL, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      // SINGLE-LINE literals only. A greedy template match swallowed half the
      // file and reported the whole thing as one "literal", which is unreadable
      // in a failure and would eventually be muted for being unreadable.
      const literals = [...src.matchAll(/'([^'\\\n]{4,})'|"([^"\\\n]{4,})"|`([^`\\\n$]{4,})`/g)]
        .map((m) => m[1] ?? m[2] ?? m[3] ?? '');
      /**
       * TWO THINGS THIS MUST NOT CATCH, and both were caught on the first run.
       *
       * CODE IS NOT COPY. `L.postcode.value` is a property access that happened
       * to sit inside a template literal. A detector that reports it trains
       * people to skim its output, and a skimmed detector is a dead one.
       *
       * "END VALUE" IS A VALUATION TERM, not an endorsement. It is what the
       * property is worth after the work — the same noun the analyser prints.
       * The rule is that the panel may not BLESS; it may certainly say what a
       * house might be worth. Narrowly allowed, and only in that exact pairing.
       */
      const isCode = (s: string): boolean => /[.(){};=]|\|\||=>|\bconst\b/.test(s) && !/[a-z] [a-z]+ [a-z]/i.test(s);
      const allowed = (s: string, word: string): boolean => word === 'value' && /\bend value\b/i.test(s);
      for (const word of FORBIDDEN) {
        const rx = new RegExp(`\\b${word}\\b`, 'i');
        const hits = literals.filter((s) => rx.test(s) && /\s/.test(s) && !isCode(s) && !allowed(s, word));
        expect(hits, `${f} has "${word}" in a user-facing literal: ${JSON.stringify(hits.slice(0, 2))}`).toEqual([]);
      }
    }
  });
});

/**
 * X2 — AND THE SAME LAW ON THE PORTAL'S OWN PAGE.
 *
 * The chips are injected onto Rightmove and Zoopla, beside an agent's name. A
 * blessing there carries more apparent authority than one in our own panel,
 * because it looks like it belongs to the page — so the rule is not merely the
 * same, it matters more.
 *
 * This sweeps the FINDING copy and the chip renderer's own literals, with the
 * identical detector, so nothing can be endorsed by being injected instead of
 * panelled.
 */
describe('the injected chips never bless anything either', () => {
  const CHIPS = join(dirname(fileURLToPath(import.meta.url)), '../../../extension/src/chips.ts');
  const DEAL_PAGE = join(dirname(fileURLToPath(import.meta.url)), '../../../web/src/components/deals');

  it('the chip source is where this test thinks it is', () => {
    expect(existsSync(CHIPS), `no chips module at ${CHIPS}`).toBe(true);
    expect(existsSync(DEAL_PAGE), `no deal components at ${DEAL_PAGE}`).toBe(true);
  });

  it('no endorsement word is in the findings copy', async () => {
    const { FINDING_COPY, FINDINGS_COPY } = await import('../findings/copy');
    const said: string[] = [];
    for (const w of Object.values(FINDING_COPY)) said.push(w.label, w.why);
    for (const v of Object.values(FINDINGS_COPY)) if (typeof v === 'string') said.push(v);
    expect(said.length).toBeGreaterThan(20);
    for (const s of said) {
      for (const word of FORBIDDEN) {
        // "not an all clear" is the one place a forbidden word may appear, and
        // only as the thing being DENIED — which is the opposite of a blessing.
        if (/not an all clear/i.test(s)) continue;
        expect(new RegExp(`\\b${word}\\b`, 'i').test(s), `"${word}" in: ${s}`).toBe(false);
      }
    }
  });

  it('no endorsement word reaches the portal’s page through a chip literal', () => {
    for (const file of [CHIPS, ...readdirSync(DEAL_PAGE).filter((f) => /^Deal(Findings|Detail|Page)\.tsx$/.test(f)).map((f) => join(DEAL_PAGE, f))]) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      const literals = [...src.matchAll(/'([^'\\\n]{4,})'|"([^"\\\n]{4,})"|`([^`\\\n$]{4,})`/g)]
        .map((m) => m[1] ?? m[2] ?? m[3] ?? '');
      const isCode = (s: string): boolean => /[.(){};=]|\|\||=>|\bconst\b/.test(s) && !/[a-z] [a-z]+ [a-z]/i.test(s);
      for (const word of FORBIDDEN) {
        const rx = new RegExp(`\\b${word}\\b`, 'i');
        const hits = literals.filter((s) => rx.test(s) && /\s/.test(s) && !isCode(s));
        expect(hits, `${file} has "${word}" in a user-facing literal: ${JSON.stringify(hits.slice(0, 2))}`).toEqual([]);
      }
    }
  });

  /** And it must still bite: a blessing planted in the findings copy is caught. */
  it('the injected detector bites on a real endorsement', () => {
    const planted = ['Looks like good value here', 'A great buy for the area', 'A safe bet'];
    const isCode = (s: string): boolean => /[.(){};=]|\|\||=>|\bconst\b/.test(s) && !/[a-z] [a-z]+ [a-z]/i.test(s);
    for (const s of planted) {
      const caught = FORBIDDEN.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(s) && !isCode(s));
      expect(caught, `not caught: ${s}`).toBe(true);
    }
  });
});
