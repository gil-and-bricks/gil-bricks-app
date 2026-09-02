import { describe, expect, it } from 'vitest';
import { circleRing, CLUSTER_THRESHOLD, escapeHtml, isRenderedTileEvent, METRES_PER_MILE, milesToMetres, pinState, shouldCluster } from './geo';
import { brandFlavor, buildMapStyle, tilesUrl } from './style';

describe('milesToMetres', () => {
  it('uses the exact statute mile', () => {
    expect(METRES_PER_MILE).toBe(1609.344);
    expect(milesToMetres(0.5)).toBeCloseTo(804.672, 3);
  });
});

describe('circleRing', () => {
  const haversineMetres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const R = 6371008.8;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  it('is a closed 64-point ring sized exactly to the radius', () => {
    const ring = circleRing(51.6, -3.34, 0.5);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    for (const [lng, lat] of ring) {
      expect(haversineMetres(51.6, -3.34, lat, lng)).toBeCloseTo(milesToMetres(0.5), 0);
    }
  });
  it('stays exact at a 1-mile radius up north (latitude correction)', () => {
    const ring = circleRing(55.0, -1.6, 1);
    for (const [lng, lat] of ring) {
      expect(haversineMetres(55.0, -1.6, lat, lng)).toBeCloseTo(milesToMetres(1), 0);
    }
  });
});

describe('clustering threshold', () => {
  it('clusters only above the configured pin count', () => {
    expect(CLUSTER_THRESHOLD).toBe(25);
    expect(shouldCluster(25)).toBe(false);
    expect(shouldCluster(26)).toBe(true);
  });
});

describe('pinState', () => {
  const prices = [100000, 200000, 300000];
  it('selected wins over excluded', () => {
    expect(pinState({ id: 'a', included: false, price: 200000 }, prices, 'a').state).toBe('selected');
  });
  it('excluded dims, normal otherwise', () => {
    expect(pinState({ id: 'a', included: false, price: 200000 }, prices, null).state).toBe('excluded');
    expect(pinState({ id: 'a', included: true, price: 200000 }, prices, 'b').state).toBe('normal');
  });
  it('radius scales with price across the batch (5→9px)', () => {
    expect(pinState({ id: 'a', included: true, price: 100000 }, prices, null).radius).toBe(5);
    expect(pinState({ id: 'a', included: true, price: 300000 }, prices, null).radius).toBe(9);
    expect(pinState({ id: 'a', included: true, price: 200000 }, prices, null).radius).toBe(7);
  });
  it('a single-price batch sits mid-scale', () => {
    expect(pinState({ id: 'a', included: true, price: 150000 }, [150000], null).radius).toBe(7);
  });
});

describe('style sanity', () => {
  it('points at OUR tiles, glyphs and sprites — no third-party hosts', () => {
    const style = buildMapStyle();
    expect(tilesUrl()).toMatch(/^pmtiles:\/\/https:\/\/pub-.*\.r2\.dev\/map\/ew\.pmtiles$/);
    expect(style.glyphs).toBe('/map/fonts/{fontstack}/{range}.pbf');
    expect(style.sprite).toContain('/map/sprites/v4/dark');
    const json = JSON.stringify(style);
    expect(json).not.toMatch(/api\.protomaps\.com|demotiles|maptiler|mapbox/);
  });
  it('carries the expected layer stack with the brand ground', () => {
    const style = buildMapStyle();
    const ids = (style.layers as { id: string }[]).map((l) => l.id);
    expect(ids).toContain('background');
    expect(ids).toContain('water');
    expect(ids.length).toBeGreaterThan(50);
    const bg = (style.layers as { id: string; paint?: { 'background-color'?: string } }[]).find((l) => l.id === 'background');
    expect(bg?.paint?.['background-color']).toBe('#0b0318');
  });
  it('serialises with no undefined leaking into paint expressions', () => {
    const style = buildMapStyle();
    // JSON.stringify drops undefined object values but leaves them as null in
    // arrays — a broken flavor key shows up as null inside an expression
    const json = JSON.stringify(style.layers);
    expect(json).not.toContain('null,'); // expression slots must all be real values
    expect(json).not.toContain(',null]');
  });
  it('brand flavor keeps labels quiet (sub-full opacity whites)', () => {
    const f = brandFlavor();
    expect(f.city_label).toContain('0.72');
    expect(f.background).toBe('#0b0318');
  });
});

describe('isRenderedTileEvent (blank-map health signal)', () => {
  it('true only for a loaded tile from the BASEMAP source', () => {
    expect(isRenderedTileEvent({ dataType: 'source', sourceId: 'protomaps', tile: {} }, 'protomaps')).toBe(true);
  });
  it('false for the GeoJSON pin source — pins loading must not mask an absent basemap', () => {
    expect(isRenderedTileEvent({ dataType: 'source', sourceId: 'comps', tile: {} }, 'protomaps')).toBe(false);
  });
  it('false for style/metadata and tile-less events', () => {
    expect(isRenderedTileEvent({ dataType: 'style' }, 'protomaps')).toBe(false);
    expect(isRenderedTileEvent({ dataType: 'source', sourceId: 'protomaps' }, 'protomaps')).toBe(false);
    expect(isRenderedTileEvent({}, 'protomaps')).toBe(false);
  });
});

describe('escapeHtml (popup safety)', () => {
  it('neutralises HTML metacharacters from address strings', () => {
    expect(escapeHtml('Flat 3 & 4, <script>alert(1)</script>')).toBe(
      'Flat 3 &amp; 4, &lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeHtml(`O'Brien "House"`)).toBe('O&#39;Brien &quot;House&quot;');
  });
  it('handles null/undefined and numbers', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(264)).toBe('264');
  });
});

describe('view URL param', () => {
  it('clamps to list|map with list as the accessible default', async () => {
    const { DEFAULTS, parseQuery } = await import('../../components/analyser/state');
    expect(DEFAULTS.view).toBe('list');
    expect(parseQuery('?view=map').view).toBe('map');
    expect(parseQuery('?view=globe').view).toBe('list');
  });
});
