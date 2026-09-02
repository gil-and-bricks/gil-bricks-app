import { describe, expect, it } from 'vitest';
import { isSupportedUrl } from '../src/supported';

/**
 * The panel-gating logic — verified against REAL portal URL strings (never
 * fetched). This is the machine-checkable half of "the panel offers itself on
 * Rightmove/Zoopla and is disabled elsewhere".
 */
describe('isSupportedUrl gates the panel to Rightmove and Zoopla only', () => {
  it('enables on real Rightmove URLs (any subdomain, http/https)', () => {
    expect(isSupportedUrl('https://www.rightmove.co.uk/properties/167112923')).toBe(true);
    expect(isSupportedUrl('https://rightmove.co.uk/')).toBe(true);
    expect(isSupportedUrl('http://www.rightmove.co.uk/property-for-sale/find.html')).toBe(true);
  });

  it('enables on real Zoopla URLs (any subdomain)', () => {
    expect(isSupportedUrl('https://www.zoopla.co.uk/for-sale/details/73975876/')).toBe(true);
    expect(isSupportedUrl('https://zoopla.co.uk/')).toBe(true);
  });

  it('disables everywhere else', () => {
    for (const u of [
      'https://example.com/',
      'https://www.example.com/rightmove.co.uk',      // path lookalike
      'https://rightmove.co.uk.evil.com/',            // suffix spoof
      'https://notrightmove.co.uk/',                  // not a subdomain boundary
      'https://www.onthemarket.com/',
      'chrome://newtab/',
      'about:blank',
      '',
      undefined,
    ]) {
      expect(isSupportedUrl(u), `should disable: ${String(u)}`).toBe(false);
    }
  });
});
