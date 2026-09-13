// @vitest-environment happy-dom
/**
 * THE REGIONAL SUGGESTIONS, WITH FIGURES IN (R2).
 *
 * The shipped config is empty on purpose — the research never arrived, and this
 * product does not invent refurb costs. So this file MOCKS the figures module
 * with arbitrary test values to prove the machine works the moment real ones
 * land. Nothing here is a suggestion, a guess, or shipped to anybody.
 *
 * What it holds: ticking fills the row for THIS region and THIS property, a row
 * we cannot size says so instead of guessing, the labour choice moves every
 * figure, the working shows every step, and the mid-point is what the total is.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'preact-render-to-string';

// Arbitrary test figures. NOT suggestions. NOT shipped.
vi.mock('../../config/refurbFigures', () => {
  const B = (mid: number, low: number, high: number) => ({ mid, low, high });
  const FIGS: Record<string, { mid: number | null; low: number | null; high: number | null; bands?: Record<string, { mid: number | null; low: number | null; high: number | null }> }> = {
    ripOut: B(2000, 1400, 2800),
    damp: B(5000, 2000, 12000),
    roof: B(6000, 3500, 11000),
    windows: B(700, 500, 1100),
    rewire: { mid: null, low: null, high: null, bands: { '1-2': B(3000, 2200, 4000), '3': B(4200, 3200, 5600), '4+': B(5400, 4200, 7000) } },
    plumbing: B(3000, 2000, 4500),
    heating: B(3500, 2500, 5000),
    plastering: B(45, 32, 60),
    kitchen: B(6000, 4000, 9500),
    bathroom: B(4000, 2800, 6500),
    flooring: B(40, 25, 65),
    decoration: B(2500, 1600, 4000),
    externals: B(2000, 900, 5000),
    other: B(1000, 500, 2500),
  };
  const REGIONS: Record<string, number> = {
    london: 1.35, 'south-east': 1.15, 'east-of-england': 1.05, 'south-west': 1.02,
    'east-midlands': 0.95, 'west-midlands': 0.97, 'yorkshire-humber': 0.93,
    'north-west': 0.94, 'north-east': 0.9, wales: 0.92,
  };
  const LABOUR: Record<string, number> = { mainContractor: 1.18, builder: 1, tradesDirect: 0.85, diy: 0.45 };
  return {
    REFURB_FIGURES: FIGS,
    REGION_MULTIPLIERS: REGIONS,
    LABOUR_FACTORS: LABOUR,
    FIGURES_REVIEWED: '2026-09-01',
    FIGURES_INCLUDE_VAT: true,
    UPRATING: { source: 'x', series: 'y', url: 'z', method: 'w' },
    suggestionsReady: () => true,
    figureSpecFor: (k: string) => FIGS[k],
    regionMultiplier: (r: string | null) => (r === null ? null : REGIONS[r] ?? null),
    labourFactor: (id: string) => LABOUR[id] ?? null,
    hasAnyFigure: () => true,
    figureFor: (k: string) => FIGS[k]?.mid ?? null,
  };
});

const { RefurbSection, MODE_PARAM, LABOUR_PARAM, REGION_PARAM } = await import('./RefurbSection');
const { REFURB, REFURB_CAVEAT, paramFor } = await import('../../config/refurb');
const { state, strategyParams } = await import('./state');
const { features } = await import('../../config/features');

/** A three-bed terrace in the North West, 90 m². */
const TERRACE = { postcode: 'M14 5AA', area: '90', beds: '3' };

const html = (params: Record<string, string>, subject = TERRACE, hasContingency = true): string => {
  strategyParams.value = params;
  state.value = { ...state.value, ...subject };
  return render(<RefurbSection legacy={false} onLegacySeen={() => {}} country="E92000001" hasContingency={hasContingency} />);
};

beforeEach(() => {
  // R2 is behind its own flag, so these tests turn it on as deliberately as the
  // flags-off run turns it off.
  features.refurbSection = true;
  features.refurbSuggestions = true;
  strategyParams.value = {};
  state.value = { ...state.value, ...TERRACE };
});

describe('the region is inferred and said, with a way to change it', () => {
  it('names the region it used', () => {
    expect(html({ [MODE_PARAM]: '1' })).toContain('the North West');
  });

  it('and offers to change it', () => {
    expect(html({ [MODE_PARAM]: '1' })).toContain(REFURB.copy.regionChange);
  });

  it('a chosen region overrides the postcode', () => {
    expect(html({ [MODE_PARAM]: '1', [REGION_PARAM]: 'london' })).toContain('London');
  });

  it('an unmappable postcode asks rather than guesses', () => {
    const out = html({ [MODE_PARAM]: '1' }, { ...TERRACE, postcode: 'ZZ1 1AA' });
    expect(out).toContain(REFURB.copy.regionUnknown);
    expect(out).toContain('id="rf-region"');
  });
});

describe('a ticked row carries the right figure for that region', () => {
  // kitchen 6000 × north-west 0.94 × builder 1.0 = 5640
  it('kitchen in the North West', () => {
    expect(html({ [MODE_PARAM]: '1', [paramFor('kitchen')]: '5640' })).toContain('£5,640');
  });

  // the same kitchen in London: 6000 × 1.35 = 8100
  it('the same kitchen in London is dearer', () => {
    const out = html({ [MODE_PARAM]: '1', [REGION_PARAM]: 'london', [paramFor('kitchen')]: '8100' });
    expect(out).toContain('£8,100');
  });

  it('shows the range under the row, never a bare mid-point', () => {
    const out = html({ [MODE_PARAM]: '1', [paramFor('kitchen')]: '5640' });
    // 4000 × 0.94 = 3760 … 9500 × 0.94 = 8930
    expect(out).toContain(REFURB.copy.rowRange('£3,760', '£8,930'));
  });

  it('a rewire is banded by bedrooms, not multiplied by them', () => {
    // 3-bed band 4200 × 0.94 = 3948
    expect(html({ [MODE_PARAM]: '1', [paramFor('rewire')]: '3948' })).toContain('£3,948');
  });

  it('plastering is sized from the floor area', () => {
    // 45 × 90 m² × 0.94 = 3807
    expect(html({ [MODE_PARAM]: '1', [paramFor('plastering')]: '3807' })).toContain('£3,807');
  });
});

