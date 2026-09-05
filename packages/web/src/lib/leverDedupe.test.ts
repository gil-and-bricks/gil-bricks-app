import { describe, expect, it } from 'vitest';
import { leverIsRedundant } from '../components/analyser/leverDedupe';

/**
 * The verdict card used to print the same fix twice (D1). It now hides the
 * lever ONLY when the binding note already names its figures — on Flip the two
 * sentences carry different numbers and both must survive.
 */
describe('the verdict never says the same fix twice — and never drops a different one', () => {
  const btlNote = 'What’s holding it back: After the mortgage, costs and tax, this leaves £70 a month — too thin. A £35,000 lower price or £290 more rent would turn this Green.';
  const flipNote = 'What’s holding it back: The return on the cash you’d tie up is only 12.3%. Pay no more than £111,500 to lift the return.';

  it('hides a lever whose figures the note already names', () => {
    expect(leverIsRedundant('A £35,000 lower price or £290 more rent a month would turn this Amber to Green.', btlNote)).toBe(true);
  });

  it('keeps a lever that names a DIFFERENT figure', () => {
    expect(leverIsRedundant('Max offer for a Green flip: £115,750 (£4,250 below the asking price).', flipNote)).toBe(false);
  });

  it('keeps the lever when there is no binding note at all', () => {
    expect(leverIsRedundant('Max offer for a Green flip: £115,750.', null)).toBe(false);
  });

  it('has nothing to show when there is no lever', () => {
    expect(leverIsRedundant(null, btlNote)).toBe(true);
    expect(leverIsRedundant('', btlNote)).toBe(true);
  });

  it('keeps a lever that carries no figure at all — it cannot be a repeat of the numbers', () => {
    expect(leverIsRedundant('Renegotiate the price.', btlNote)).toBe(false);
  });
});
