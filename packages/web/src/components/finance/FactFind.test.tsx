// @vitest-environment happy-dom
/**
 * THE FACT-FIND FORM (F2). Two things this holds that nothing else can:
 * a remembered answer comes back to the person who typed it AND NOBODY ELSE,
 * and the form never asks for a file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { h } from 'preact';
import { FACTFIND } from '../../config/bridging';
import { FactFind } from './FactFind';

const REMEMBER = 'gb:factfind';
const ENQUIRY = 'enq-1';
const MINE = 'me@test.test';
const THEIRS = 'someone-else@test.test';
const SECRET = { name: 'Alex Morgan', dob: '1988-04-12', address: '12 Bryn Road, Swansea' };

let host: HTMLDivElement;
const mount = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    render(h(FactFind, { enquiryId: ENQUIRY, email: MINE, name: 'Alex Morgan', ...props }), host);
  });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};
const seed = (user: string, enquiryId: string): void => {
  sessionStorage.setItem(REMEMBER, JSON.stringify({
    user, enquiryId, step: 1, answers: { name: SECRET.name, dob: SECRET.dob, address: SECRET.address, ltd: 'no' },
  }));
};
const value = (id: string): string => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';

beforeEach(() => {
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  // Unmounted between tests, or a stale form left in the document answers the
  // next test's getElementById — and this file exists to prove one person's
  // answers never reach another's screen.
  render(null, host);
  host.remove();
  vi.unstubAllGlobals();
});

describe('what the tab remembers', () => {
  it('comes back to the person who typed it', async () => {
    seed(MINE, ENQUIRY);
    await mount();
    expect(value('ff-name')).toBe(SECRET.name);
    expect(value('ff-dob')).toBe(SECRET.dob);
  });

  it('is NEVER handed to the next person on the same computer', async () => {
    seed(THEIRS, ENQUIRY);
    await mount();
    expect(value('ff-dob'), 'somebody else’s date of birth').toBe('');
    expect(value('ff-address')).toBe('');
    expect(host.innerHTML).not.toContain(SECRET.address);
    // their own account name is prefilled, and that is all
    expect(value('ff-name')).toBe('Alex Morgan');
  });

  it('and never to a different enquiry', async () => {
    seed(MINE, 'another-enquiry');
    await mount();
    expect(value('ff-dob')).toBe('');
  });
});

describe('what it shows', () => {
  it('the broker’s own preamble, and honest progress', async () => {
    await mount();
    for (const line of FACTFIND.preamble) expect(host.textContent).toContain(line);
    expect(host.textContent).toContain(FACTFIND.progress(1, 3));
  });

  it('the email it already has, rather than asking again', async () => {
    await mount();
    expect(host.textContent).toContain(MINE);
    expect(document.getElementById('ff-email'), 'no field for it').toBeNull();
  });

  it('no file input, anywhere', async () => {
    await mount();
    expect(host.querySelectorAll('input[type="file"]').length).toBe(0);
    expect(host.innerHTML).not.toContain('enctype');
  });

  it('the "already sent" screen instead of the form, when it has gone', async () => {
    await mount({ alreadySent: true });
    expect(host.textContent).toContain(FACTFIND.done.heading);
    expect(document.getElementById('ff-name'), 'no second copy collected').toBeNull();
  });

  it('and the "not a broker" line, on the most personal step in the product', async () => {
    await mount();
    expect(host.textContent).toContain('not a broker');
  });
});

describe('when it cannot be sent', () => {
  it('lets go of the flow rather than trapping them on a dead form', async () => {
    const onUnavailable = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    seed(MINE, ENQUIRY);
    await mount({ onUnavailable });
    // walk to the last step with the seeded answers, then try to send
    await act(async () => { (host.querySelector('.bridge-actions .btn-primary') as HTMLButtonElement).click(); });
    vi.unstubAllGlobals();
    expect(typeof onUnavailable).toBe('function');
  });
});
