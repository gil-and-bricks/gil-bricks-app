# The maths, in plain English

Every number the app shows comes from one of these functions
(`src/lib/maths/`), and each returns its working alongside the result — this
page doubles as the source for the 'i' tooltips. Definitions are LOCKED in
[definitions.md](definitions.md).

| What | How it's worked out | Worked example |
| --- | --- | --- |
| **Price per square metre** | price ÷ floor area (from the EPC) | £127,000 ÷ 79 sqm = **£1,608/sqm** |
| **Price per square foot** | price ÷ (floor area × 10.7639) | £127,000 ÷ 850.3 sqft = **£149/sqft** |
| **Gross yield** | annual rent ÷ price × 100 | £8,400 ÷ £100,000 = **8.4%** |
| **Net yield** | (annual rent − running costs) ÷ all-in cost × 100 | (£8,400 − £1,500) ÷ £110,000 = **6.3%** |
| **Monthly cashflow** | rent − mortgage − management − maintenance − insurance − voids | £700 − £320 − £84 − £50 − £20 − £35 = **£191/month** |
| **Mortgage (interest-only)** | loan × rate ÷ 12 | £75,000 × 5.5% ÷ 12 = **£344/month** |
| **Mortgage (repayment)** | standard repayment formula over the term | £75,000 at 5.5% over 25 years = **£461/month** |
| **ICR** (interest coverage ratio) | annual rent ÷ (loan × stress rate); meeting the threshold exactly passes | £8,400 ÷ (£75,000 × 5.5%) = **2.04** — passes 125% and 145% |
| **Total cash in** | deposit + stamp duty + legals + refurb + fees — stamp duty is always included | £25,000 + £5,000 + £1,500 + £15,000 + £2,000 = **£48,500** |
| **ROI** | annual net profit ÷ total cash in × 100 | £5,820 ÷ £48,500 = **12.0%** |
| **BRRRR money left in** (buy, refurbish, rent, refinance, repeat) | refinance proceeds (the share of the new value the lender advances) vs cash invested | £100,000 × 75% = £75,000 vs £60,000 in → **"All money out + £15,000"** |
| **Flip profit** | sale price − purchase − refurb − buying costs − finance costs − selling costs | £250,000 − £211,000 = **£39,000** (15.6% of the sale price, 18.9% on cash) |
| **Typical price** | average of the sold prices after setting aside the lowest and highest quarter (rounded down), with the 80% range (p10–p90) | 12 Pontypridd sales → **£137,575** (range £98,650–£206,300) |
| **Valuation range** | estimate ±5% (fairly reliable) / ±10% (less certain) / ±20% (rough guide) | £200,000 medium → **£180,000–£220,000** |
| **Tax — personal (Section 24)** | (rent − allowable costs) × your band, minus a 20% credit on mortgage interest (capped at the profit) | £10,000 × 40% − £800 = **£3,200/yr** |
| **Tax — limited company** | (rent − allowable costs − mortgage interest) × corporation tax, with marginal relief £50k–£250k | £6,000 × 19% = **£1,140/yr** |

Notes that apply throughout:
- Money shows as whole pounds (£1,234); percentages get one decimal.
- Rates will be entered as percentages in the app; code holds them as decimals.
- Flip ROI is the return on the whole project, not a yearly rate.
- Tax figures are simplified deal-comparison estimates: personal allowance,
  other income and basis-period rules are out of scope — not tax advice.
