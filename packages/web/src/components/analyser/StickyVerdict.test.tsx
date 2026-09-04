// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { features } from '../../config/features';
import { STICKY_VERDICT } from '../../config/stickyVerdict';
import { verdictSnapshot } from './verdictSnapshot';
import { StickyVerdict } from './StickyVerdict';

/**
 * The sticky bar as the browser sees it (N1). Renders the real island against
 * happy-dom and drives it the way a phone would: a verdict arrives, the rent
 * field takes focus, the score moves, the flag is turned off.
 */
const snap = (score: number | null, headline = 'Cashflows £120/mo after tax; ROI clears your 8%.', lever: string | null = null) =>
  ({ score, headline, criteriaJson: '{}', lever, boardFigure: '£120/mo' });

/** Every change runs inside Preact's act(): re-renders AND effects flush synchronously. */
const set = (v: ReturnType<typeof snap> | null) => act(() => { verdictSnapshot.value = v; });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const mount = () => act(() => { render(h(StickyVerdict, null), host); });

let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  features.stickyVerdict = true;
  features.dealScore = true;
  verdictSnapshot.value = null;
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
  vi.useRealTimers();
  features.stickyVerdict = true;
  features.dealScore = true;
  verdictSnapshot.value = null;
});

const bar = () => host.querySelector<HTMLElement>('.sticky-verdict');
const live = () => host.querySelector<HTMLElement>('[aria-live="polite"]');

