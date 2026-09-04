/**
 * The sticky verdict bar (N1) — ONE island on the shared analyser template
 * (pages/[strategy]/analyser.astro → layouts/AppShell.astro "sticky" slot), so
 * all four strategies inherit it. It only PRESENTS the verdict snapshot the
 * mounted verdict island publishes (verdictSnapshot) — it computes nothing.
 * Every decision is a pure helper in lib/stickyVerdict.ts (tested); every word
 * and tunable is in config/stickyVerdict.ts; the switch is features.stickyVerdict.
 *
 * Layout contract: the bar lives IN the page flow (sticky, not fixed) so the
 * header scrolls away naturally and the bar takes the top. Two things keep the
 * user's scroll position from ever moving under them:
 *  - hiding (text field focused / keyboard up) uses visibility, never display —
 *    the bar's space stays, nothing reflows;
 *  - when the bar first appears (or goes) while its slot is above the viewport,
 *    the page is scrolled by exactly the bar's height to cancel the shift.
 * The expanded panel is absolutely positioned so opening it never reflows either.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { verdictSnapshot } from './verdictSnapshot';
import { stickyVerdictActive } from '../../config/features';
import { STICKY_VERDICT } from '../../config/stickyVerdict';
import {
  announcement, barVisible, formatScore, isTextEntry, keyboardLikelyOpen, shouldUnstick, tierClass, type FocusTarget,
} from '../../lib/stickyVerdict';

/** The CSS custom property the page's scroll-padding-top reads (WCAG 2.4.11). */
const HEIGHT_VAR = STICKY_VERDICT.heightVar;

export function StickyVerdict() {
  // Flag off (or no Deal Score to show): render nothing at all — the verdict
  // card's banner is the live region again, exactly as before N1.
  if (!stickyVerdictActive()) return null;
  return <StickyVerdictBar />;
}

