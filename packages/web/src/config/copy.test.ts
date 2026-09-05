/**
 * THE COPY LENGTH GATE (N5) — the rules in CLAUDE.md, enforced. Re-runnable:
 * `npx vitest run src/config/copy.test.ts`.
 *
 * Visible explanatory copy: at most 30 words and 2 sentences, and no sentence
 * over 20 words. Tooltips: at most 20 words (they are already the short home).
 * Two things are exempt BY NAME, with a reason each: text inside a collapsed
 * accordion (the show-the-maths home longer explanation is supposed to move
 * INTO), and licence attributions we must print verbatim. Two files carry them;
 * every other file is held to the rule.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { strategies } from '@gil-bricks/core';
import { microcopy } from '../content/microcopy';
import { COPY } from './copy';
import { BRIDGING } from './bridging';
import { NAV } from './nav';
import { EQUITY, STAMP, TOOLS, TOOLS_COPY, YIELD } from './tools';
import { inlineCopy, inlineCopyAstro } from './reversibility.test';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const rel = (p: string): string => relative(SRC, p).split('\\').join('/');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

export const MAX_WORDS = 30;
export const MAX_SENTENCES = 2;
export const MAX_WORDS_PER_SENTENCE = 20;
export const MAX_TOOLTIP_WORDS = 20;

export const wordCount = (s: string): number => (s.trim().match(/[A-Za-z0-9£%.,'’·—-]+/g) ?? []).length;
export const sentencesOf = (s: string): string[] =>
  s.trim().split(/(?<=[.!?])\s+/).filter((x) => /[A-Za-z]/.test(x));

/** Every string the config hands to a screen, flattened with its key path. */
function flatten(node: unknown, path: string, out: { key: string; text: string }[] = []): { key: string; text: string }[] {
  if (typeof node === 'string') {
    if (/[A-Za-z]{2,}/.test(node)) out.push({ key: path, text: node });
  } else if (Array.isArray(node)) {
    node.forEach((n, i) => flatten(n, `${path}[${i}]`, out));
  } else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) flatten(v, path === '' ? k : `${path}.${k}`, out);
  }
  return out;
}

/**
 * The only long visible blocks allowed, each with the reason it is allowed.
 * A new entry here is a decision, not a default: prefer moving the words.
 */
const EXEMPT: Record<string, string> = {
  'components/analyser/HmoVerdict.tsx': 'inside collapsed accordions: statutory room sizes and the planning rules, quoted precisely',
  'components/site/Footer.astro': 'licence attributions we must print verbatim (OGL v3, ONSPD, IMD)',
};

