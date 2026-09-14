// @vitest-environment happy-dom
/**
 * DP1 — THE LOCKED SECTIONS CANNOT BE TAKEN OUT THROUGH THE UI.
 *
 * WHAT IS LOCKED AND WHY. The basis page (where every figure came from), the
 * compliance block (who prepared this and under what registrations) and the
 * disclaimer (this is information, not advice). Those three are what keep the
 * sender inside the law. A pack builder that let them be unticked would be a
 * product that helps somebody break it.
 *
 * DRIVEN, NOT INSPECTED. The builder is mounted against a real DOM and the
 * locked boxes are actually clicked — including with `disabled` forced off
 * first, which is what a person with dev tools, or a broken future render, can
 * do in three seconds. The document is then rendered from whatever state came
 * out, and the locked content has to still be in it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { h, render as mount } from 'preact';
import { act } from 'preact/test-utils';
import { render } from 'preact-render-to-string';
import { LOCKED_SECTIONS, assertLocked, withLocked } from '@gil-bricks/core';
import { PACK_COPY, PACK_PAGES } from '../../config/pack';
import { PackBuilder } from './PackBuilder';
import { PackDocument } from './PackDocument';
import { packModel } from '../../fixtures/packModel';

const base = (() => {
  const { on, photos, summary, investorName, ...rest } = packModel();
  void on; void photos; void summary; void investorName;
  return rest;
})();

let host: HTMLDivElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
  act(() => { mount(h(PackBuilder, { base, onBranding: () => {} }), host); });
});

const box = (key: string): HTMLInputElement => {
  const el = host.querySelector(`#pk-${key}`);
  if (!(el instanceof HTMLInputElement)) throw new Error(`no tick box for "${key}" — the selector is wrong`);
  return el;
};

describe('the three locked sections', () => {
  it('are exactly the ones the engine calls locked', () => {
    const inConfig = PACK_PAGES.flatMap((p) => p.sections.filter((s) => s.lockedWhy).map((s) => s.key)).sort();
    expect(inConfig).toEqual([...LOCKED_SECTIONS].sort());
  });

  it('each render a ticked, disabled box that says why it cannot come off', () => {
    for (const key of LOCKED_SECTIONS) {
      expect(box(key).checked, key).toBe(true);
      expect(box(key).disabled, key).toBe(true);
      const why = host.querySelector(`#pk-why-${key}`);
      expect(why?.textContent ?? '', key).not.toBe('');
      expect(box(key).getAttribute('aria-describedby'), key).toBe(`pk-why-${key}`);
    }
  });

  it('stay on when clicked, and when clicked with the disabling removed', () => {
    for (const key of LOCKED_SECTIONS) {
      act(() => { box(key).click(); });
      expect(box(key).checked, `${key} after a click`).toBe(true);
      // A disabled input is a suggestion. Take the suggestion away.
      act(() => { box(key).disabled = false; box(key).click(); });
      expect(box(key).checked, `${key} after a forced click`).toBe(true);
    }
  });

  it('an unlocked section really can be taken out — so the test above means something', () => {
    expect(box('photos').disabled).toBe(false);
    act(() => { box('photos').click(); });
    expect(box('photos').checked).toBe(false);
  });
});

describe('and the document prints them whatever the selection says', () => {
  /** The worst case: a selection with every locked key stripped out. */
  const stripped = packModel({ on: ['cover'] });

  it('still prints the disclaimer, the basis list and the compliance block', () => {
    const out = render(<PackDocument model={stripped} />);
    expect(out).toContain(PACK_COPY.basis.heading);
    expect(out).toContain(PACK_COPY.basis.compliance.heading);
    expect(out).toContain(PACK_COPY.basis.disclaimerHeading);
    // and the registration numbers themselves, which are the point of it
    expect(out).toContain(stripped.compliance.hmrcAml);
    expect(out).toContain(stripped.compliance.redressNumber);
  });

  it('prints the short disclaimer on every one of the six sheets', () => {
    const out = render(<PackDocument model={stripped} />);
    // Parsed, not string-matched: "pk-page-body" shares the prefix, and
    // counting substrings quietly said twelve.
    const box = document.createElement('div');
    box.innerHTML = out;
    expect(box.querySelectorAll('.pk-page').length).toBe(6);
    expect(out.split(PACK_COPY.madeWith).length - 1).toBe(6);
  });

  it('withLocked puts them back, and assertLocked refuses a selection without them', () => {
    expect(withLocked(['cover']).sort()).toEqual(['cover', ...LOCKED_SECTIONS].sort());
    expect(() => assertLocked(['cover'])).toThrow();
    expect(() => assertLocked(withLocked(['cover']))).not.toThrow();
  });
});
