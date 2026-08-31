# Microcopy — every tooltip, for review

Edit the wording in `src/content/microcopy.ts` (this doc mirrors it). Max ~20 words each; acronyms expanded on first use.

| Key | Tooltip text |
|---|---|
| `subject.postcode` | The property’s full postcode, like CF37 1HR. We use it to find nearby sold prices. |
| `subject.price` | The asking price, or the price you’ve agreed to pay, in pounds. |
| `subject.paon` | The house number or name. It lets us look up this property’s own past sale prices. |
| `subject.type` | Detached, semi-detached, terraced or a flat — used to compare like with like. |
| `subject.area` | The inside floor area in square metres. You’ll find it on the property’s EPC (Energy Performance Certificate). |
| `subject.beds` | Number of bedrooms. Shown for context only — it never changes the valuation. |
| `subject.baths` | Number of bathrooms. Shown for context only. |
| `subject.refurb` | Roughly how much work it needs before you could let it out or sell it. |
| `subject.age` | Roughly when it was built. Context only. |
| `subject.garden` | Whether it has a garden. Context only. |
| `subject.parking` | Off-street parking spaces, like a drive or garage. Context only. |
| `area.soldPrices` | The middle of what actually sold near here recently — not asking prices, which are often higher. |
| `area.priceTrend` | The official UK House Price Index for the whole country. It shows the trend, not this exact street. |
| `area.marketActivity` | How many homes actually completed a sale each month here, from HM Land Registry records. |
| `area.deprivation` | An official government score ranking areas by income, jobs, health and education. Not about any one street. |
| `area.crime` | Crimes the police recorded near this postcode in one month, from the official police.uk data. |
| `area.flood` | Flood warnings in force right now only. It says nothing about the long-term flood risk of the property. |
| `area.whereSold` | Every sale within a mile shown on the map. Tap a dot to see that sale. |
| `comps.typical` | The typical sold price: we drop the cheapest and dearest quarter of sales, then average the rest (the interquartile mean, IQM). |
| `comps.range80` | 8 in 10 nearby sales fell in this range — the cheapest tenth and dearest tenth are left out. |
| `comps.persqft` | Price per square foot of floor space — a fair way to compare homes of different sizes. Needs a known floor area. |
| `account.marketing` | Tick to get property tips and updates by email. Untick any time — we tell our email provider to stop. |

Strategy input tooltips live in `src/config/strategies/index.ts` (per-strategy, golden rule 2); acronyms there (ICR, LTV, GDV, ARV, C4, EICR, HMO) are expanded on first use.