describe('COPY RULES (N5) — nothing visible runs long', () => {
  it('every string in the copy config is short enough to read at a glance', () => {
    const long = flatten(COPY, '')
      .filter((s) => wordCount(s.text) > MAX_WORDS || sentencesOf(s.text).length > MAX_SENTENCES)
      .map((s) => `${s.key}: ${wordCount(s.text)} words, ${sentencesOf(s.text).length} sentences`);
    expect(long, 'move the extra words to a tooltip or the show-the-maths accordion').toEqual([]);
  });

  it('no sentence anywhere in the copy config runs over 20 words', () => {
    const long = flatten(COPY, '')
      .flatMap((s) => sentencesOf(s.text).map((sentence) => ({ key: s.key, sentence })))
      .filter((s) => wordCount(s.sentence) > MAX_WORDS_PER_SENTENCE)
      .map((s) => `${s.key}: ${wordCount(s.sentence)} words`);
    expect(long, 'one idea per sentence — split it').toEqual([]);
  });

  it('the nav obeys the same rules', () => {
    const strings = flatten(NAV, 'NAV');
    const long = strings
      .filter((s) => wordCount(s.text) > MAX_WORDS || sentencesOf(s.text).length > MAX_SENTENCES)
      .map((s) => `${s.key}: ${wordCount(s.text)} words`);
    expect(long).toEqual([]);
  });

  it('the tools section obeys the same rules, sentences the tool builds included', () => {
    // The answer is a function, so flatten cannot see it: render it with real
    // figures, which is the sentence someone actually reads.
    const built = [
      { key: 'EQUITY.answer', text: EQUITY.answer('£266,494', '£95,000', '£171,494', '64.4%') },
      { key: 'EQUITY.negative', text: EQUITY.negative('£12,000') },
      { key: 'EQUITY.outright', text: EQUITY.outright('£266,494') },
      { key: 'EQUITY.asOf', text: EQUITY.asOf('2026-06', 'England') },
      { key: 'EQUITY.form.monthHint', text: EQUITY.form.monthHint('2026-06') },
      { key: 'TOOLS_COPY.footer.lead', text: TOOLS_COPY.footer.lead('PropLaunch') },
      { key: 'STAMP.answer', text: STAMP.answer('£6,250', '1.5%', 'stamp duty') },
      { key: 'STAMP.none', text: STAMP.none('stamp duty') },
      { key: 'STAMP.asOf', text: STAMP.asOf('1 April 2025') },
      { key: 'STAMP.source', text: STAMP.source('https://www.gov.uk/stamp-duty-land-tax/residential-property-rates') },
      { key: 'STAMP.bandLabel', text: STAMP.bandLabel('£125,000', '£250,000') },
      { key: 'YIELD.answer', text: YIELD.answer('4.6%', '7.5%', '2.9%') },
      { key: 'YIELD.negative', text: YIELD.negative('7.5%') },
    ];
    const strings = [
      ...flatten(TOOLS, 'TOOLS'), ...flatten(TOOLS_COPY, 'TOOLS_COPY'), ...flatten(EQUITY, 'EQUITY'),
      ...flatten(STAMP, 'STAMP'), ...flatten(YIELD, 'YIELD'), ...built,
    ];
    const long = strings
      .filter((s) => wordCount(s.text) > MAX_WORDS || sentencesOf(s.text).length > MAX_SENTENCES)
      .map((s) => `${s.key}: ${wordCount(s.text)} words, ${sentencesOf(s.text).length} sentences`);
    expect(long).toEqual([]);
    const longSentence = strings
      .flatMap((s) => sentencesOf(s.text).map((sentence) => ({ key: s.key, sentence })))
      .filter((s) => wordCount(s.sentence) > MAX_WORDS_PER_SENTENCE)
      .map((s) => `${s.key}: ${wordCount(s.sentence)} words`);
    expect(longSentence).toEqual([]);
  });

  it('the bridging page obeys the same rules — it is the wordiest thing we ship', () => {
    const strings = flatten(BRIDGING, 'BRIDGING');
    const long = strings
      .filter((s) => wordCount(s.text) > MAX_WORDS || sentencesOf(s.text).length > MAX_SENTENCES)
      .map((s) => `${s.key}: ${wordCount(s.text)} words, ${sentencesOf(s.text).length} sentences`);
    expect(long).toEqual([]);
    const longSentence = strings
      .flatMap((s) => sentencesOf(s.text).map((sentence) => ({ key: s.key, sentence })))
      .filter((s) => wordCount(s.sentence) > MAX_WORDS_PER_SENTENCE)
      .map((s) => `${s.key}: ${wordCount(s.sentence)} words`);
    expect(longSentence).toEqual([]);
  });

  it('tooltips stay at 20 words — they are already the short home', () => {
    const long = Object.entries(microcopy)
      .filter(([, text]) => wordCount(text) > MAX_TOOLTIP_WORDS)
      .map(([key, text]) => `${key}: ${wordCount(text)} words`);
    expect(long).toEqual([]);
  });

  it('strategy field tooltips stay at 20 words too', () => {
    const long = strategies
      .flatMap((s) => [...s.strategyInputs, ...s.assumptions].map((f) => ({ id: s.id, key: f.key, tip: f.tip ?? '' })))
      .filter((f) => wordCount(f.tip) > MAX_TOOLTIP_WORDS)
      .map((f) => `${f.id}.${f.key}: ${wordCount(f.tip)} words`);
    expect(long).toEqual([]);
  });

  it('a field carries no description of its own — the label and its unit say it', () => {
    // whyDefault used to print a sentence under every assumption; N5 removed it.
    const withDescription = strategies.flatMap((s) =>
      [...s.strategyInputs, ...s.assumptions]
        .filter((f) => 'whyDefault' in f || 'description' in f)
        .map((f) => `${s.id}.${f.key}`),
    );
    expect(withDescription).toEqual([]);
  });

  it('no component prints a visible block over 30 words (exemptions are named, with reasons)', () => {
    const offenders: string[] = [];
    for (const p of walk(SRC)) {
      const r = rel(p);
      if (/\.test\./.test(p)) continue;
      if (!/^(components|layouts)\//.test(r)) continue;
      if (EXEMPT[r] !== undefined) continue;
      const found = /\.astro$/.test(p)
        ? inlineCopyAstro(readFileSync(p, 'utf8'))
        : /\.(ts|tsx)$/.test(p) ? inlineCopy(readFileSync(p, 'utf8'), r) : [];
      for (const text of found) {
        if (wordCount(text) > MAX_WORDS) offenders.push(`${r}: ${wordCount(text)} words — ${text.slice(0, 60)}…`);
      }
    }
    expect(offenders, 'shorten it, or move it into a tooltip or a collapsed accordion').toEqual([]);
  });

  it('every exemption names a real file (a stale one would hide a regression)', () => {
    for (const file of Object.keys(EXEMPT)) {
      expect(() => readFileSync(join(SRC, file), 'utf8'), file).not.toThrow();
      expect(EXEMPT[file].length, file).toBeGreaterThan(20);
    }
  });
});
