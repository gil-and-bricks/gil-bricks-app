import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAPTURE_COPY, CAPTURE_TOOLS, EMAIL_DRAFTS, KIT_FIELDS, LEAD_LINES, captureFor, captureReady } from './capture';
import { TOOLS } from './tools';

/**
 * The capture path (T3) is only allowed to exist because it never touches the
 * answer. These hold it to that, and to the harder promise: we only offer what
 * actually arrives.
 */
const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const CAPTURE_COMPONENT = read('../components/tools/ToolCapture.tsx');
const TOOL_COMPONENTS = ['EquityTool', 'StampDutyTool', 'RentalYieldTool'].map((n) => ({
  name: n,
  src: read(`../components/tools/${n}.tsx`),
}));

describe('the capture path never gates the answer', () => {
  it('the offer is rendered INSIDE the answer card, after the answer', () => {
    for (const { name, src } of TOOL_COMPONENTS) {
      const answerAt = src.indexOf('tool-answer');
      const captureAt = src.indexOf('<ToolCapture');
      expect(answerAt, `${name} has an answer card`).toBeGreaterThan(-1);
      expect(captureAt, `${name} offers capture`).toBeGreaterThan(-1);
      expect(captureAt, `${name}: the offer must come after the answer`).toBeGreaterThan(answerAt);
    }
  });

  it('no tool asks for anything before it has answered', () => {
    for (const { name, src } of TOOL_COMPONENTS) {
      // the ONLY fetch a tool may make on its own is the HPI index file
      const fetches = src.match(/fetch\(/g) ?? [];
      expect(fetches.length, `${name} makes no fetch of its own`).toBe(0);
    }
  });

  it('the human check loads only when someone chooses to type an address', () => {
    // Turnstile is script-loaded lazily, never at module scope or on mount.
    expect(CAPTURE_COMPONENT).toContain('loadTurnstile');
    const lazy = /if \(state !== STATE\.typing\) return;\s*\n\s*void loadTurnstile\(\)/;
    expect(lazy.test(CAPTURE_COMPONENT), 'Turnstile must load on the typed path only').toBe(true);
  });

  it('the block can be dismissed, and stays gone for the session', () => {
    expect(CAPTURE_COMPONENT).toContain('dismissKey');
    expect(CAPTURE_COMPONENT).toContain('sessionStorage');
    expect(CAPTURE_COPY.dismiss.length).toBeGreaterThan(0);
  });

  it('the Google one-tap is offered ONLY to someone already signed in', () => {
    // A signed-out visitor sent to Google loses the answer they asked us to
    // email — so they get the one field instead (T3 review).
    expect(CAPTURE_COMPONENT).toContain('me.value !== null && me.value !== undefined &&');
    expect(CAPTURE_COMPONENT).not.toContain('openLoginWall');
    expect(CAPTURE_COMPONENT).not.toContain('pendingKey');
  });

  it('nothing is ever sent without a click — no auto-send on mount', () => {
    const mountEffect = CAPTURE_COMPONENT.slice(CAPTURE_COMPONENT.indexOf('useEffect(() => {'), CAPTURE_COMPONENT.indexOf('}, [slug]);'));
    expect(mountEffect).not.toContain('send(');
  });

  it('a failed send leaves a human check that can be solved again', () => {
    expect(CAPTURE_COMPONENT).toContain('window.turnstile.reset');
    expect(CAPTURE_COMPONENT).toContain("setToken('')");
  });

  it('the consent box is never pre-ticked', () => {
    expect(CAPTURE_COMPONENT).toContain('useState(false)');
    expect(CAPTURE_COMPONENT).not.toMatch(/checked=\{true\}/);
    expect(CAPTURE_COMPONENT).not.toMatch(/defaultChecked/);
  });
});

describe('we only offer what actually arrives', () => {
  it('a tool with no Kit tag or no named automation offers nothing', () => {
    for (const t of CAPTURE_TOOLS) {
      if (t.kitTag.trim() === '' || t.kitAutomation.trim() === '') {
        expect(captureReady(t.slug), `${t.slug} must stay silent until Kit is set up`).toBe(false);
      }
    }
    expect(captureReady('not-a-tool')).toBe(false);
  });

  it('every capture entry is a real tool in the registry', () => {
    for (const t of CAPTURE_TOOLS) {
      expect(TOOLS.map((x) => x.slug), `${t.slug} must exist in the tools registry`).toContain(t.slug);
    }
  });

  it('every enabled tool has an offer and an email drafted for it', () => {
    for (const t of TOOLS.filter((x) => x.enabled)) {
      expect(captureFor(t.slug), `${t.slug} needs a capture entry`).toBeDefined();
      expect(Object.keys(EMAIL_DRAFTS), `${t.slug} needs an email draft`).toContain(t.slug);
    }
  });

  it('each offer names something specific, not "save this"', () => {
    for (const t of CAPTURE_TOOLS) {
      expect(t.offer.toLowerCase()).toContain('email you this breakdown');
      expect(t.offer.toLowerCase()).not.toContain('save this');
    }
  });
});

describe('the emails give people their own numbers back', () => {
  it('every draft merges the figures the outbox actually writes', () => {
    for (const [slug, draft] of Object.entries(EMAIL_DRAFTS)) {
      const body = draft.body.join(' ');
      for (const field of [KIT_FIELDS.headline, KIT_FIELDS.detail, KIT_FIELDS.maths]) {
        expect(body, `${slug} must use {{ subscriber.${field} }}`).toContain(`{{ subscriber.${field} }}`);
      }
      expect(draft.subject.length).toBeGreaterThan(0);
    }
  });

  it('every draft points at the analyser as the next step, with no hype', () => {
    for (const [slug, draft] of Object.entries(EMAIL_DRAFTS)) {
      const body = draft.body.join(' ').toLowerCase();
      expect(body, `${slug} points at the analyser`).toContain('analyser');
      expect(draft.body.join(' '), `${slug} has no exclamation marks`).not.toContain('!');
      for (const hype of ['amazing', 'guaranteed', 'secret', 'unlock', 'act now']) {
        expect(body, `${slug} avoids "${hype}"`).not.toContain(hype);
      }
    }
  });

  it('the figure lines read as sentences with the numbers in them', () => {
    expect(LEAD_LINES.equity.headline('£171,494')).toContain('£171,494');
    expect(LEAD_LINES.stampDuty.headline('£6,250', 'stamp duty')).toContain('stamp duty');
    expect(LEAD_LINES.yield.headline('4.6%')).toContain('4.6%');
    expect(LEAD_LINES.equity.detail('£266,494', '£95,000', '35.6%')).toContain('£266,494');
  });
});

describe('what the person is agreeing to is said plainly', () => {
  it('the consent line says what arrives and how to stop it', () => {
    const c = CAPTURE_COPY.consent.toLowerCase();
    expect(c).toContain('email me');
    expect(c).toContain('unsubscribe');
  });

  it('the confirmation is honest about who sends the email', () => {
    expect(CAPTURE_COPY.sent.toLowerCase()).toContain('kit sends it');
  });

  it('nothing in the copy claims the answer needs an email', () => {
    const words = JSON.stringify(CAPTURE_COPY).toLowerCase();
    for (const gate of ['to see your', 'unlock', 'enter your email to', 'sign up to see']) {
      expect(words).not.toContain(gate);
    }
  });
});
