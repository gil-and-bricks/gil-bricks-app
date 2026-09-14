/**
 * DP4 — THE TINTED INK IS STILL INK.
 *
 * The cover band and the inverted returns page are now `22% accent` mixed into
 * near-black, so the sourcer's colour reaches the two biggest surfaces in the
 * document instead of a few hairlines. That is only safe if the result stays
 * dark enough for white type NO MATTER what colour is mixed in — including a
 * colour the preset palette would never offer, because the custom picker lets
 * anybody type one.
 *
 * So this does not test the palette. It tests the WORST CASE: pure white, pure
 * yellow, pure cyan — the lightest things anybody could choose — and asserts
 * the mix still clears AA for body text. If a future change raises the 22%, or
 * lightens `--pk-ink-base`, this is what fails.
 */
import { describe, expect, it } from 'vitest';
import { ACCENT_PALETTE } from '../../config/pack';
import { contrast } from './accent';

/** The same mix the stylesheet performs: `color-mix(in srgb, accent P%, base)`. */
function mixSrgb(accent: string, base: string, pct: number): string {
  const a = Number.parseInt(accent.replace('#', ''), 16);
  const b = Number.parseInt(base.replace('#', ''), 16);
  const ch = (shift: number): number => Math.round(
    (((a >> shift) & 255) * pct + ((b >> shift) & 255) * (1 - pct)),
  );
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

const INK_BASE = '#10131a';
const SOFT_BASE = '#12151b';
const INK_PCT = 0.18;
const ON_INK = '#f7f6f3';        // --pk-text-on-ink
const ON_INK_QUIET = '#a7adb8';  // --pk-text-on-ink-quiet

describe('the accent-tinted ink stays readable', () => {
  it('clears AA for body text with every preset mixed in', () => {
    for (const c of ACCENT_PALETTE) {
      const ink = mixSrgb(c.hex, INK_BASE, INK_PCT);
      expect(contrast(ON_INK, ink), `${c.name} → ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears AA for the QUIET text too — the label under every figure', () => {
    for (const c of ACCENT_PALETTE) {
      const ink = mixSrgb(c.hex, INK_BASE, INK_PCT);
      expect(contrast(ON_INK_QUIET, ink), `${c.name} → ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('survives the WORST colour anybody could type into the custom picker', () => {
    // Not palette colours. The lightest, most saturated things that exist —
    // this is the guarantee that the ink, not the sourcer's taste, carries the
    // contrast.
    for (const hostile of ['#ffffff', '#ffff00', '#00ffff', '#ff00ff', '#f0f0f0']) {
      const ink = mixSrgb(hostile, INK_BASE, INK_PCT);
      expect(contrast(ON_INK, ink), `${hostile} → ${ink}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ON_INK_QUIET, ink), `${hostile} quiet → ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('also holds for the SOFT ink, which the plain cover gradient uses', () => {
    for (const hostile of ['#ffffff', '#ffff00', '#00ffff']) {
      const soft = mixSrgb(hostile, SOFT_BASE, INK_PCT);
      expect(contrast(ON_INK, soft), `soft ${hostile} → ${soft}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ON_INK_QUIET, soft), `soft quiet ${hostile} → ${soft}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('18% IS THE CEILING — 20% already fails, which is why it is not 20%', () => {
    /**
     * A positive control, and the record of where the number came from. The
     * first attempt at this was 22% by eye; pure white at 22% puts the quiet
     * label at 4.12:1. Anyone raising the tint to get more colour will land
     * here and see the cost.
     */
    const at20 = mixSrgb('#ffffff', INK_BASE, 0.20);
    expect(contrast(ON_INK_QUIET, at20)).toBeLessThan(4.5);
    const at18 = mixSrgb('#ffffff', INK_BASE, 0.18);
    expect(contrast(ON_INK_QUIET, at18)).toBeGreaterThanOrEqual(4.5);
  });
});
