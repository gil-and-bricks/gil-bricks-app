import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFloodAlerts, floodsUrl, FloodUnavailableError, OFFICIAL_LINKS, summariseFloods } from './flood';

describe('summariseFloods', () => {
  it('keeps only in-force severities 1-3, most severe first', () => {
    const out = summariseFloods([
      { description: 'River Taff at Pontypridd', severity: 'Flood alert', severityLevel: 3 },
      { description: 'Lower Taff', severity: 'Flood warning', severityLevel: 2 },
      { description: 'Old event', severity: 'Warning no longer in force', severityLevel: 4 },
      { description: 'Broken item' },
    ]);
    expect(out).toEqual([
      { name: 'Lower Taff', severity: 'Flood warning', severityLevel: 2 },
      { name: 'River Taff at Pontypridd', severity: 'Flood alert', severityLevel: 3 },
    ]);
  });
  it('falls back to eaAreaName then a placeholder for the name', () => {
    const out = summariseFloods([{ eaAreaName: 'Wessex', severityLevel: 3 }, { severityLevel: 3 }]);
    expect(out.map((a) => a.name)).toEqual(['Unnamed area', 'Wessex']);
  });
});

describe('floodsUrl', () => {
  it('builds the lat/long/dist query', () => {
    expect(floodsUrl(53.48, -2.24)).toBe('https://environment.data.gov.uk/flood-monitoring/id/floods?lat=53.48&long=-2.24&dist=5');
  });
});

describe('fetchFloodAlerts', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('parses items', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ items: [{ description: 'X', severity: 'Flood alert', severityLevel: 3 }] }), { status: 200 }),
    );
    expect(await fetchFloodAlerts(53, -2)).toHaveLength(1);
  });
  it('missing items key → empty list, not an error', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
    expect(await fetchFloodAlerts(53, -2)).toEqual([]);
  });
  it('HTTP error → FloodUnavailableError', async () => {
    vi.stubGlobal('fetch', async () => new Response('down', { status: 500 }));
    await expect(fetchFloodAlerts(53, -2)).rejects.toBeInstanceOf(FloodUnavailableError);
  });
});

describe('OFFICIAL_LINKS', () => {
  it('are all https entry pages', () => {
    for (const url of Object.values(OFFICIAL_LINKS)) expect(url).toMatch(/^https:\/\//);
  });
});
