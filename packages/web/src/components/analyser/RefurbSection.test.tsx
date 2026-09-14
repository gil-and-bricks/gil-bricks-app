// @vitest-environment happy-dom
/**
 * THE REFURB SECTION as it actually renders (R1).
 *
 * What is being held here, in order of how much damage breaking it would do:
 *   1. no price is ever offered that the operator did not write;
 *   2. the person with a builder's quote is never walked through the list;
 *   3. a quote supersedes an itemised list VISIBLY — the list stays on screen;
 *   4. on a phone the default is two controls, not fourteen rows;
 *   5. every row is reachable and named without a mouse.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render } from 'preact-render-to-string';
import { RefurbSection, linesFrom, refurbParamKeys, MODE_PARAM, DURATION_FROM_PARAM, DURATION_TO_PARAM } from './RefurbSection';
import { REFURB, REFURB_ITEMS, paramFor } from '../../config/refurb';
import { state, strategyParams } from './state';
import { features } from '../../config/features';

const html = (params: Record<string, string>, legacy = false): string => {
  strategyParams.value = params;
  return render(<RefurbSection legacy={legacy} onLegacySeen={() => {}} country={null} hasContingency={false} />);
};

const TYPED = { [REFURB.fieldKey]: '18000' };
const ITEMISED = { [MODE_PARAM]: '1', [paramFor('kitchen')]: '6000', [paramFor('rewire')]: '4000', [REFURB.fieldKey]: '10000' };

beforeEach(() => {
  // Both flags on deliberately, so the flags-off run cannot silently pass these
  // by rendering a section that is not the one under test.
  features.refurbSection = true;
  features.refurbSuggestions = true;
  strategyParams.value = {};
  state.value = { ...state.value, postcode: '', area: '', beds: '' };
});

describe('the operator\u2019s figures are in, and the page says whose they are', () => {
  it('names them as his, and says they are changeable', () => {
    const out = html({ [MODE_PARAM]: '1' });
    expect(out).toContain(REFURB.figuresLabel);
    expect(out).not.toContain(REFURB.copy.figuresEmpty);
  });

  it('the caveat rides with them, in the same breath as the number', () => {
    expect(html({ [MODE_PARAM]: '1' })).toContain('They are not a quote.');
  });
});

describe('the person with a quote is not walked through the list', () => {
  it('opens as a typed total with the breakdown closed', () => {
    const out = html(TYPED);
    expect(out).toContain(`id="sf-${REFURB.fieldKey}"`);
    expect(out).toContain('£18,000');
    // the list is rendered but hidden — closed, not absent, so find-in-page and
    // the URL's own state still work
    expect(out).toContain('refurb-list');
    expect(out).toMatch(/class="refurb-list"[^>]*hidden/);
    expect(out).toContain(REFURB.copy.breakdown);
  });

  it('the total is a real editable input while nothing is ticked', () => {
    expect(html(TYPED)).toContain('<input');
    expect(html(TYPED)).not.toContain('refurb-derived');
  });
});

describe('the list, once it is in charge', () => {
  it('shows the arithmetic: how many items and what they come to', () => {
    const out = html(ITEMISED);
    expect(out).toContain(REFURB.copy.sumLine(2, '£10,000'));
    expect(out).toContain(REFURB.copy.sumLabel);
  });

  it('the total becomes derived, and says how to take it back', () => {
    const out = html(ITEMISED);
    expect(out).toContain('refurb-derived');
    expect(out).toContain(REFURB.copy.listInCharge);
  });

  it('a ticked row shows its own figure on the row itself', () => {
    expect(html(ITEMISED)).toContain('£6,000');
  });
});

describe('a builder’s quote supersedes the list, visibly', () => {
  const QUOTED = { ...ITEMISED, [REFURB.fieldKey]: '25000' };

  it('the quote is the figure shown', () => {
    expect(html(QUOTED)).toContain('£25,000');
  });

  it('it SAYS it replaced something, rather than silently winning', () => {
    const out = html(QUOTED);
    expect(out).toContain(REFURB.copy.superseded('£25,000'));
    expect(out).toContain(REFURB.copy.supersededWhy);
  });

  it('AND THE LIST IS STILL THERE — nothing was wiped', () => {
    const out = html(QUOTED);
    expect(out).toContain('is-superseded');
    expect(out).toContain('£6,000');
    expect(out).toContain('£4,000');
  });
});

describe('a deal saved before this section existed', () => {
  it('says once that its figure carried over, with a way to dismiss it', () => {
    const out = html(TYPED, true);
    expect(out).toContain(REFURB.copy.legacy);
    expect(out).toContain(REFURB.copy.legacyDismiss);
  });

  it('and is silent for everyone else', () => {
    expect(html(TYPED, false)).not.toContain(REFURB.copy.legacy);
  });
});

describe('reachable without a mouse, and named for a screen reader', () => {
  it('the disclosure is a real button saying whether it is open', () => {
    expect(html(TYPED)).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="refurb-list"/);
  });

  it('every row is a labelled checkbox, not a clickable div', () => {
    const out = html({ [MODE_PARAM]: '1' });
    for (const item of REFURB_ITEMS) {
      expect(out, item.key).toContain(`id="rf-${item.key}"`);
      expect(out, item.key).toContain(`for="rf-${item.key}"`);
    }
    expect((out.match(/type="checkbox"/g) ?? []).length).toBe(REFURB_ITEMS.length);
  });

  it('a ticked row’s money box carries its own visible-to-AT label', () => {
    const out = html(ITEMISED);
    expect(out).toContain(REFURB.copy.amountLabel('Kitchen'));
    expect(out).toContain('for="rf-amt-kitchen"');
  });

  it('the section is a landmark named by its own heading', () => {
    expect(html({})).toContain('aria-labelledby="refurb-h"');
    expect(html({})).toContain('id="refurb-h"');
  });
});

describe('the params it owns', () => {
  it('registers the mode flag, the region, the labour choice, one param per item and a count per sized item', () => {
    const counted = REFURB_ITEMS.filter((i) => i.driver === 'perUnit').length;
    // +5: the mode flag, the region, the labour choice, and the two boxes that
    // take a builder's own on-tools figure (DP1).
    expect(refurbParamKeys()).toHaveLength(REFURB_ITEMS.length + counted + 5);
    for (const k of [MODE_PARAM, 'rfRegion', 'rfLabour', DURATION_FROM_PARAM, DURATION_TO_PARAM]) {
      expect(refurbParamKeys()).toContain(k);
    }
  });

  it('a row is ticked when its param has any value — including a typed zero', () => {
    const lines = linesFrom({ [paramFor('roof')]: '0', [paramFor('kitchen')]: '' });
    expect(lines.find((l) => l.key === 'roof')?.ticked).toBe(true);
    expect(lines.find((l) => l.key === 'kitchen')?.ticked).toBe(false);
  });
});
