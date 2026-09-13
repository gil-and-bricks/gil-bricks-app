/**
 * R2 — what each region is CALLED on the page. The ids and the geography live
 * in @gil-bricks/core (refurb/region.ts); these are the words, so a rename is a
 * copy change and never a data change.
 */
import { REGION_IDS, type RegionId } from '@gil-bricks/core';

export const REGION_LABELS: Record<RegionId, string> = {
  london: 'London',
  'south-east': 'the South East',
  'east-of-england': 'the East of England',
  'south-west': 'the South West',
  'east-midlands': 'the East Midlands',
  'west-midlands': 'the West Midlands',
  'yorkshire-humber': 'Yorkshire and the Humber',
  'north-west': 'the North West',
  'north-east': 'the North East',
  wales: 'Wales',
};

/** Every region has a label and every label a region. Proved by a test. */
export function labelsCoverEveryRegion(): boolean {
  return REGION_IDS.every((id) => (REGION_LABELS[id] ?? '').trim() !== '')
    && Object.keys(REGION_LABELS).length === REGION_IDS.length;
}
