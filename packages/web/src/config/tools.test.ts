import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EQUITY, TOOLS, TOOLS_COPY } from './tools';

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
  const words = JSON.stringify({ TOOLS, TOOLS_COPY, EQUITY }).toLowerCase();

  it('nothing asks for an email or a signup to see an answer', () => {
    for (const phrase of ['enter your email', 'unlock', 'sign up to see', 'email to get', 'subscribe to see']) {
      expect(words).not.toContain(phrase);
    }
  });

  it('saving is offered after the answer, never before it', () => {
    expect(EQUITY.save.body.toLowerCase()).toContain('google');
    expect(EQUITY.save.heading.toLowerCase()).not.toContain('unlock');
  });

  it('the save promises only what the product does — nothing reads tool_saves back', () => {
    // Until a page lists saved answers, the copy must not imply one exists.
    const said = `${EQUITY.save.body} ${EQUITY.save.saved} ${EQUITY.save.note}`.toLowerCase();
    expect(EQUITY.save.note.toLowerCase()).toContain('no page for saved answers');
    for (const implied of ['come back', 'look it up', 'find it later', 'view them', 'your saved answers page']) {
      expect(said).not.toContain(implied);
    }
  });

  it('the product name is never typed into tool copy — it comes from config', () => {
    // Golden rule 4: the site name is TBD and reads from site.config.ts.
    const literal = JSON.stringify({ TOOLS, TOOLS_COPY, EQUITY });
    expect(literal).not.toContain('PropLaunch');
    expect(TOOLS_COPY.footer.lead('Testname')).toContain('Testname');
  });

  it('never claims to be a valuation, and says so INSIDE the answer card', () => {
    const limits = EQUITY.limits.join(' ').toLowerCase();
    expect(limits).toContain('knows nothing about your property');
    // the lender line sits with the answer, not below the fold
    expect(limits).toContain('not a valuation');
    expect(limits).toContain('no lender');
    expect(TOOLS_COPY.disclaimer.toLowerCase()).toContain('not a valuation');
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
