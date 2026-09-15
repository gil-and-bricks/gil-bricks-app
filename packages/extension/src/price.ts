/**
 * X4 — THE PRICE POSITION, FOR THE PAGE THE PERSON IS ACTUALLY ON.
 *
 * ── WHY THIS IS NOT IN `entrypoints/content.ts` ─────────────────────────────
 * The content-script entry point imports WXT's `#imports` virtual module, which
 * does not resolve outside a WXT build — so nothing in that file can be driven
 * by a test. This is the half that needs proving: it and the side panel must
 * produce the SAME comparison for the same property, and "must" is worth
 * nothing unless something checks. See `tests/bandAgrees.test.ts`.
 */
import {
  getManifest, getSector, getSectorsIndex, nearestSectors, postcodeToSector,
  bandForListing, salesFromSector, floorAreaFromSector, subjectPointFor,
  type BandOutcome, type BandSale, type NormalisedListing, type SectorFile,
} from '@gil-bricks/core';
import { lookupEpcArea } from './epcLookup';

/**
 * WHAT IT DOES.
 *
 * Everything else the extension puts on a portal's page is a worry or a gap.
 * This is the one thing that is neither, and the one thing nobody else can
 * give them: the asking price against what similar-sized homes of the same type
 * actually SOLD for nearby — Land Registry joined to EPC floor areas.
 *
 * TWO CHEAP READS, BOTH ALREADY PERMITTED. The sector file is 3-4KB and the data
 * host answers `access-control-allow-origin: *`, so a content script may fetch
 * it directly; the EPC lookup goes through our own Worker on proplaunch.ai,
 * which is already in host_permissions. Nothing new is asked for.
 *
 * IT REFUSES OFTEN, AND THAT IS THE DESIGN. No floor area, fewer than five
 * comparable sales, a spread too wide to have a middle — each returns null and
 * the box simply carries the chips. A missing line is a state, not a failure.
 */
/**
 * The three reads this needs, injectable so a test can drive the real function
 * rather than a rearrangement of it.
 */
export interface PriceDeps {
  sector: (sectorId: string) => Promise<SectorFile>;
  /**
   * C1 — where the property is, so the same half-mile rule the analyser and the
   * pack work to can be applied here too. It resolves through core's ONE
   * helper, never a second copy: two answers to "where is this property" is the
   * shape of fault that put a widened range on the panel and "too few" in this
   * box, on the same screen, for the same house.
   */
  subjectAt: (postcode: string) => Promise<{ lat: number; lng: number } | null>;
  /**
   * C1 — the month the sold data runs to. The window counts back from THIS and
   * not from today, exactly as the analyser's does; counting from today
   * shortened it by however far behind the pipeline happened to be.
   */
  asOf: () => Promise<string | null>;
  epcArea: (postcode: string, paon: string, saon: string) => Promise<number | null>;
  widerSales: (sectorId: string) => Promise<BandSale[]>;
  now: () => Date;
}

const LIVE: PriceDeps = {
  sector: getSector,
  subjectAt: subjectPointFor,
  asOf: async () => getManifest().then((m) => m.ppdMonth, () => null),
  epcArea: async (postcode, paon, saon) => {
    const got = await lookupEpcArea(postcode, paon, saon);
    return got.ok && got.source === 'register' ? got.sqm : null;
  },
  /**
   * X5 — THE BOX WIDENS TOO, BECAUSE THE PANEL DOES.
   *
   * It did not, and that was a live divergence: on one real listing with one
   * sector the panel returned a widened range while this returned "too few" —
   * same property, same data, two answers on two surfaces a person can have
   * open at once. Each neighbouring sector is 3-4KB and this runs only after
   * the subject's own has already fallen short.
   */
  widerSales: async (sectorId) => {
    const index = await getSectorsIndex();
    const files = await Promise.all(nearestSectors(index, sectorId).map((id) => getSector(id).catch(() => null)));
    const out: BandSale[] = [];
    for (const f of files) if (f) out.push(...salesFromSector(f));
    return out;
  },
  now: () => new Date(),
};

export async function priceFor(listing: NormalisedListing, deps: PriceDeps = LIVE): Promise<BandOutcome | null> {
  try {
    const postcode = listing.postcode.value;
    if (!postcode || !listing.askingPrice.value) return null;
    const pc = postcodeToSector(postcode);
    if (!pc.inEnglandWales) return null;

    // The listing's own size where it gives one; the EPC register where it does
    // not. We never ask the person for it — that is ours to fetch.
    let registerAreaSqm: number | null = null;
    if (listing.floorAreaSqm.status !== 'found' && listing.address.value?.paon) {
      registerAreaSqm = await deps.epcArea(postcode, listing.address.value.paon, listing.address.value.saon ?? '');
    }

    // C1 — the sector and the subject's point together, because the band needs
    // both to apply the half-mile rule, and the panel fetches them together too.
    const [sector, subjectAt, asOf] = await Promise.all([
      deps.sector(pc.sector), deps.subjectAt(postcode), deps.asOf(),
    ]);
    const now = deps.now();
    // THE ONE ASSEMBLY, shared with the panel. See `bandForListing`.
    const first = bandForListing({ listing, sector, registerAreaSqm, subjectAt, asOf, now }, floorAreaFromSector);
    if (first.band.kind !== 'none' || first.band.reason !== 'too-few') return first.band;

    // Only now is a widening worth its fetches — and the panel widens here too.
    const widerSales = await deps.widerSales(pc.sector);
    if (widerSales.length === 0) return first.band;
    return bandForListing(
      { listing, sector, registerAreaSqm, widerSales, subjectAt, asOf, now }, floorAreaFromSector,
    ).band;
  } catch {
    // A page we do not own is the last place to surface our own plumbing.
    return null;
  }
}

