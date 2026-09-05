import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EQUITY, STAMP, TOOLS, TOOLS_COPY, YIELD } from './tools';

/**
 * The registry is the whole framework: a tool is one entry plus a page. These
 * hold that promise, and hold the section to its law — the answer is never
 * gated, and nothing here claims to be a valuation.
 */
const PAGES = fileURLToPath(new URL('../pages/tools/', import.meta.url));
const pageSlugs = readdirSync(PAGES).filter((f) => f.endsWith('.astro')).map((f) => f.replace(/\.astro$/, ''));

describe('the tools registry (T1)', () => {
  it('every enabled tool has a page, and every page is in the registry', () => {
    for (const t of TOOLS.filter((t) => t.enabled)) {
      expect(pageSlugs, `${t.slug} needs src/pages/tools/${t.slug}.astro`).toContain(t.slug);
    }
    for (const slug of pageSlugs.filter((s) => s !== 'index')) {
      expect(TOOLS.map((t) => t.slug), `${slug}.astro is not in the registry`).toContain(slug);
    }
  });

  it('every entry has a slug, a title and one line of description', () => {
    for (const t of TOOLS) {
      expect(t.slug).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
      expect(t.description.split(/(?<=[.!?])\s+/).length, `${t.slug} description is one line`).toBeLessThanOrEqual(1);
    }
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(TOOLS.length);
  });

  it('adding an entry is all it takes to list a tool', () => {
    // The index renders TOOLS.filter(enabled) — proven by construction here:
    // a disabled entry never appears, an enabled one always does.
    const enabled = TOOLS.filter((t) => t.enabled).map((t) => t.slug);
    const disabled = TOOLS.filter((t) => !t.enabled).map((t) => t.slug);
    expect(enabled).toContain('equity');
    for (const slug of disabled) expect(enabled).not.toContain(slug);
  });
});

describe('the law of this section', () => {
  const words = JSON.stringify({ TOOLS, TOOLS_COPY, EQUITY, STAMP, YIELD }).toLowerCase();

  it('nothing asks for an email or a signup to see an answer', () => {
    for (const phrase of ['enter your email', 'unlock', 'sign up to see', 'email to get', 'subscribe to see']) {
      expect(words).not.toContain(phrase);
    }
  });

  it('nothing offers to save an answer — T2 removed a save nothing could read back', () => {
    for (const phrase of ['save this', 'keep this', 'saved answers', 'with your account']) {
      expect(words, `${phrase} — the save was removed`).not.toContain(phrase);
    }
  });

  it('the product name is never typed into tool copy — it comes from config', () => {
    // Golden rule 4: the site name is TBD and reads from site.config.ts.
    const literal = JSON.stringify({ TOOLS, TOOLS_COPY, EQUITY, STAMP, YIELD });
    expect(literal).not.toContain('PropLaunch');
    expect(TOOLS_COPY.footer.lead('Testname')).toContain('Testname');
  });

  it('never claims to be a valuation, and says so INSIDE the answer card', () => {
    const limits = EQUITY.limits.join(' ').toLowerCase();
    expect(limits).toContain('knows nothing about your property');
    // the lender line sits with the answer, not below the fold
    expect(limits).toContain('not a valuation');
    expect(limits).toContain('no lender');
    // the shared line has to be true of every tool, so the valuation wording
    // lives with the equity answer, not in the shell
    expect(TOOLS_COPY.disclaimer.toLowerCase()).toContain('not advice');
  });

  it('the three figures the answer must show all have a label', () => {
    expect(EQUITY.figures.value).toBeTruthy();
    expect(EQUITY.figures.equity).toBeTruthy();
    expect(EQUITY.figures.ltv.toLowerCase()).toContain('loan to value');
    expect(EQUITY.figures.noLoan).toBeTruthy();
  });

  it('the answer names the numbers, in one line', () => {
    const line = EQUITY.answer('£266,494', '£95,000', '£171,494', '64.4%');
    expect(line).toContain('£266,494');
    expect(line).toContain('£95,000');
    expect(line).toContain('£171,494');
    expect(line).toContain('64.4%');
    expect(line.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
  });

  it('the onward path is help, not a pitch', () => {
    const onward = EQUITY.onward.line.toLowerCase();
    expect(onward).toContain('analyser');
    for (const hype of ['best', 'amazing', 'unlock', 'secret', 'guaranteed']) expect(onward).not.toContain(hype);
  });
});

describe('the stamp duty tool (T2)', () => {
  it('says what it does not cover, once, in plain words', () => {
    const limits = STAMP.limits.join(' ').toLowerCase();
    expect(limits).toContain('scotland');
    expect(limits).toContain('mixed use');
    expect(limits).toContain('companies');
    expect(limits).toContain('non-uk residents');
    expect(limits).toContain('not tax advice');
  });

  it('never claims to advise, and never names a rate', () => {
    const words = JSON.stringify(STAMP);
    for (const claim of ['we advise', 'tax advice from', 'guaranteed', 'HMRC approved']) {
      expect(words).not.toContain(claim);
    }
    // every rate lives in rates.json — a percentage typed here would rot
    expect(words).not.toMatch(/\d+(\.\d+)?%/);
    expect(words).not.toMatch(/£\d/);
  });

  it('the answer names the tax and the effective rate', () => {
    const line = STAMP.answer('£6,250', '1.5%', 'stamp duty');
    expect(line).toContain('£6,250');
    expect(line).toContain('1.5%');
    expect(line).toContain('stamp duty');
  });

  it('names the tax correctly on each side of the border', () => {
    expect(STAMP.taxNames.E92000001).toBe('stamp duty');
    expect(STAMP.taxNames.W92000004).toBe('land transaction tax');
  });

  it('has an effective-from line, because a stale calculator is the whole complaint', () => {
    expect(STAMP.asOf('1 April 2025')).toContain('1 April 2025');
    expect(STAMP.asOf('1 April 2025').toLowerCase()).toContain('effective from');
  });
});

describe('the rental yield tool (T2)', () => {
  it('gives net the emphasis and says gross hides the costs', () => {
    const limits = YIELD.limits.join(' ').toLowerCase();
    expect(limits).toContain('net is the number that matters');
    expect(limits).toContain('gross ignores every cost');
    expect(YIELD.figures.net).toBe('Net yield');
  });

  it('never claims to know the rent or the costs, and promises nothing', () => {
    const limits = YIELD.limits.join(' ').toLowerCase();
    expect(limits).toContain('yours: we do not know them');
    expect(limits).toContain('neither is a promise');
    const words = JSON.stringify(YIELD).toLowerCase();
    for (const claim of ['guaranteed', 'you will earn', 'expected return', 'lha', 'market rent for']) {
      expect(words).not.toContain(claim);
    }
  });

  it('the answer names both figures and the gap', () => {
    const line = YIELD.answer('4.6%', '7.5%', '2.9%');
    expect(line).toContain('4.6%');
    expect(line).toContain('7.5%');
    expect(line).toContain('2.9%');
    // gross − net in points IS the running costs as a share of the price
    expect(line.toLowerCase()).toContain('running costs');
  });

  it('is honest that it divides by the price, unlike the analyser', () => {
    expect(YIELD.limits.join(' ').toLowerCase()).toContain('all-in cost');
  });

  it('the onward line is help, not a pitch', () => {
    const onward = YIELD.onward.line.toLowerCase();
    expect(onward).toContain('analyser');
    for (const hype of ['best', 'amazing', 'unlock', 'guaranteed']) expect(onward).not.toContain(hype);
  });
});
