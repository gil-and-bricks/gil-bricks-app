# Canonical metric definitions (LOCKED)

These definitions are the single source of truth for every number the app shows.
They are implemented once, in the maths lib, and are LOCKED: changing any of them
is a versioned migration, never an in-place edit (see CLAUDE.md → Data contracts).
Every show-the-maths accordion must reconcile exactly with these formulas.

## Price & area

- **£/sqft** = price ÷ EPC total floor area.
  (EPC floor areas are recorded in m²; convert at 1 m² = 10.7639 sqft.)
- **Typical price** = interquartile mean — the mean of sold prices between the
  25th and 75th percentiles — shown with an **80% range** (10th to 90th percentile).

## Yield & cashflow

- **Gross yield** = annual rent ÷ price.
- **Net yield** = (annual rent − running costs) ÷ all-in cost.
- **Monthly cashflow** = rent − mortgage − management − maintenance − insurance − voids.

## Return on investment

- **ROI** = annual net profit ÷ total cash in × 100.
  **Cash-in INCLUDES SDLT/LTT + legals + refurb + fees.** Never quote an ROI
  that quietly leaves purchase tax out.

## BRRRR (money left in)

- If refinance proceeds ≥ cash invested → **"All money out"**.
  If there is a surplus → **"All money out + £X"**.
- Otherwise → **"£X left in"**, where £X = cash invested − refinance proceeds.

## Flips & development

- **Profit on GDV** = profit ÷ GDV.

## Lending

- **ICR** (interest coverage ratio) = rent ÷ (loan × stress rate).
