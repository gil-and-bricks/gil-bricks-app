import { describe, expect, it, beforeEach } from 'vitest';
import { initProvenance, isFromExtension, markEdited, sourceFor, areaEpc } from './provenance';

describe('field provenance (E11)', () => {
  beforeEach(() => { initProvenance(''); });

  it('attributes origin ONLY for genuine extension arrivals (src=ext)', () => {
    // a plain shared/hand-edited link carries params but is NOT from the extension
    initProvenance('?postcode=CF37+1DL&price=150000&type=T');
    expect(isFromExtension()).toBe(false);
    expect(sourceFor('postcode')).toBeNull();
    expect(sourceFor('price')).toBeNull();
  });

  it('labels subject facts, area origin, deal inputs and settings from an extension arrival', () => {
    initProvenance('?postcode=CF37+1DL&price=150000&type=T&area=70&beds=3&rent=1100&deposit=25&areaSrc=listing&src=ext');
    expect(isFromExtension()).toBe(true);
    expect(sourceFor('postcode')).toBe('listing'); // subject fact read off the listing
    expect(sourceFor('price')).toBe('listing');
    expect(sourceFor('beds')).toBe('listing');
    expect(sourceFor('area')).toBe('listing'); // areaSrc=listing
    expect(sourceFor('rent')).toBe('carried');  // a deal input — origin (estimate/typed) not recoverable
    expect(sourceFor('deposit')).toBe('settings'); // an assumption = the user's extension settings
    expect(sourceFor('garden')).toBeNull(); // never prefilled → no badge
  });

  it('honours the area origin: carried when the listing had no floor area', () => {
    initProvenance('?area=70&areaSrc=carried&src=ext');
    expect(sourceFor('area')).toBe('carried'); // never claimed "from the listing"
  });

  it('a prefilled field the user overrides becomes "you typed it"', () => {
    initProvenance('?postcode=CF37+1DL&src=ext');
    expect(sourceFor('postcode')).toBe('listing');
    markEdited('postcode');
    expect(sourceFor('postcode')).toBe('typed');
  });

  it('an EPC lookup marks area as from EPC data', () => {
    initProvenance('?src=ext');
    areaEpc.value = true;
    expect(sourceFor('area')).toBe('epc');
  });
});
