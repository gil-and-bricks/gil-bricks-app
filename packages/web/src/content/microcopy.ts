/**
 * Single source of truth for the small 'i' tooltip texts (S8.1). EDIT COPY
 * HERE — components read by key, so you never touch a component to reword a
 * tooltip. Rules: max ~20 words each; plain English for a complete beginner;
 * every acronym expanded on first use; never define jargon with jargon.
 *
 * (Per-strategy input tooltips stay in src/config/strategies — that is the
 * operator-editable home for strategy copy, golden rule 2. This file holds the
 * SHARED tooltips: the subject form, Area Data, comparables and account.)
 *
 * Mirrored for review in docs/MICROCOPY.md.
 */
export const microcopy: Record<string, string> = {
  // --- Subject property form ---
  'subject.postcode': 'The property’s full postcode, like CF37 1HR. We use it to find nearby sold prices.',
  'subject.price': 'The asking price, or the price you’ve agreed to pay, in pounds.',
  'subject.paon': 'The house number or name. It lets us look up this property’s own past sale prices.',
  'subject.type': 'Detached, semi-detached, terraced or a flat — used to compare like with like.',
  'subject.area':
    'The inside floor area in square metres. You’ll find it on the property’s EPC (Energy Performance Certificate).',
  'subject.beds': 'Number of bedrooms. Shown for context only — it never changes the valuation.',
  'subject.baths': 'Number of bathrooms. Shown for context only.',
  'subject.refurb': 'Roughly how much work it needs before you could let it out or sell it.',
  'subject.age': 'Roughly when it was built. Context only.',
  'subject.garden': 'Whether it has a garden. Context only.',
  'subject.parking': 'Off-street parking spaces, like a drive or garage. Context only.',

  // --- Area Data ---
  'area.soldPrices': 'The middle of what actually sold near here recently — not asking prices, which are often higher.',
  'area.priceTrend':
    'The official UK House Price Index for the whole country. It shows the trend, not this exact street.',
  'area.marketActivity': 'How many homes actually completed a sale each month here, from HM Land Registry records.',
  'area.deprivation':
    'An official government score ranking areas by income, jobs, health and education. Not about any one street.',
  'area.crime': 'Crimes the police recorded near this postcode in one month, from the official police.uk data.',
  'area.flood':
    'Flood warnings in force right now only. It says nothing about the long-term flood risk of the property.',
  'area.whereSold': 'Every sale within a mile shown on the map. Tap a dot to see that sale.',

  // --- Comparables ---
  'comps.typical':
    'The typical sold price: we drop the cheapest and dearest quarter, then average the rest (the interquartile mean).',
  'comps.range80':
    '8 in 10 nearby sales fell in this range — the cheapest tenth and dearest tenth are left out.',
  'comps.persqft':
    'Price per square foot — a fair way to compare homes of different sizes.',

  // --- Account ---
  'account.marketing': 'Property tips and updates by email. Untick any time.',
};

/** Read a tooltip by key. Falls back to the key itself so a missing key is visible, never blank. */
export function tip(key: string): string {
  return microcopy[key] ?? key;
}
