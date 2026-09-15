// @vitest-environment happy-dom
/**
 * X2 — THE FIVE FIELDS A LISTING IS SUPPOSED TO CARRY, AND THE THREE-WAY STATUS
 * THAT KEEPS THEM HONEST.
 *
 * These drive chips that will be printed on somebody else's page, saying the
 * listing does not give a thing. That is only fair to say when the portal
 * publishes the field and the agent left it blank. Two other cases must never
 * produce a chip:
 *
 *   - the portal does not publish the field at all (Zoopla and ground rent);
 *   - we failed to read the page and fell back to the meta tags.
 *
 * In both, the gap is OURS. Printing "no ground rent" because Zoopla does not
 * publish ground rent would be inventing a fact about somebody's lease out of
 * our own blind spot — and it would be printed next to their name, on their
 * agent's page.
 *
 * So every assertion here is about WHICH of the three statuses comes back, and
 * the tests are built so a change that collapsed `missing` and `unavailable`
 * together would fail loudly rather than quietly start accusing people.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractListing, portalForUrl, FALLBACK_CONFIG, type NormalisedListing } from './index';

const CORPUS = join(process.cwd(), 'fixtures', 'listings');

// Extraction must never touch the network, here as everywhere.
let netCalls = 0;
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (() => { netCalls += 1; throw new Error('NETWORK BLOCKED'); }) as unknown as typeof fetch;
});
afterAll(() => { globalThis.fetch = realFetch; });

function read(portal: 'rightmove' | 'zoopla', file: string, url: string): NormalisedListing {
  const w = new Window({
    url,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  w.document.write(readFileSync(join(CORPUS, portal, file), 'utf8'));
  const r = extractListing(portal, w.document as unknown as Document, FALLBACK_CONFIG, url);
  if (!r.ok) throw new Error(`${file} no longer extracts: ${r.reason}`);
  return r.listing;
}

const RM_LEASE = (): NormalisedListing =>
  read('rightmove', 'rightmove-reduced-terrace-leasehold.html', 'https://www.rightmove.co.uk/properties/167112923');
const RM_FREEHOLD = (): NormalisedListing =>
  read('rightmove', 'rightmove-reduced-detached-freehold.html', 'https://www.rightmove.co.uk/properties/88376352');
const RM_FLAT = (): NormalisedListing =>
  read('rightmove', 'rightmove-leasehold-flat-added.html', 'https://www.rightmove.co.uk/properties/159999001');
const ZP_AUCTION = (): NormalisedListing =>
  read('zoopla', 'zoopla-auction-terrace-floorplan.html', 'https://www.zoopla.co.uk/for-sale/details/73975876/');
const ZP_SEMI = (): NormalisedListing =>
  read('zoopla', 'zoopla-newbuild-semi-floorplan.html', 'https://www.zoopla.co.uk/for-sale/details/73379642/');
const ZP_HMO = (): NormalisedListing =>
  read('zoopla', 'zoopla-newhome-6bed-hmo-candidate.html', 'https://www.zoopla.co.uk/for-sale/details/73981776/');

describe('what Rightmove publishes, it is read from', () => {
  it('reads the EPC certificate the listing carries', () => {
    const l = RM_LEASE();
    expect(l.epcUrls.status).toBe('found');
    expect(l.epcUrls.value).toHaveLength(1);
    expect(l.epcUrls.value?.[0]).toMatch(/^https:\/\/media\.rightmove\.co\.uk\/property-epc\//);
  });

  it('reads the council tax band, and two listings do not share one', () => {
    expect(RM_LEASE().councilTaxBand).toEqual({ value: 'B', status: 'found' });
    // A second, different band — so "found" cannot be passing on a constant.
    expect(RM_FREEHOLD().councilTaxBand).toEqual({ value: 'G', status: 'found' });
  });

  /**
   * "DELETED" IS NOT A BAND. Rightmove writes that sentinel where a band has
   * been withdrawn, and an earlier cut of this accepted it — which would have
   * printed "Council tax band DELETED" at somebody.
   */
  it('refuses Rightmove’s DELETED sentinel rather than showing it as a band', () => {
    const l = RM_FLAT();
    expect(l.councilTaxBand.status).toBe('missing');
    expect(l.councilTaxBand.value).toBeNull();
  });

  /**
   * ZERO YEARS IS NOT A LEASE. Rightmove writes 0 into
   * `yearsRemainingOnLease` when nobody filled it in — on a LEASEHOLD property,
   * which is exactly where a lease length matters most.
   */
  it('a leasehold listing with no lease length says missing, not zero years', () => {
    const l = RM_LEASE();
    expect(l.tenure.value).toBe('LEASEHOLD');
    expect(l.leaseYearsRemaining.status).toBe('missing');
    expect(l.leaseYearsRemaining.value).toBeNull();
  });

  it('ground rent and service charge the agent left blank are missing', () => {
    const l = RM_LEASE();
    expect(l.annualGroundRent.status).toBe('missing');
    expect(l.annualServiceCharge.status).toBe('missing');
  });
});

