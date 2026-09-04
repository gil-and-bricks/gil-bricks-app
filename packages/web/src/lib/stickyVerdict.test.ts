import { describe, expect, it } from 'vitest';
import { STICKY_VERDICT } from '../config/stickyVerdict';
import { announcement, barVisible, formatScore, isTextEntry, keyboardLikelyOpen, shouldUnstick, tierClass } from './stickyVerdict';

describe('sticky verdict — pure decisions (N1)', () => {
  it('tier classes come from the ONE core verdict source (same classes as chip + board)', () => {
    expect(tierClass(8)).toBe('ds-good');
    expect(tierClass(9.9)).toBe('ds-good');
    expect(tierClass(6)).toBe('ds-marginal');
    expect(tierClass(7.9)).toBe('ds-marginal');
    expect(tierClass(5.9)).toBe('ds-walk');
    expect(tierClass(0)).toBe('ds-walk');
  });

  it('prints the score exactly as the chip does (one decimal)', () => {
    expect(formatScore(7.94)).toBe('7.9');
    expect(formatScore(10)).toBe('10.0');
    expect(formatScore(0)).toBe('0.0');
  });

  it('announces the WHOLE verdict — score, tier and the line — never a bare number', () => {
    const a = announcement(7.9, '  Cashflows £120/mo after tax.  ');
    expect(a).toBe('Deal score 7.9 out of 10 — marginal. Cashflows £120/mo after tax.');
    expect(announcement(8.4, 'x')).toContain('good');
    expect(announcement(2, 'x')).toContain('walk away');
  });

  it('carries the lever sentence when there is one, and adds nothing when there is not (N2)', () => {
    expect(announcement(6.4, 'ROI is 5.9%, short of your 8%.', ' A £8,000 lower price would turn this Green. '))
      .toBe('Deal score 6.4 out of 10 — marginal. ROI is 5.9%, short of your 8%. A £8,000 lower price would turn this Green.');
    expect(announcement(6.4, 'ROI is 5.9%.', null)).toBe('Deal score 6.4 out of 10 — marginal. ROI is 5.9%.');
    expect(announcement(6.4, 'ROI is 5.9%.', '   ')).toBe('Deal score 6.4 out of 10 — marginal. ROI is 5.9%.');
  });

  it('hides for text-entry controls only (keyboard summoners), never selects/buttons', () => {
    expect(isTextEntry({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTextEntry({ tagName: 'input', type: 'text' })).toBe(true);
    expect(isTextEntry({ tagName: 'INPUT', type: '' })).toBe(true);
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true);
    expect(isTextEntry({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextEntry({ tagName: 'SELECT' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'radio' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntry({ tagName: 'BODY' })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry(undefined)).toBe(false);
  });

  it('un-sticks only when the bar would eat more than the configured viewport share', () => {
    const share = STICKY_VERDICT.maxViewportShare;
    expect(shouldUnstick(52, 844)).toBe(false);                 // a phone: ~6%
    expect(shouldUnstick(52, 52 / share + 1)).toBe(false);       // just under
    expect(shouldUnstick(52, 52 / share - 1)).toBe(true);        // just over
    expect(shouldUnstick(200, 300)).toBe(true);                  // high zoom
    expect(shouldUnstick(52, 0)).toBe(false);                    // unknown viewport → keep
    expect(shouldUnstick(0, 800)).toBe(false);
  });

  it('detects the on-screen keyboard from a shrunken visual viewport, not from noise', () => {
    const r = STICKY_VERDICT.keyboardViewportRatio;
    expect(keyboardLikelyOpen(844, 844)).toBe(false);
    expect(keyboardLikelyOpen(844 * r + 1, 844)).toBe(false);
    expect(keyboardLikelyOpen(844 * r - 1, 844)).toBe(true);
    expect(keyboardLikelyOpen(420, 844)).toBe(true);
    expect(keyboardLikelyOpen(undefined, 844)).toBe(false);    // no visualViewport API → don't guess
    expect(keyboardLikelyOpen(0, 844)).toBe(false);
    expect(keyboardLikelyOpen(400, 0)).toBe(false);
  });

  it('is visible only for a finite score, and steps aside for a text field or the keyboard', () => {
    expect(barVisible({ score: 7.9, textFocused: false, keyboardOpen: false })).toBe(true);
    expect(barVisible({ score: 7.9, textFocused: true, keyboardOpen: false })).toBe(false);
    expect(barVisible({ score: 7.9, textFocused: false, keyboardOpen: true })).toBe(false);
    expect(barVisible({ score: null, textFocused: false, keyboardOpen: false })).toBe(false);
    expect(barVisible({ score: Number.NaN, textFocused: false, keyboardOpen: false })).toBe(false);
  });

  it('tunables are sane (a mis-edit fails here, not on a phone)', () => {
    expect(STICKY_VERDICT.maxViewportShare).toBeGreaterThan(0.1);
    expect(STICKY_VERDICT.maxViewportShare).toBeLessThanOrEqual(0.5);
    expect(STICKY_VERDICT.keyboardViewportRatio).toBeGreaterThan(0.5);
    expect(STICKY_VERDICT.keyboardViewportRatio).toBeLessThan(1);
    expect(STICKY_VERDICT.tintMs).toBeGreaterThan(0);
    expect(STICKY_VERDICT.tintMs).toBeLessThanOrEqual(400);   // "brief" — never a pulse
    expect(STICKY_VERDICT.announceDelayMs).toBeGreaterThanOrEqual(250);
  });
});
