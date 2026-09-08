import { describe, expect, it } from 'vitest';
import {
  cacheKey, lookupFromRegister, normalisePostcode, outsideEnglandWales, worthCaching,
} from './epc';

/**
 * The EPC register client (E1).
 *
 * The register needs TWO calls — search a postcode for candidates, then fetch a
 * certificate for its floor area — and every step of that has a way to fail.
 * The old lookup collapsed six outcomes into one message that blamed the user's
 * address for our own outages; these tests exist so that cannot come back, this
 * time with a government API in the middle.
 *
 * `fetch` is injected, so nothing here touches the network.
 */
const SEARCH = /\/api\/domestic\/search/;
const CERT = /\/api\/certificate/;

const row = (line1: string, num = 'C1', date = '2020-01-01') => ({
  certificateNumber: num,
  addressLine1: line1,
  addressLine2: null,
  addressLine3: null,
  addressLine4: null,
  postcode: 'CF37 1DL',
  registrationDate: date,
});

const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
const status = (s: number): Response => new Response('', { status: s });

/** A fake register: candidates for the search, floor areas per certificate. */
function fakeRegister(candidates: unknown[], areas: Record<string, unknown>) {
  const calls: string[] = [];
  const doFetch = (async (url: string) => {
    calls.push(String(url));
    if (SEARCH.test(String(url))) return ok({ data: candidates });
    if (CERT.test(String(url))) {
      const m = /certificate_number=([^&]+)/.exec(String(url));
      const key = decodeURIComponent(m?.[1] ?? '');
      if (!(key in areas)) return status(404);
      return ok({ data: { total_floor_area: areas[key] } });
    }
    return status(404);
  }) as unknown as typeof fetch;
  return { doFetch, calls };
}

describe('postcodes', () => {
  it('normalises to the register’s own spacing', () => {
    expect(normalisePostcode('cf371dl')).toBe('CF37 1DL');
    expect(normalisePostcode(' CF37  1DL ')).toBe('CF37 1DL');
    expect(normalisePostcode('SA1 6SN')).toBe('SA1 6SN');
  });

  it('refuses anything that is not a full postcode', () => {
    for (const bad of ['', 'CF37', 'nonsense', '12345', 'CF37 1D']) {
      expect(normalisePostcode(bad), bad).toBeNull();
    }
  });

  it('knows Scotland and Northern Ireland are a different register', () => {
    for (const pc of ['EH1 1YZ', 'G1 1XX', 'AB10 1AA', 'IV1 1AA', 'BT1 1AA']) {
      expect(outsideEnglandWales(pc), pc).toBe(true);
    }
    for (const pc of ['CF37 1DL', 'SA1 6SN', 'M1 1AA', 'EX1 1AA', 'E1 6AN']) {
      expect(outsideEnglandWales(pc), pc).toBe(false);
    }
  });
});

describe('asking the register', () => {
  it('returns the floor area, and says it came from the register', async () => {
    const { doFetch, calls } = fakeRegister([row('8 Tyfica Road')], { C1: 70 });
    const got = await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch);
    expect(got).toMatchObject({ ok: true, sqm: 70, source: 'register', certificateNumber: 'C1' });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(SEARCH);
    expect(calls[1]).toMatch(CERT);
  });

  it('works for a house that has NOT sold — the whole point of the sprint', async () => {
    // Nothing here consults sold data at all; a certificate is enough.
    const { doFetch } = fakeRegister([row('8 Tyfica Road', 'OLD', '2004-03-01')], { OLD: 88 });
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toMatchObject({ ok: true, sqm: 88, source: 'register' });
  });

  it('rounds a fractional floor area rather than showing decimals', async () => {
    const { doFetch } = fakeRegister([row('8 Tyfica Road')], { C1: 70.4 });
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch)).toMatchObject({ sqm: 70 });
  });

  it('accepts a floor area the register sent as a string', async () => {
    const { doFetch } = fakeRegister([row('8 Tyfica Road')], { C1: '70' });
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch)).toMatchObject({ ok: true, sqm: 70 });
  });

  it('takes the NEWEST certificate and says others existed', async () => {
    const { doFetch } = fakeRegister(
      [row('8 Tyfica Road', 'OLD', '2011-01-01'), row('8 Tyfica Road', 'NEW', '2024-01-01')],
      { OLD: 70, NEW: 70 },
    );
    const got = await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch);
    expect(got).toMatchObject({ ok: true, certificateNumber: 'NEW', supersededOthers: true });
  });

  it('ONE home re-measured takes the newest figure, and says older ones exist', async () => {
    // A real case: 9 Llewellyn Circle, SA1 6SN has certificates from 2011, 2013
    // and 2026 saying 79, 79 and 70. That is one house re-measured, not a
    // disagreement between properties — so the current certificate wins, and
    // the UI says "Newest certificate used" rather than picking in silence.
    const { doFetch } = fakeRegister(
      [row('8 Tyfica Road', 'OLD', '2011-01-01'), row('8 Tyfica Road', 'NEW', '2024-01-01')],
      { OLD: 79, NEW: 70 },
    );
    const got = await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch);
    expect(got).toMatchObject({ ok: true, sqm: 70, certificateNumber: 'NEW', supersededOthers: true });
  });

  it('DIFFERENT addresses sharing a house number refuse, and say the sizes', async () => {
    // Two streets in one postcode both have an "8". Picking either would hand
    // back a stranger's floor area.
    const { doFetch } = fakeRegister(
      [row('8 Tyfica Road', 'A', '2024-01-01'), row('8 Church Lane', 'B', '2023-01-01')],
      { A: 70, B: 95 },
    );
    const got = await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch);
    expect(got.ok).toBe(false);
    expect(got).toMatchObject({ reason: 'ambiguous' });
    expect((got as { disagreeingSqm?: number[] }).disagreeingSqm?.sort()).toEqual([70, 95]);
  });

  it('asking for a building that is divided into flats is ambiguous, not "no match"', async () => {
    const { doFetch } = fakeRegister(
      [row('Flat 1, 8 Tyfica Road', 'A'), row('Flat 2, 8 Tyfica Road', 'B')],
      { A: 40, B: 45 },
    );
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it('finds the one flat asked for', async () => {
    const { doFetch } = fakeRegister(
      [row('Flat 1, 8 Tyfica Road', 'A'), row('Flat 2, 8 Tyfica Road', 'B')],
      { A: 40, B: 45 },
    );
    expect(await lookupFromRegister('CF37 1DL', { paon: '8', saon: 'Flat 2' }, 'tok', doFetch))
      .toMatchObject({ ok: true, sqm: 45 });
  });
});

