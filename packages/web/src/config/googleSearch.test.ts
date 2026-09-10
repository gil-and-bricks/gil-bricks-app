import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compLinks, fullAddress, googleSearchUrl, identifiesAProperty } from '@gil-bricks/core';
import { SUBJECT_FORM } from './analyserForm';
import { COMPARABLES } from './comparables';
import { features } from './features';

/**
 * WHAT WE SEARCH FOR, AND FOR WHAT (E10).
 *
 * The operator thought a comparable row was searching a street without its door
 * number. It was not — across 804 real sales in twelve sectors, Land Registry
 * populated PAON on every one, and the row has always carried it. What was
 * genuinely missing was a search for the SUBJECT: the one property the person
 * came here about, and the only address they typed themselves.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string): string => readFileSync(`${src}${p}`, 'utf8');
const q = (url: string): string => decodeURIComponent(url.split('q=')[1] ?? '');
/** The file that explains why it uses no street must be free to say the word. */
const strip = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('a comparable row searches the WHOLE address', () => {
  it('house number, street and postcode — the shape of most records', () => {
    const c = { saon: '', paon: '6', street: 'VAUGHAN STREET', postcode: 'CF37 1HR' };
    expect(q(compLinks('{x}', c).google)).toBe('6 VAUGHAN STREET CF37 1HR');
  });

  it('the flat number too, which is 55% of the records we hold', () => {
    const c = { saon: 'FLAT 37', paon: 'MOORE HOUSE', street: 'CASSILIS ROAD', postcode: 'E14 9LN' };
    expect(q(compLinks('{x}', c).google)).toBe('FLAT 37 MOORE HOUSE CASSILIS ROAD E14 9LN');
  });

  it('a named building with NO street is searched by its name, not dropped', () => {
    const c = { saon: '', paon: 'GELLIWION FARM', street: '', postcode: 'CF37 1QB' };
    expect(q(compLinks('{x}', c).google)).toBe('GELLIWION FARM CF37 1QB');
  });

  it('the number is never lost to an empty field between it and the postcode', () => {
    expect(fullAddress({ saon: '', paon: '6', street: '', postcode: 'CF37 1HR' })).toBe('6 CF37 1HR');
    expect(fullAddress({ saon: null, paon: '6', street: null, postcode: 'CF37 1HR' })).toBe('6 CF37 1HR');
  });
});

