// @vitest-environment happy-dom
/**
 * THE PANEL'S HALF OF P10: the line that says what is waiting, the one click to
 * the board, and the switch that silences the whole thing — with the one honest
 * sentence about how far any of it reaches.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { scoreListing, smartDefaults, found, missing, type NormalisedListing, type SectorFile, type StrategyId } from '@gil-bricks/core';
import { attentionBar, renderEmpty, renderFailure, renderSettings, renderTriage, type PanelView } from '../entrypoints/sidepanel/main.ts';
import { ATTENTION_COPY } from '../src/attention';

const listing: NormalisedListing = {
  portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
  listingId: found('123'), url: found('https://www.rightmove.co.uk/properties/123'),
  postcode: found('SA1 8AJ'), outcode: found('SA1'),
  address: found({ paon: '31', street: 'Kings Road', town: 'Swansea' }),
  askingPrice: found(170000), propertyType: found('Apartment'), tenure: found('LEASEHOLD'),
  bedrooms: found(2), bathrooms: found(2), floorAreaSqm: missing(), floorAreaSqmRange: missing(),
  floorPlanImageUrls: missing(), newBuild: found(false), listingUpdate: missing(), firstVisibleDate: missing(),
  description: found('x'), isAuction: missing(),
};
const sector = (): SectorFile => ({
  schemaVersion: 1, sector: 'SA1 8', country: 'W92000004', updatedAt: '2026-08-31T00:00:00Z', sales: [],
  stats: { count: 20, typicalPrice: 180000, typicalPpsqm: 2200, p10Price: 120000, p90Price: 230000 },
}) as SectorFile;
function view(over: Partial<PanelView> = {}): PanelView {
  const strategy = (over.strategy ?? 'btl') as StrategyId;
  const unknowns = over.unknowns ?? {};
  return {
    screen: 'triage', listing, strategy, unknowns,
    result: over.result ?? scoreListing(listing, { strategy, unknowns, sector: sector() }),
    suggestions: smartDefaults(strategy, listing, sector(), null),
    settings: {}, criteria: {}, floorAreaSqm: null, floorAreaSource: 'none', floorAreaRange: null,
    manualAreaInput: '', usingSuggested: false, ...over,
  };
}

beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });
const txt = () => document.getElementById('app')!.textContent ?? '';

describe('the line that says what is waiting', () => {
  it('appears only when something IS waiting', () => {
    expect(attentionBar(0)).toBeNull();
    expect(attentionBar(-1)).toBeNull();
    expect(attentionBar(Number.NaN)).toBeNull();
    expect(attentionBar(2)?.textContent).toContain(ATTENTION_COPY.banner(2));
  });

  it('is one click to the board, and says so', async () => {
    const open = vi.fn();
    const bar = attentionBar(3, open)!;
    document.getElementById('app')!.append(bar);
    const button = bar.querySelector('button')!;
    expect(button.textContent).toBe(ATTENTION_COPY.open);
    expect(button.type).toBe('button');
    button.click();
    expect(open).toHaveBeenCalledOnce();
  });

  it('is announced, not shouted', () => {
    expect(attentionBar(1)!.getAttribute('role')).toBe('status');
  });

  it('shows on every screen the panel can be on', () => {
    renderTriage(view({ attention: 4 }));
    expect(txt()).toContain(ATTENTION_COPY.banner(4));
    document.body.innerHTML = '<main id="app"></main>';
    renderEmpty({ count: 4 });
    expect(txt()).toContain(ATTENTION_COPY.banner(4));
    expect(txt(), 'and the panel still says what it is for').toContain('Open a Rightmove or Zoopla listing');
    document.body.innerHTML = '<main id="app"></main>';
    renderFailure('the site may have changed', { count: 4 });
    expect(txt()).toContain(ATTENTION_COPY.banner(4));
    expect(txt()).toContain('the site may have changed');
  });

  it('and never when the count is nothing', () => {
    renderTriage(view({ attention: 0 }));
    expect(txt()).not.toContain('need you today');
    document.body.innerHTML = '<main id="app"></main>';
    renderEmpty();
    expect(txt()).not.toContain('need you today');
  });
});

describe('the switch, in settings', () => {
  it('is one tap, on by default, and reachable by keyboard', () => {
    renderSettings(view({ screen: 'settings', reminders: true }), { onReminders: () => {} });
    const box = document.getElementById('gb-reminders') as HTMLInputElement;
    expect(box).toBeTruthy();
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(true);
    // a real label, so a screen reader announces it and a tap on the words works
    const label = document.querySelector('label[for="gb-reminders"]');
    expect(label?.textContent).toBe(ATTENTION_COPY.settings);
  });

  it('says exactly how far it reaches, and the switch points at that sentence', () => {
    renderSettings(view({ screen: 'settings', reminders: true }), { onReminders: () => {} });
    const box = document.getElementById('gb-reminders') as HTMLInputElement;
    const noteId = box.getAttribute('aria-describedby')!;
    expect(document.getElementById(noteId)?.textContent).toBe(ATTENTION_COPY.reach);
    expect(txt()).toContain('Nothing reaches you when it is closed.');
  });

  it('turning it off is reported once, with the value', () => {
    const onReminders = vi.fn();
    renderSettings(view({ screen: 'settings', reminders: true }), { onReminders });
    const box = document.getElementById('gb-reminders') as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(onReminders).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('shows OFF as off', () => {
    renderSettings(view({ screen: 'settings', reminders: false }), { onReminders: () => {} });
    expect((document.getElementById('gb-reminders') as HTMLInputElement).checked).toBe(false);
  });

  it('is absent entirely when the panel is not wired for it', () => {
    renderSettings(view({ screen: 'settings' }), {});
    expect(document.getElementById('gb-reminders')).toBeNull();
  });
});