describe('every failure says its own true thing', () => {
  const failing = (res: () => Response) => (async () => res()) as unknown as typeof fetch;

  it('a Scottish postcode never even calls the register', async () => {
    let called = false;
    const doFetch = (async () => { called = true; return ok({ data: [] }); }) as unknown as typeof fetch;
    expect(await lookupFromRegister('EH1 1YZ', { paon: '8' }, 'tok', doFetch))
      .toEqual({ ok: false, reason: 'outside-ew' });
    expect(called, 'no point asking a register that does not cover Scotland').toBe(false);
  });

  it('a rate limit says so — it is not the address’s fault', async () => {
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', failing(() => status(429))))
      .toEqual({ ok: false, reason: 'rate-limited' });
  });

  it('the register being down is OUR problem, reported as unavailable', async () => {
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', failing(() => status(500))))
      .toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a network throw is unavailable, never a no-match', async () => {
    const doFetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a postcode with no certificates is a no-match, NOT "check your postcode"', async () => {
    // The register 404s, or returns an empty list, whenever it holds no
    // certificate for the query. That is a statement about certificates. Saying
    // "we do not hold that postcode" to someone whose postcode is perfectly
    // right is exactly the blame this sprint set out to remove.
    const { doFetch } = fakeRegister([], {});
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toEqual({ ok: false, reason: 'no-match' });
    const four04 = (async () => status(404)) as unknown as typeof fetch;
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', four04))
      .toEqual({ ok: false, reason: 'no-match' });
  });

  it('TD15 (Berwick-upon-Tweed) is ENGLAND and must reach the register', () => {
    // TD straddles the border. Listing it as "outside England and Wales"
    // rejected English addresses AND suppressed the sold-data fallback, so
    // those addresses lost an answer they used to get.
    expect(outsideEnglandWales('TD15 1AA')).toBe(false);
    expect(outsideEnglandWales('TD12 4AA')).toBe(false);
  });

  it('one property re-certified is NOT refused because a line carries the town', async () => {
    // The register puts the post town in a spare address line inconsistently,
    // so "215 NORTH ROAD" and "215 NORTH ROAD CARDIFF" are one property. The
    // UPRN it hands back on every row settles it without guessing.
    const withTown = [
      { ...row('215 North Road', 'NEW', '2024-01-01'), uprn: 100100, addressLine2: 'Cardiff' },
      { ...row('215 North Road', 'OLD', '2012-01-01'), uprn: 100100 },
    ];
    const { doFetch } = fakeRegister(withTown, { NEW: 96, OLD: 91 });
    expect(await lookupFromRegister('CF37 1DL', { paon: '215' }, 'tok', doFetch))
      .toMatchObject({ ok: true, sqm: 96, certificateNumber: 'NEW', supersededOthers: true });
  });

  it('different UPRNs sharing a house number still refuse', async () => {
    const two = [
      { ...row('8 Tyfica Road', 'A', '2024-01-01'), uprn: 111 },
      { ...row('8 Church Lane', 'B', '2023-01-01'), uprn: 222 },
    ];
    const { doFetch } = fakeRegister(two, { A: 70, B: 95 });
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it('A FLAT IS NEVER RETURNED AS THE BUILDING, whichever way it is written', async () => {
    // "8 Tyfica Road, Flat 2" satisfies a plain prefix match on "8". Without a
    // guard the flat's area is handed back as the whole building's — a wrong
    // number, stated confidently, straight into the Deal Score.
    for (const layout of ['8 Tyfica Road, Flat 2', 'Flat 2, 8 Tyfica Road', '8 Tyfica Road Apartment 2']) {
      const { doFetch } = fakeRegister([row(layout, 'F', '2024-01-01')], { F: 38 });
      expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch), layout)
        .toMatchObject({ ok: false, reason: 'ambiguous' });
    }
  });

  it('a postcode it holds, without OUR address, is a real no-match', async () => {
    const { doFetch } = fakeRegister([row('10 Tyfica Road')], { C1: 70 });
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toEqual({ ok: false, reason: 'no-match' });
  });

  it('nonsense instead of JSON is unavailable, not a wrong number', async () => {
    const doFetch = (async () => new Response('<html>down for maintenance</html>', { status: 200 })) as unknown as typeof fetch;
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a certificate with no floor area is a no-match, not a zero', async () => {
    const { doFetch } = fakeRegister([row('8 Tyfica Road')], { C1: null });
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toEqual({ ok: false, reason: 'no-match' });
  });
});