describe('StickyVerdict island', () => {
  it('renders nothing but the (empty) live region until a score exists', () => {
    mount();
    expect(bar()).toBeNull();
    expect(live()?.getAttribute('aria-atomic')).toBe('true');
    expect(live()?.textContent).toBe('');
  });

  it('shows the score, tier colour class and one-line headline once the verdict arrives', () => {
    mount();
    set(snap(7.94));
    const el = bar()!;
    expect(el).not.toBeNull();
    expect(el.classList.contains('ds-marginal')).toBe(true);
    expect(el.getAttribute('role')).toBe('region');
    expect(el.getAttribute('aria-label')).toBe(STICKY_VERDICT.copy.region);
    expect(el.querySelector('.sv-chip strong')!.textContent).toBe('7.9');
    expect(el.querySelector('.sv-headline')!.textContent).toBe(snap(1).headline);
    // collapsed by default, panel hidden
    const btn = el.querySelector<HTMLButtonElement>('.sv-main')!;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector<HTMLElement>('#sv-panel')!.hidden).toBe(true);
    // the page's scroll-padding hook is published
    expect(document.documentElement.style.getPropertyValue('--sticky-h')).toMatch(/px$/);
  });

  it('announces the WHOLE verdict once, after the change settles (debounced), never a bare number', () => {
    mount();
    set(snap(7.94));
    expect(live()!.textContent).toBe('');                       // not yet — still settling
    set(snap(8.2));                                              // a second keystroke inside the window
    advance(STICKY_VERDICT.announceDelayMs - 1);
    expect(live()!.textContent).toBe('');
    advance(2);
    expect(live()!.textContent).toBe('Deal score 8.2 out of 10 — good. Cashflows £120/mo after tax; ROI clears your 8%.');
  });

  it('tints the chip once for tintMs when the score MOVES — not on arrival — then stops', () => {
    mount();
    set(snap(7.94));
    expect(bar()!.querySelector('.sv-chip')!.classList.contains('is-changed')).toBe(false);
    set(snap(6.1));
    expect(bar()!.querySelector('.sv-chip')!.classList.contains('is-changed')).toBe(true);
    expect(bar()!.classList.contains('ds-marginal')).toBe(true);
    advance(STICKY_VERDICT.tintMs + 1);
    expect(bar()!.querySelector('.sv-chip')!.classList.contains('is-changed')).toBe(false);
    // same score republished (criteria changed) → no tint
    set({ ...snap(6.1), criteriaJson: '{"x":1}' });
    expect(bar()!.querySelector('.sv-chip')!.classList.contains('is-changed')).toBe(false);
  });

  it('steps aside while a text field has focus and returns on blur; a select never hides it', () => {
    mount();
    set(snap(8.5));
    const rent = document.createElement('input');
    rent.type = 'number';
    const deposit = document.createElement('select');
    document.body.append(rent, deposit);
    act(() => rent.focus());
    expect(bar()!.classList.contains('is-hidden')).toBe(true);
    expect(bar()).not.toBeNull();                               // still in the DOM — its space stays
    act(() => rent.blur());
    expect(bar()!.classList.contains('is-hidden')).toBe(false);
    act(() => deposit.focus());
    expect(bar()!.classList.contains('is-hidden')).toBe(false);
    deposit.blur();
    rent.remove();
    deposit.remove();
  });

  it('expands to the full line with a jump link, and Escape collapses it back to the toggle', () => {
    mount();
    set(snap(8.5));
    const btn = bar()!.querySelector<HTMLButtonElement>('.sv-main')!;
    act(() => btn.click());
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const panel = bar()!.querySelector<HTMLElement>('#sv-panel')!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('.sv-full')!.textContent).toBe(snap(1).headline);
    const jump = panel.querySelector<HTMLAnchorElement>('a.sv-jump')!;
    expect(jump.getAttribute('href')).toBe('#verdict-h');
    expect(jump.textContent).toBe(STICKY_VERDICT.copy.jump);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('announces the lever line too, when the analyser found one (N2)', () => {
    mount();
    set(snap(6.4, 'ROI is 5.9%, short of your 8%.', 'A £8,000 lower price or £45 more rent would turn this Green.'));
    advance(STICKY_VERDICT.announceDelayMs);
    expect(live()?.textContent).toBe(
      'Deal score 6.4 out of 10 — marginal. ROI is 5.9%, short of your 8%. A £8,000 lower price or £45 more rent would turn this Green.',
    );
    // the lever moving is itself a change worth hearing
    set(snap(6.4, 'ROI is 5.9%, short of your 8%.', 'A £6,000 lower price would turn this Green.'));
    advance(STICKY_VERDICT.announceDelayMs);
    expect(live()?.textContent).toContain('A £6,000 lower price would turn this Green.');
  });

  it('hydrating while a field already has focus starts hidden (the island mounts late)', () => {
    const rent = document.createElement('input');
    rent.type = 'number';
    document.body.appendChild(rent);
    rent.focus();
    mount();
    set(snap(7.2));
    expect(bar()!.classList.contains('is-hidden')).toBe(true);
    act(() => { rent.blur(); });
    expect(bar()!.classList.contains('is-hidden')).toBe(false);
    rent.remove();
  });

  it('Escape pressed on a form control closes the panel but never steals focus', () => {
    mount();
    set(snap(8.5));
    const btn = bar()!.querySelector<HTMLButtonElement>('.sv-main')!;
    act(() => btn.click());
    const rent = document.createElement('input');
    rent.type = 'number';
    document.body.appendChild(rent);
    rent.focus();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    // focus stays where the user was — Escape on a field dismisses its own tooltip
    expect(document.activeElement).toBe(rent);
    rent.remove();
  });

  it('closes the panel when focus leaves the bar, so it cannot cover the next control', () => {
    mount();
    set(snap(8.5));
    const btn = bar()!.querySelector<HTMLButtonElement>('.sv-main')!;
    act(() => btn.click());
    const panel = bar()!.querySelector<HTMLElement>('#sv-panel')!;
    expect(panel.hidden).toBe(false);
    const next = document.createElement('select');
    document.body.appendChild(next);
    act(() => { btn.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: next })); });
    expect(panel.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    next.remove();
  });

  it('leaves the page (and clears scroll-padding) when the verdict goes away', () => {
    mount();
    set(snap(8.5));
    expect(bar()).not.toBeNull();
    set(null);
    expect(bar()).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--sticky-h')).toBe('0px');
  });

  it('flag OFF: renders nothing at all (no bar, no live region) — the card is the live region again', () => {
    features.stickyVerdict = false;
    mount();
    set(snap(8.5));
    expect(host.innerHTML).toBe('');
  });

  it('dealScore OFF: renders nothing even with stickyVerdict on (no score to show)', () => {
    features.dealScore = false;
    mount();
    set(snap(8.5));
    expect(host.innerHTML).toBe('');
  });
});