function StickyVerdictBar() {
  const snap = verdictSnapshot.value;
  const score = snap !== null && typeof snap.score === 'number' && Number.isFinite(snap.score) ? snap.score : null;
  const headline = (snap?.headline ?? '').trim();
  const has = score !== null;

  const [open, setOpen] = useState(false);
  const [textFocused, setTextFocused] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [unstuck, setUnstuck] = useState(false);
  const [tinted, setTinted] = useState(false);
  const [spoken, setSpoken] = useState('');
  const anchor = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const lastHeight = useRef(0);
  const prevScore = useRef<number | null>(null);

  const visible = barVisible({ score, textFocused, keyboardOpen });

  // (6) Step aside while a text field is focused — never while a select/button
  // is, so "change the deposit, watch the score" still works. focusout leaves
  // activeElement on <body>; a following focusin re-evaluates in the same task,
  // so there is no paint (and no flicker) in between.
  useEffect(() => {
    const update = () => {
      const el = document.activeElement as (Element & FocusTarget) | null;
      setTextFocused(isTextEntry(el) && !(bar.current?.contains(el) ?? false));
    };
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);

  // (6) …or while the on-screen keyboard is up. height×scale normalises pinch-zoom
  // (a zoomed-in viewport is shorter too, but that is not a keyboard).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKeyboardOpen(keyboardLikelyOpen(vv.height * vv.scale, window.innerHeight));
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  // (8) Publish the bar's height for scroll-padding-top, and un-stick at high zoom.
  useEffect(() => {
    const el = bar.current;
    const root = document.documentElement;
    if (!el) {
      root.style.setProperty(HEIGHT_VAR, '0px');
      return;
    }
    const measure = () => {
      // round UP: a fractional height must never leave a focused heading half a
      // pixel behind the bar (scroll-padding-top reads this).
      const h = Math.ceil(el.getBoundingClientRect().height);
      lastHeight.current = h;
      const off = shouldUnstick(h, window.innerHeight);
      setUnstuck(off);
      root.style.setProperty(HEIGHT_VAR, off ? '0px' : `${h}px`);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.setProperty(HEIGHT_VAR, '0px');
    };
  }, [has]);

  // (9) Appearing/vanishing must not move the user: if the bar's slot is above
  // the viewport, cancel the reflow by scrolling exactly the bar's height.
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    const slotTop = a.getBoundingClientRect().top;
    if (has) {
      const h = bar.current?.offsetHeight ?? 0;
      lastHeight.current = h;
      if (slotTop < 0 && h > 0) window.scrollBy(0, h);
    } else {
      const h = lastHeight.current;
      if (slotTop < 0 && h > 0) window.scrollBy(0, -h);
      lastHeight.current = 0;
      setOpen(false);
    }
  }, [has]);

  // (7) One brief tint when the score MOVES (not on first arrival); a change
  // inside the tint window just extends it — never a repeat pulse.
  useEffect(() => {
    const prev = prevScore.current;
    prevScore.current = score;
    if (score === null || prev === null || score === prev) return;
    setTinted(true);
    const t = setTimeout(() => setTinted(false), STICKY_VERDICT.tintMs);
    return () => clearTimeout(t);
  }, [score]);

  // (7) The screen reader hears the WHOLE verdict once per settled change — the
  // live region sits outside the bar so a hidden bar (text field focused, which
  // is exactly when the score moves) still announces.
  useEffect(() => {
    if (score === null) {
      setSpoken('');
      return;
    }
    const text = announcement(score, headline);
    const t = setTimeout(() => setSpoken(text), STICKY_VERDICT.announceDelayMs);
    return () => clearTimeout(t);
  }, [score, headline]);

  // Expanded panel: Escape, a tap outside, or focus moving out of the bar closes
  // it. Escape only takes focus back to the toggle when focus was INSIDE the bar
  // — pressing Escape on a form control (to dismiss its tooltip) must not yank
  // the user to the top. Closing on focusout also keeps the panel from covering
  // whatever they tab to next (WCAG 2.4.11).
  useEffect(() => {
    if (!open) return;
    const inBar = () => bar.current?.contains(document.activeElement) ?? false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const returnFocus = inBar();
      setOpen(false);
      if (returnFocus) toggle.current?.focus();
    };
    const onDown = (e: Event) => {
      if (!(bar.current?.contains(e.target as Node) ?? false)) setOpen(false);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next !== null && !(bar.current?.contains(next) ?? false)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    bar.current?.addEventListener('focusout', onFocusOut);
    const barEl = bar.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      barEl?.removeEventListener('focusout', onFocusOut);
    };
  }, [open]);

  const copy = STICKY_VERDICT.copy;
  const cls = [
    'sticky-verdict',
    has ? tierClass(score) : '',
    visible ? '' : 'is-hidden',
    unstuck ? 'is-unstuck' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div ref={anchor} class="sv-anchor" aria-hidden="true" />
      <div class="sr-only" aria-live="polite" aria-atomic="true">{spoken}</div>
      {has && (
        <div ref={bar} class={cls} role="region" aria-label={copy.region} style={`--sv-tint-ms:${STICKY_VERDICT.tintMs}ms`}>
          <button ref={toggle} type="button" class="sv-main" aria-expanded={open} aria-controls="sv-panel" onClick={() => setOpen((o) => !o)}>
            <span class={`sv-chip${tinted ? ' is-changed' : ''}`}>
              <strong>{formatScore(score)}</strong>
              <span class="sv-outof">/10</span>
            </span>
            <span class="sv-headline">{headline}</span>
            <span class="sv-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
            <span class="sr-only">{open ? copy.collapse : copy.expand}</span>
          </button>
          <div id="sv-panel" class="sv-panel" hidden={!open}>
            <p class="sv-full">{headline}</p>
            <a class="sv-jump" href="#verdict-h" onClick={() => setOpen(false)}>{copy.jump}</a>
          </div>
        </div>
      )}
    </>
  );
}