describe('the cache', () => {
  it('keys on the normalised address, so spelling cannot fork a row', () => {
    expect(cacheKey('CF37 1DL', { paon: '8', saon: 'Flat 2' }))
      .toBe(cacheKey('CF37 1DL', { paon: ' 8 ', saon: 'flat  2' }));
  });

  it('a flat and its building are different rows', () => {
    expect(cacheKey('CF37 1DL', { paon: '8' })).not.toBe(cacheKey('CF37 1DL', { paon: '8', saon: 'Flat 2' }));
  });

  it('NEVER caches our own failures — an outage must not become a fortnight of lies', () => {
    expect(worthCaching({ ok: false, reason: 'unavailable' })).toBe(false);
    expect(worthCaching({ ok: false, reason: 'rate-limited' })).toBe(false);
    expect(worthCaching({ ok: false, reason: 'needs-postcode' })).toBe(false);
    expect(worthCaching({ ok: false, reason: 'outside-ew' })).toBe(false);
    // A malformed postcode never reached the register, so there is nothing of
    // the register's to remember — and it was the cheapest junk row to create.
    expect(worthCaching({ ok: false, reason: 'unknown-postcode' })).toBe(false);
  });

  it('caches what the register actually said about the address', () => {
    expect(worthCaching({ ok: true, sqm: 70, source: 'register' })).toBe(true);
    expect(worthCaching({ ok: false, reason: 'no-match' })).toBe(true);
    expect(worthCaching({ ok: false, reason: 'ambiguous' })).toBe(true);
  });
});

describe('a divided building never gets a single figure', () => {
  it('a block with flats AND a bare building certificate still refuses', async () => {
    // Real case: 38 Hide Hill, TD15 1AB has six flats on the register plus two
    // certificates addressed just "38 Hide Hill" — which are units, not the
    // whole building. Answering with one gave 37 m² for a building of six flats.
    const rows = [
      { ...row('Flat 1', 'F1'), addressLine2: '38 Hide Hill' },
      { ...row('Flat 2', 'F2'), addressLine2: '38 Hide Hill' },
      row('38 Hide Hill', 'B1', '2022-01-01'),
    ];
    const { doFetch } = fakeRegister(rows, { F1: 49, F2: 51, B1: 37 });
    expect(await lookupFromRegister('TD15 1AB', { paon: '38' }, 'tok', doFetch))
      .toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it('but naming the flat still answers', async () => {
    const rows = [
      { ...row('Flat 1', 'F1'), addressLine2: '38 Hide Hill' },
      { ...row('Flat 2', 'F2'), addressLine2: '38 Hide Hill' },
      row('38 Hide Hill', 'B1', '2022-01-01'),
    ];
    const { doFetch } = fakeRegister(rows, { F1: 49, F2: 51, B1: 37 });
    expect(await lookupFromRegister('TD15 1AB', { paon: '38', saon: 'Flat 2' }, 'tok', doFetch))
      .toMatchObject({ ok: true, sqm: 51 });
  });

  it('an undivided house is untouched by the rule', async () => {
    const { doFetch } = fakeRegister([row('8 Tyfica Road')], { C1: 70 });
    expect(await lookupFromRegister('CF37 1DL', { paon: '8' }, 'tok', doFetch))
      .toMatchObject({ ok: true, sqm: 70 });
  });
});
