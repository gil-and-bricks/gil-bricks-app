import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { siteConfig } from '../../site.config';
import {
  DataError,
  clearDataCache,
  getManifest,
  getSector,
  sectorIdToPath,
} from './client';

// The SAME files that were uploaded to R2 — single source of truth.
const manifestFixture = JSON.parse(
  readFileSync(new URL('../../../data/fixtures/manifest.json', import.meta.url), 'utf8'),
);
const sectorFixture = JSON.parse(
  readFileSync(new URL('../../../data/fixtures/sectors/CF37/CF37-1.json', import.meta.url), 'utf8'),
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const BASE = siteConfig.dataBaseUrl.replace(/\/+$/, '');

const fetchMock = vi.fn();

beforeEach(() => {
  clearDataCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function expectDataError(p: Promise<unknown>, kind: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(DataError);
  expect((err as DataError).kind).toBe(kind);
}

describe('sectorIdToPath', () => {
  it('maps "CF37 1" to sectors/CF37/CF37-1.json', () => {
    expect(sectorIdToPath('CF37 1')).toBe('sectors/CF37/CF37-1.json');
  });

  it('normalises case and stray whitespace', () => {
    expect(sectorIdToPath('  cf37   1 ')).toBe('sectors/CF37/CF37-1.json');
  });

  it('handles single-letter and 2-alpha outcodes', () => {
    expect(sectorIdToPath('M1 1')).toBe('sectors/M1/M1-1.json');
    expect(sectorIdToPath('SW1A 0')).toBe('sectors/SW1A/SW1A-0.json');
    expect(sectorIdToPath('LL11 2')).toBe('sectors/LL11/LL11-2.json');
  });

  it('rejects things that are not sector ids', () => {
    for (const bad of ['', 'CF37', 'CF37 1AA', 'NOT A SECTOR', '1 CF37']) {
      expect(() => sectorIdToPath(bad)).toThrow(TypeError);
    }
  });
});

describe('getManifest', () => {
  it('fetches and validates the manifest fixture', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(manifestFixture));
    const m = await getManifest();
    expect(m.schemaVersion).toBe(1);
    expect(m.ppdMonth).toBe('2026-07');
    expect(m.sectorsCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/manifest.json`,
    );
  });

  it('caches: second call does not refetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(manifestFixture));
    await getManifest();
    await getManifest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown schemaVersion as BadSchema', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...manifestFixture, schemaVersion: 2 }));
    await expectDataError(getManifest(), 'BadSchema');
  });

  it('rejects a structurally broken manifest as BadSchema', async () => {
    const { ppdMonth: _dropped, ...broken } = manifestFixture;
    fetchMock.mockResolvedValueOnce(jsonResponse(broken));
    await expectDataError(getManifest(), 'BadSchema');
  });

  it('maps 404 to NotFound', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expectDataError(getManifest(), 'NotFound');
  });

  it('maps fetch failure to Network', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expectDataError(getManifest(), 'Network');
  });

  it('maps HTTP 500 to Network', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expectDataError(getManifest(), 'Network');
  });

  it('maps non-JSON body to BadSchema', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expectDataError(getManifest(), 'BadSchema');
  });

  it('does not cache failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expectDataError(getManifest(), 'NotFound');
    fetchMock.mockResolvedValueOnce(jsonResponse(manifestFixture));
    const m = await getManifest();
    expect(m.sectorsCount).toBe(1);
  });
});

describe('getSector', () => {
  it('fetches the mapped path and validates the sector fixture', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sectorFixture));
    const s = await getSector('CF37 1');
    expect(s.sector).toBe('CF37 1');
    expect(s.country).toBe('W92000004');
    expect(s.sales).toHaveLength(12);
    expect(s.stats.typicalPrice).toBe(137575);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/sectors/CF37/CF37-1.json`,
    );
  });

  it('accepts lowercase input for the same sector', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sectorFixture));
    const s = await getSector('cf37 1');
    expect(s.sector).toBe('CF37 1');
  });

  it('rejects an unknown schemaVersion as BadSchema', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...sectorFixture, schemaVersion: 99 }));
    await expectDataError(getSector('CF37 1'), 'BadSchema');
  });

  it('rejects a sector file with a bad country code as BadSchema', async () => {
    // Scotland is out of scope — the schema only allows England & Wales.
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...sectorFixture, country: 'S92000003' }));
    await expectDataError(getSector('CF37 1'), 'BadSchema');
  });

  it('rejects a sector file with missing stats as BadSchema', async () => {
    const { stats: _dropped, ...broken } = sectorFixture;
    fetchMock.mockResolvedValueOnce(jsonResponse(broken));
    await expectDataError(getSector('CF37 1'), 'BadSchema');
  });

  it('maps 404 to NotFound', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expectDataError(getSector('ZZ99 9'), 'NotFound');
  });

  it('caches per sector id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sectorFixture));
    await getSector('CF37 1');
    await getSector('CF37 1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('sector-file hardening', () => {
  it('rejects a file whose sector does not match the request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...sectorFixture, sector: 'CF37 2' }));
    await expectDataError(getSector('CF37 1'), 'BadSchema');
  });

  it('rejects garbage sales entries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...sectorFixture, sales: ['garbage'] }));
    await expectDataError(getSector('CF37 1'), 'BadSchema');
  });
});
