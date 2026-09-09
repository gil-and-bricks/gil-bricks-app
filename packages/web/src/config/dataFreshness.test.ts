import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dataFreshness } from '@gil-bricks/core';
import { DATA_FRESHNESS } from './freshness';
import { features } from './features';

/**
 * A stopped data refresh must never be silent (C3 follow-up).
 *
 * The monthly refresh broke on 2026-09-09 and the site went on printing a true
 * but FROZEN as-of month, indistinguishable from a fresh one, while nothing
 * anywhere told the operator the job had stopped. Two things fix that: the page
 * says when the data is old, and a failed run raises an assigned issue.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const footer = readFileSync(`${src}components/site/Footer.astro`, 'utf8');
const workflows = fileURLToPath(new URL('../../../../.github/workflows/', import.meta.url));

describe('the footer says when the data has stopped being refreshed', () => {
  it('the note is rendered, gated by its own flag', () => {
    expect(footer).toContain('features.staleDataNote');
    expect(footer).toContain('data-stale-note');
    expect(footer, 'the words come from config, never typed into the component')
      .toContain('{DATA_FRESHNESS.note}');
  });

  it('the AGE is judged in core, and the threshold comes from config', () => {
    expect(footer).toContain('dataFreshness(m.generatedAt, Date.now(), DATA_FRESHNESS.staleAfterDays)');
    // Presentation may format a figure and never compute one (charter rule 3).
    expect(footer, 'no day arithmetic in the component').not.toMatch(/86[_ ]?400[_ ]?000|\/\s*86400/);
    expect(footer, 'and no threshold typed in beside it').not.toMatch(/>=?\s*45\b/);
  });

  it('the as-of date still shows either way — the note is an addition, not a swap', () => {
    expect(footer).toContain("el.textContent = m.ppdMonth");
    const at = footer.indexOf('data-stale-note');
    const asOf = footer.indexOf('data-asof-line');
    expect(asOf, 'the date comes first, the note sits beside it').toBeLessThan(at);
  });

  it('the threshold is one missed cycle plus slack, not a hair trigger', () => {
    // The refresh runs on the 2nd of each month, so a healthy site is never
    // more than ~31 days old.
    expect(DATA_FRESHNESS.staleAfterDays).toBeGreaterThan(31);
    expect(DATA_FRESHNESS.staleAfterDays).toBeLessThan(90);
    const at = '2026-09-09T00:00:00.000Z';
    const day = (n: number) => Date.parse(at) + n * 86_400_000;
    expect(dataFreshness(at, day(31), DATA_FRESHNESS.staleAfterDays).stale, 'a slow month is not an alarm').toBe(false);
    expect(dataFreshness(at, day(60), DATA_FRESHNESS.staleAfterDays).stale, 'a missed cycle is').toBe(true);
  });

  it('the note obeys the copy rules', () => {
    const n = DATA_FRESHNESS.note;
    expect(n.split(/(?<=[.!?])\s/).length, 'at most two sentences').toBeLessThanOrEqual(2);
    expect(n.split(/\s+/).length, 'under 30 words').toBeLessThan(30);
    expect(n, 'plain English, no jargon').not.toMatch(/manifest|pipeline|cron|schema|stale/i);
  });

  it('ships ON by default, per the flags doc', () => {
    // NOT `features.staleDataNote === true`: the flags-off gate rewrites that
    // file in place, so such an assertion fails by design in the very run that
    // proves the product still works with everything off.
    const doc = readFileSync(fileURLToPath(new URL('../../../../docs/FEATURE_FLAGS.md', import.meta.url)), 'utf8');
    expect(doc).toMatch(/\|\s*`staleDataNote`\s*\|\s*on\s*\|/);
    expect(typeof features.staleDataNote, 'and the flag exists').toBe('boolean');
  });
});

describe('a scheduled job that fails must say so where it will be seen', () => {
  const files = readdirSync(workflows).filter((f) => f.endsWith('.yml'));

  it('every workflow that runs on a SCHEDULE raises an issue when it fails', () => {
    const scheduled = files.filter((f) => /^on:[\s\S]*?schedule:/m.test(readFileSync(workflows + f, 'utf8')));
    expect(scheduled.length, 'there are scheduled workflows to check').toBeGreaterThan(0);
    for (const f of scheduled) {
      const body = readFileSync(workflows + f, 'utf8');
      expect(body, `${f} has no failure notifier — a red tick in a tab nobody opens is not a warning`)
        .toMatch(/if:\s*failure\(\)/);
      expect(body, `${f} must be allowed to open the issue`).toMatch(/issues:\s*write/);
      expect(body, `${f} must ASSIGN it — GitHub emails an assignee`).toMatch(/assignees:/);
    }
  });

  it('the notifier does not open a fresh issue every month', () => {
    for (const f of files) {
      const body = readFileSync(workflows + f, 'utf8');
      if (!/if:\s*failure\(\)/.test(body)) continue;
      expect(body, `${f} must comment on an open issue rather than duplicate it`).toContain('createComment');
      expect(body).toContain("state: 'open'");
    }
  });

  it('no scheduled workflow is left without a timeout', () => {
    for (const f of files) {
      const body = readFileSync(workflows + f, 'utf8');
      if (!/schedule:/.test(body)) continue;
      expect(body, `${f} could hang for six hours`).toMatch(/timeout-minutes:/);
    }
  });
});
