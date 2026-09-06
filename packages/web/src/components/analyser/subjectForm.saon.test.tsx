// @vitest-environment happy-dom
/**
 * The flat number is the only record of WHICH flat a deal is, and there is no
 * field to type it back into. Editing the house number to something else drops
 * it (a different building); retyping the same number must not (P7 review).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { h } from 'preact';
import { SubjectForm } from './SubjectForm';
import { state, DEFAULTS } from './state';

let host: HTMLDivElement;
beforeEach(() => {
  state.value = { ...DEFAULTS, postcode: 'CF10 1AA', paon: '12', saon: 'Flat 2', price: '135000' };
  host = document.createElement('div');
  document.body.appendChild(host);
});

const type = (value: string): void => {
  const input = host.querySelector('#f-paon') as HTMLInputElement;
  input.value = value;
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('editing the house number', () => {
  it('keeps the flat number when the house number is retyped unchanged', () => {
    act(() => { render(h(SubjectForm, {} as never), host); });
    type('12');
    expect(state.value.saon).toBe('Flat 2');
  });

  it('drops it when the house number really changes — a different building', () => {
    act(() => { render(h(SubjectForm, {} as never), host); });
    type('14');
    expect(state.value.saon).toBe('');
  });
});