describe('what Zoopla publishes, and what it does not', () => {
  it('reads the council tax band where Zoopla gives one', () => {
    expect(ZP_AUCTION().councilTaxBand).toEqual({ value: 'E', status: 'found' });
    expect(ZP_HMO().councilTaxBand).toEqual({ value: 'C', status: 'found' });
  });

  /**
   * Zoopla prints the words "Not available" as the VALUE when an agent has not
   * supplied a band. That is the LISTING saying it does not know — which is a
   * fair thing to point out — and not the portal failing to publish.
   */
  it('treats Zoopla’s literal “Not available” as the listing not giving one', () => {
    const l = ZP_SEMI();
    expect(l.councilTaxBand.status).toBe('missing');
    expect(l.councilTaxBand.value, 'and never prints those words as a band').toBeNull();
  });

  it('reads the EPC slot, and an empty one means the listing gave no certificate', () => {
    const l = ZP_SEMI();
    expect(l.epcUrls.status).toBe('found');
    expect(l.epcUrls.value).toEqual([]);
  });

  /**
   * THE ONE THAT MATTERS MOST. Zoopla publishes nothing at all for these three.
   * `missing` would mean the agent left them blank; it would raise a chip on
   * every Zoopla listing in the country, accusing every agent of an omission
   * that is really our own blind spot.
   */
  it.each(['leaseYearsRemaining', 'annualGroundRent', 'annualServiceCharge'] as const)(
    'says %s is unavailable on Zoopla — never missing',
    (key) => {
      for (const l of [ZP_AUCTION(), ZP_SEMI(), ZP_HMO()]) {
        expect(l[key].status, `${key} on ${l.listingId.value}`).toBe('unavailable-on-this-portal');
        expect(l[key].status).not.toBe('missing');
      }
    },
  );
});

/**
 * THE TWO STATUSES MUST NOT BE COLLAPSED, and this is the test that says so
 * across the whole corpus rather than one field at a time. Every one of the six
 * real listings is read, and the set of statuses actually produced is compared
 * against what each portal can honestly know.
 */
describe('the corpus as a whole', () => {
  const ALL = () => [RM_LEASE(), RM_FREEHOLD(), RM_FLAT(), ZP_AUCTION(), ZP_SEMI(), ZP_HMO()];

  it('Rightmove never returns “unavailable” for a field it does publish', () => {
    for (const l of [RM_LEASE(), RM_FREEHOLD(), RM_FLAT()]) {
      for (const key of ['epcUrls', 'councilTaxBand', 'leaseYearsRemaining', 'annualGroundRent', 'annualServiceCharge'] as const) {
        expect(l[key].status, `${key} on ${l.listingId.value}`).not.toBe('unavailable-on-this-portal');
      }
    }
  });

  it('every one of the five fields is exercised in all three states somewhere', () => {
    const seen = new Set<string>();
    for (const l of ALL()) {
      for (const key of ['epcUrls', 'councilTaxBand', 'leaseYearsRemaining', 'annualGroundRent', 'annualServiceCharge'] as const) {
        seen.add(l[key].status);
      }
    }
    // If the corpus stopped covering one of these, the tests above would be
    // asserting against a narrower reality than the product meets.
    expect([...seen].sort()).toEqual(['found', 'missing', 'unavailable-on-this-portal']);
  });

  it('read nothing from the network', () => {
    ALL();
    expect(netCalls).toBe(0);
  });
});