describe('a row we cannot size says so', () => {
  it('plastering with no floor area asks for one', () => {
    const out = html({ [MODE_PARAM]: '1' }, { ...TERRACE, area: '' });
    expect(out).toContain(REFURB.copy.needsArea);
  });

  it('a rewire with no bedrooms asks for them', () => {
    const out = html({ [MODE_PARAM]: '1' }, { ...TERRACE, beds: '' });
    expect(out).toContain(REFURB.copy.needsBeds);
  });
});

describe('windows are counted, and the count is plainly a guess', () => {
  it('the count box is prefilled from the bedrooms and says it is a guess', () => {
    const out = html({ [MODE_PARAM]: '1', [paramFor('windows')]: '1974' });
    expect(out).toContain('id="rf-n-windows"');
    expect(out).toContain(REFURB.copy.countGuess);
  });

  it('a typed count is not called a guess', () => {
    const out = html({ [MODE_PARAM]: '1', [paramFor('windows')]: '1974', rfNWindows: '8' });
    expect(out).not.toContain(REFURB.copy.countGuess);
  });
});

describe('who is doing the work', () => {
  it('defaults to a builder and says what that means', () => {
    const out = html({ [MODE_PARAM]: '1' });
    expect(out).toContain(REFURB.copy.labourLabel);
    expect(out).toContain('What these figures are priced at.');
  });

  it('DIY says out loud that it assumes your time is free', () => {
    const out = html({ [MODE_PARAM]: '1', [LABOUR_PARAM]: 'diy' });
    expect(out).toContain('assumes your time is free');
    expect(out.toLowerCase()).toContain('burned');
  });
});

describe('the working shows every step', () => {
  const TICKED = {
    [MODE_PARAM]: '1',
    [paramFor('rewire')]: '3948', [paramFor('kitchen')]: '5640',
    [paramFor('bathroom')]: '3760', [paramFor('plastering')]: '3807',
    contingencyPct: '10',
  };

  it('names the item, the base, the regional multiplier and the labour factor', () => {
    const out = html(TICKED);
    for (const h of [REFURB.copy.mathsItem, REFURB.copy.mathsBase, REFURB.copy.mathsRegion, REFURB.copy.mathsLabour]) {
      expect(out, h).toContain(h);
    }
    expect(out).toContain('× 0.94');
    expect(out).toContain('× 1');
  });

  it('shows a sized item as base × quantity', () => {
    expect(html(TICKED)).toContain(REFURB.copy.mathsQuantity('£45', '90'));
  });

  it('shows the subtotal, the contingency and the total', () => {
    const out = html(TICKED);
    expect(out).toContain(REFURB.copy.mathsSubtotal);
    expect(out).toContain(REFURB.copy.mathsContingency('10'));
    expect(out).toContain(REFURB.copy.mathsTotal);
    // 3948 + 5640 + 3760 + 3807 = 17155
    expect(out).toContain('£17,155');
  });
});

describe('the caveat, where the number is', () => {
  it('says these are starting points and not a quote', () => {
    const out = html({ [MODE_PARAM]: '1' });
    for (const line of REFURB_CAVEAT.lines) expect(out, line).toContain(line);
  });

  it('names damp and structural as the budget-ruiner, and says get three quotes', () => {
    const out = html({ [MODE_PARAM]: '1' });
    expect(out.toLowerCase()).toContain('damp and structural');
    expect(out.toLowerCase()).toContain('three quotes');
  });

  it('tells them what the figures do about VAT, with no toggle anywhere', () => {
    const out = html({ [MODE_PARAM]: '1' });
    expect(out).toContain(REFURB_CAVEAT.vat(true));
    expect(out).not.toContain('id="rf-vat"');
  });

  it('says when the figures were compiled', () => {
    expect(html({ [MODE_PARAM]: '1' })).toContain(REFURB.copy.reviewed('2026-09-01'));
  });
});

describe('the flag turns all of R2 off, leaving R1 intact', () => {
  it('off: no region line, no labour selector, no caveat — and the list still works', () => {
    const saved = features.refurbSuggestions;
    try {
      features.refurbSuggestions = false;
      const out = html({ [MODE_PARAM]: '1', [paramFor('kitchen')]: '5640' });
      expect(out).not.toContain('the North West');
      expect(out).not.toContain(REFURB.copy.labourLabel);
      expect(out).not.toContain(REFURB_CAVEAT.heading);
      // R1 survives: the row, its figure and the total are all still there
      expect(out).toContain('£5,640');
      expect(out).toContain(REFURB.copy.sumLabel);
    } finally {
      features.refurbSuggestions = saved;
    }
  });
});

describe('contingency is drawn only where the strategy actually applies one', () => {
  it('shown on a strategy that has it', () => {
    expect(html({ [MODE_PARAM]: '1' }, TERRACE, true)).toContain('id="rf-contingency"');
  });

  it('and NOT on one that would ignore it — a dead input is what R1 removed', () => {
    expect(html({ [MODE_PARAM]: '1' }, TERRACE, false)).not.toContain('id="rf-contingency"');
  });
});
