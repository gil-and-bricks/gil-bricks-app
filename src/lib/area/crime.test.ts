import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  categoryLabel,
  crimesStreetPolyUrl,
  crimesStreetUrl,
  CrimeUnavailableError,
  fetchCrimeSummary,
  halfMilePoly,
  summariseCrimes,
} from './crime';

const fix = (cats: Record<string, number>) =>
  Object.entries(cats).flatMap(([category, n]) => Array.from({ length: n }, () => ({ category })));

describe('summariseCrimes', () => {
  it('totals and picks the top 4 by count', () => {
    const s = summariseCrimes(
      fix({ burglary: 5, drugs: 2, 'vehicle-crime': 7, shoplifting: 3, robbery: 1 }),
      '2026-06',
      1,
    );
    expect(s.total).toBe(18);
    expect(s.top.map((t) => t.category)).toEqual(['vehicle-crime', 'burglary', 'shoplifting', 'drugs']);
    expect(s.top[0]).toEqual({ category: 'vehicle-crime', label: 'Vehicle crime', count: 7 });
  });
  it('breaks count ties alphabetically by label', () => {
    const s = summariseCrimes(fix({ drugs: 2, burglary: 2 }), '2026-06', 1);
    expect(s.top.map((t) => t.label)).toEqual(['Burglary', 'Drugs']);
  });
  it('empty month → total 0, no categories', () => {
    const s = summariseCrimes([], '2026-06', 1);
    expect(s).toEqual({ month: '2026-06', total: 0, top: [], radiusMiles: 1 });
  });
});

describe('categoryLabel', () => {
  it('maps official slugs to plain labels', () => {
    expect(categoryLabel('violent-crime')).toBe('Violence and sexual offences');
    expect(categoryLabel('anti-social-behaviour')).toBe('Anti-social behaviour');
  });
  it('sentence-cases unknown slugs', () => {
    expect(categoryLabel('future-category')).toBe('Future category');
  });
});

describe('URL builders', () => {
  it('point query', () => {
    expect(crimesStreetUrl(51.5, -3.3, '2026-06')).toBe(
      'https://data.police.uk/api/crimes-street/all-crime?lat=51.5&lng=-3.3&date=2026-06',
    );
  });
  it('half-mile poly is 32 points around the centre (inscribed shortfall <1%)', () => {
    const poly = halfMilePoly(51.5, -3.3);
    const pts = poly.split(':').map((p) => p.split(',').map(Number));
    expect(pts).toHaveLength(32);
    for (const [lat, lng] of pts) {
      expect(Math.abs(lat - 51.5)).toBeLessThan(0.01);
      expect(Math.abs(lng - -3.3)).toBeLessThan(0.02);
    }
    expect(crimesStreetPolyUrl(51.5, -3.3, '2026-06')).toContain(`poly=${poly}`);
  });
});

describe('fetchCrimeSummary', () => {
  afterEach(() => vi.unstubAllGlobals());
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('happy path uses the 1-mile point query', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('crime-last-updated')) return json({ date: '2026-06-01' });
      return json(fix({ burglary: 2 }));
    });
    const s = await fetchCrimeSummary(51.5, -3.3);
    expect(s.radiusMiles).toBe(1);
    expect(s.month).toBe('2026-06');
    expect(s.total).toBe(2);
    expect(calls[1]).toContain('lat=51.5');
  });

  it('503 on the point query shrinks to the half-mile poly', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('crime-last-updated')) return json({ date: '2026-06-01' });
      if (url.includes('poly=')) return json(fix({ drugs: 9 }));
      return new Response('too many', { status: 503 });
    });
    const s = await fetchCrimeSummary(51.5, -3.3);
    expect(s.radiusMiles).toBe(0.5);
    expect(s.total).toBe(9);
    expect(calls).toHaveLength(3);
  });

  it('API down → CrimeUnavailableError', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network');
    });
    await expect(fetchCrimeSummary(51.5, -3.3)).rejects.toBeInstanceOf(CrimeUnavailableError);
  });
});
