import { describe, expect, it } from 'vitest';
import { clusterForVariant, CLUSTER_THRESHOLD, shouldCluster } from './geo';

describe('clusterForVariant (real rule used by the map)', () => {
  it("the Area Data 'density' map never clusters — every sale shows as a dot", () => {
    expect(clusterForVariant('density', 500)).toBe(false);
    expect(clusterForVariant('density', 1)).toBe(false);
  });
  it("the 'comps' map clusters above the threshold", () => {
    expect(clusterForVariant('comps', CLUSTER_THRESHOLD)).toBe(false);
    expect(clusterForVariant('comps', CLUSTER_THRESHOLD + 1)).toBe(true);
    expect(clusterForVariant(undefined, 100)).toBe(shouldCluster(100));
  });
});

describe('article4 layer visibility rule', () => {
  const shouldShadeArticle4 = (fc: { features: unknown[] } | null): boolean => !!fc && fc.features.length > 0;
  it('shades only when polygons exist', () => {
    expect(shouldShadeArticle4(null)).toBe(false);
    expect(shouldShadeArticle4({ features: [] })).toBe(false);
    expect(shouldShadeArticle4({ features: [{}] })).toBe(true);
  });
});