describe('nothing searches a street and calls it a house', () => {
  it('a record naming no property is not searchable', () => {
    expect(identifiesAProperty({ saon: '', paon: '' })).toBe(false);
    expect(identifiesAProperty({ saon: null, paon: null })).toBe(false);
    expect(identifiesAProperty({ saon: '  ', paon: '  ' })).toBe(false);
  });

  it('but a house number, or a flat number alone, is', () => {
    expect(identifiesAProperty({ saon: '', paon: '6' })).toBe(true);
    expect(identifiesAProperty({ saon: 'FLAT 2', paon: '' })).toBe(true);
  });

  it('and the row withholds the Google button in that case', () => {
    const mod = read('components/analyser/CompsModule.tsx');
    expect(mod).toContain('const named = identifiesAProperty({ saon: c.saon, paon: c.paon });');
    const actions = mod.slice(mod.indexOf('function CompActions'), mod.indexOf('export function CompsModule'));
    expect(actions, 'the Google link is behind the guard').toMatch(/\{named && \(\s*<a href=\{links\.google\}/);
    expect(actions, 'the Land Registry record is NOT — that is keyed by sale id, not by address')
      .toMatch(/<a href=\{links\.landRegistry\}/);
  });
});

describe('the subject property has its own lookup', () => {
  const sub = read('components/analyser/SubjectLookup.tsx');

  it('it searches what the person TYPED, and nothing inferred', () => {
    expect(q(googleSearchUrl(fullAddress({ saon: '', paon: '6', postcode: 'CF37 1HR' })))).toBe('6 CF37 1HR');
    expect(q(googleSearchUrl(fullAddress({ saon: 'FLAT 2', paon: '8', postcode: 'CF37 1DL' })))).toBe('FLAT 2 8 CF37 1DL');
    expect(strip(sub), 'no street is invented from the comps that share the postcode').not.toMatch(/\bstreet\b/i);
  });

  it('with no house number it says what it needs, and offers nothing', () => {
    expect(sub).toContain('identifiesAProperty(parts)');
    expect(sub).toContain('SUBJECT_FORM.lookup.needsNumber');
    expect(SUBJECT_FORM.lookup.needsNumber).toBe('Add the house number to look this property up.');
  });

  it('and says nothing at all before a postcode is typed', () => {
    expect(sub).toContain("s.postcode.trim() === ''\n      ? null");
  });

  it('opens in a new tab, so the analysis in progress survives', () => {
    expect(sub).toContain('target="_blank"');
    expect(sub).toContain('rel="noopener"');
  });

  it('is named for the property, so it cannot read as a comparable', () => {
    expect(SUBJECT_FORM.lookup.full('6 CF37 1HR')).toBe('Search Google for 6 CF37 1HR');
  });

  it('lives in the property card, under the address they typed', () => {
    const app = read('components/analyser/AnalyserApp.tsx');
    const card = app.slice(app.indexOf('id="sec-property"'), app.indexOf('</section>', app.indexOf('id="sec-property"')));
    expect(card).toContain('<SubjectLookup />');
    expect(card.indexOf('<SubjectForm'), 'after the form, not before it').toBeLessThan(card.indexOf('<SubjectLookup'));
    expect(typeof features.subjectLookup).toBe('boolean');
  });
});

describe('one place builds a Google URL', () => {
  it('the row, the popup and the subject all go through it', () => {
    expect(googleSearchUrl('6 CF37 1HR')).toBe('https://www.google.com/search?q=6%20CF37%201HR');
    const links = read('../../core/src/comparables/links.ts');
    expect(links, 'compLinks uses the shared builder').toContain('google: googleSearchUrl(fullAddress(address))');
    const map = read('components/analyser/mapImpl.ts');
    expect(map, 'the popup uses compLinks, so it carries the same full address').toContain('compLinks(c.id, {');
  });
});

/**
 * WHICH BUTTON FINDS WHAT (E11).
 *
 * Google and the Land Registry record reach that exact house; Rightmove and
 * Zoopla reach only the postcode's sold prices. Four identical buttons in a row
 * hid that: the operator pressed a postcode one, got a street back, and
 * reasonably concluded our data had lost the door number. Grouping says it once
 * for the whole table instead of explaining it on every row.
 */
describe('a row shows which lookups find the property and which find the area', () => {
  const mod = read('components/analyser/CompsModule.tsx');

  it('the property lookups and the area lookups are SEPARATE columns', () => {
    const head = mod.slice(mod.indexOf('<thead>'), mod.indexOf('</thead>'));
    expect(head).toContain('{COMPARABLES.table.thisProperty}');
    expect(head).toContain('{COMPARABLES.table.thisPostcode}');
    const body = mod.slice(mod.indexOf('<tbody>'), mod.indexOf('</tbody>'));
    expect(body).toContain('<CompActions c={c} scope="property" />');
    expect(body).toContain('<CompActions c={c} scope="postcode" />');
  });

  it('and the right buttons are in the right one', () => {
    const fn = mod.slice(mod.indexOf('function CompActions'), mod.indexOf('export function CompsModule'));
    const property = fn.slice(fn.indexOf("if (scope === 'property')"), fn.lastIndexOf('return ('));
    expect(property, 'the Land Registry record is that sale').toContain('links.landRegistry');
    expect(property, 'and Google searches the full address').toContain('links.google');
    expect(property, 'the portals can only reach a postcode').not.toContain('rightmoveSoldPrices');
    expect(property).not.toContain('zooplaSoldPrices');
    const area = fn.slice(fn.lastIndexOf('return ('));
    expect(area).toContain('links.rightmoveSoldPrices');
    expect(area).toContain('links.zooplaSoldPrices');
    expect(area, 'no property lookup hides among the area ones').not.toContain('links.google');
  });

  it('the two words are DEFINED ONCE and reused, never retyped', () => {
    expect(COMPARABLES.table.thisProperty).toBe('This property');
    expect(COMPARABLES.table.thisPostcode).toBe('This postcode');
    const map = read('components/analyser/mapImpl.ts');
    expect(map, 'the popup reads from the same key as the table')
      .toContain('COMPARABLES.table.thisProperty');
    expect(map, 'and does not retype the phrase').not.toContain("'This property'");
  });

  it('the phone card carries the words too — it has no table header', () => {
    const cards = mod.slice(mod.indexOf('comp-cards'), mod.indexOf('table-wrap'));
    expect(cards).toContain('{COMPARABLES.table.thisProperty}');
    expect(cards).toContain('{COMPARABLES.table.thisPostcode}');
  });

  it('it stays a row of small actions: no sentence was added to any of them', () => {
    const A = COMPARABLES.actions;
    for (const label of [A.landRegistry, A.google, A.rightmove, A.zoopla]) {
      expect(label.split(/\s+/).length, `"${label}" is still one or two words`).toBeLessThanOrEqual(2);
    }
    expect(COMPARABLES.table.thisProperty.split(/\s+/).length).toBe(2);
    expect(COMPARABLES.table.thisPostcode.split(/\s+/).length).toBe(2);
  });
});
