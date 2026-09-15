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

  it('never claims a thing is ABSENT — only that it was not found', () => {
    // "No red flags FOUND" is honest. "No red flags" is a claim about a
    // property nobody has visited.
    expect(TRIAGE_COPY.flags.nothing).toMatch(/found/i);
    expect(TRIAGE_COPY.flags.nothingWhy).toMatch(/not an all clear/i);
    for (const s of ALL) {
      expect(s, `"${s}" asserts freehold`).not.toMatch(/\bis freehold\b|\bno flood\b|\bnot listed\b/i);
    }
  });

  it('every text-derived flag is worded as READ, not as established', () => {
    for (const k of ['leasehold', 'auction', 'tenantInSitu', 'cashBuyers',
      'nonStandardConstruction', 'commercialBelow'] as const) {
      expect(TRIAGE_COPY.flags[k], k).toMatch(/^The listing (says|mentions)/);
    }
    expect(TRIAGE_COPY.flags.verify).toMatch(/verify/i);
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
