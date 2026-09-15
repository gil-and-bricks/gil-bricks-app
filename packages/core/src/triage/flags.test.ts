/**
 * X1 — the flags, and above all the things they must never do.
 */
import { describe, expect, it } from 'vitest';
import { detectFlags } from './flags';

const ids = (t: string, extra = {}) => detectFlags({ text: t, ...extra }).map((f) => f.id);

describe('what the listing says', () => {
  it('detects each of the six from ordinary listing prose', () => {
    expect(ids('Offered leasehold with 82 years remaining')).toContain('leasehold');
    expect(ids('For sale by auction, a reservation fee applies')).toContain('auction');
    expect(ids('Sold with tenant in situ paying £750pcm')).toContain('tenantInSitu');
    expect(ids('Cash buyers only due to condition')).toContain('cashBuyers');
    expect(ids('A non-standard construction property of concrete')).toContain('nonStandardConstruction');
    expect(ids('A first floor flat above a shop')).toContain('commercialBelow');
  });

  it('NEVER reports the absence of anything', () => {
    /**
     * The half that is easy to get wrong. A description with no mention of
     * tenure does not make a property freehold — it makes the listing silent.
     * There is no negative flag and there must never be one.
     */
    const quiet = detectFlags({ text: 'A charming three bedroom family home with a garden.' });
    expect(quiet).toEqual([]);
    const all = JSON.stringify(detectFlags({ text: 'A lovely freehold home, no chain' }));
    expect(all).not.toMatch(/freehold|not |absent|none|clear/i);
  });

  it('carries the WORDS IT MATCHED, so the reader can judge the match', () => {
    const f = detectFlags({ text: 'Sold via the Modern Method of Auction' });
    expect(f[0]?.matched).toBe('modern method of auction');
  });

  it('prefers the more specific phrase — MMoA is not plain auction', () => {
    const f = detectFlags({ text: 'modern method of auction applies' }).find((x) => x.id === 'auction');
    expect(f?.matched).toBe('modern method of auction');
  });

  it('trusts the portal’s own fields, and still calls it what the LISTING says', () => {
    expect(ids('No prose about tenure here', { tenure: 'Leasehold' })).toContain('leasehold');
    expect(ids('No prose about a sale method', { isAuction: true })).toContain('auction');
  });

  it('caps at four — a panel of eight flags is a panel nobody reads', () => {
    const everything = 'leasehold auction tenant in situ cash buyers only '
      + 'non-standard construction above a shop';
    expect(detectFlags({ text: everything }).length).toBe(4);
    expect(detectFlags({ text: everything }, 6).length).toBe(6);
  });

  it('is case and curly-quote insensitive, because listings are written by people', () => {
    expect(ids('CASH BUYERS ONLY')).toContain('cashBuyers');
    expect(ids('subject to a buyer’s premium')).toContain('auction');
    expect(ids("subject to a buyer's premium")).toContain('auction');
  });

  it('survives empty and missing input without inventing anything', () => {
    expect(detectFlags({ text: '' })).toEqual([]);
    expect(detectFlags({ text: '', tenure: null, isAuction: null })).toEqual([]);
  });

  it('emits no endorsement word, on any input', () => {
    const out = JSON.stringify(detectFlags({
      text: 'A great value leasehold bargain, a safe opportunity, good area, cash buyers only',
    }, 9));
    expect(out).not.toMatch(/\b(good|great|bargain|safe|opportunity|value)\b/i);
  });
});
