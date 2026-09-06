// @vitest-environment happy-dom
/**
 * THE OPTIONS PAGE (P10 review). The side panel only opens on Rightmove or
 * Zoopla, so the panel alone would have meant hunting for a listing before you
 * could switch a daily notification off. This is the page Chrome itself offers.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ATTENTION_COPY } from '../src/attention';

// cwd is the package root under vitest; happy-dom has no file: URL to resolve
// against, which is why this is not an import.meta.url path.
const SRC = readFileSync('entrypoints/options/main.ts', 'utf8');

describe('the extension’s own settings page', () => {
  it('carries the switch, and reads its words from the ONE copy source', () => {
    expect(SRC).toContain('ATTENTION_COPY.settings');
    expect(SRC).toContain('ATTENTION_COPY.reach');
    // no copy is typed into the page itself
    expect(SRC).not.toContain('Daily reminders');
    expect(SRC).not.toContain('while Chrome is open');
  });

  it('binds a real label and a description to a real checkbox', () => {
    expect(SRC).toContain("label.setAttribute('for', 'reminders')");
    expect(SRC).toContain("box.type = 'checkbox'");
    expect(SRC).toContain("box.setAttribute('aria-describedby', note.id)");
    expect(SRC).toContain("said.setAttribute('role', 'status')");
  });

  it('writes through the same store the background reads, so OFF is heard at once', () => {
    expect(SRC).toContain('setReminders(box.checked)');
    expect(SRC).toContain("from '../../src/store'");
  });

  it('says something back, both ways', () => {
    expect(ATTENTION_COPY.on).not.toBe(ATTENTION_COPY.off);
    for (const line of [ATTENTION_COPY.on, ATTENTION_COPY.off, ATTENTION_COPY.reach]) {
      expect(line.split(/(?<=[.!?])\s+/).filter((x) => /[A-Za-z]/.test(x)).length, line).toBeLessThanOrEqual(2);
    }
  });
});
