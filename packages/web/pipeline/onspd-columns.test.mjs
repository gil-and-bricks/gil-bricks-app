import { describe, expect, it } from 'vitest';
import { csvHeader, onspdColumn } from './onspd-columns.mjs';

/**
 * The monthly data refresh died on 2026-09-09 because ONSPD's August 2026
 * edition renamed ctry25cd to ctry26cd and the build had the old name typed in.
 * It would have failed the same way on the 2 October cron.
 */
describe('resolving an ONSPD column whose name carries a year', () => {
  const AUG26 = csvHeader('pcd,pcd2,pcds,dointr,doterm,lat,long,ctry26cd,cty26cd,ced25cd,itl25cd,lsoa21cd,msoa21cd');
  const OLD = csvHeader('pcds,lat,long,ctry25cd,lsoa11cd');

  it('finds the country column in the edition that broke the build', () => {
    expect(onspdColumn(AUG26, 'ctry')).toBe('ctry26cd');
  });

  it('and still finds it in the edition that worked before', () => {
    expect(onspdColumn(OLD, 'ctry')).toBe('ctry25cd');
  });

  it('takes the NEWEST when an edition carries two', () => {
    expect(onspdColumn(csvHeader('pcds,ctry25cd,ctry26cd'), 'ctry')).toBe('ctry26cd');
  });

  it('resolves the LSOA column too — the same hazard, the same query', () => {
    expect(onspdColumn(AUG26, 'lsoa')).toBe('lsoa21cd');
    expect(onspdColumn(OLD, 'lsoa')).toBe('lsoa11cd');
  });

  it('does not confuse a column that merely starts the same way', () => {
    // cty26cd is COUNTY. Matching it as the country would silently ship the
    // wrong England & Wales gate, which is worse than failing.
    expect(onspdColumn(AUG26, 'ctry')).not.toBe('cty26cd');
    expect(() => onspdColumn(csvHeader('pcds,cty26cd'), 'ctry')).toThrow(/no ctryNNcd/);
  });

  it('THROWS when the column is gone — the country gate must never be guessed', () => {
    expect(() => onspdColumn(csvHeader('pcds,lat,long'), 'ctry')).toThrow(/no ctryNNcd/);
  });

  it('reads a header past a BOM and quoted names', () => {
    expect(csvHeader('﻿"pcds","lat","ctry26cd"')).toEqual(['pcds', 'lat', 'ctry26cd']);
  });
});
