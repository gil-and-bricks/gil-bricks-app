# Data schema v1 (LOCKED)

The contract between the data pipeline (writes to R2) and the app (reads from
R2). **Schema changes REQUIRE a version bump plus a migration note here —
files are never edited in place** (CLAUDE.md → Data contracts). The app rejects
any file whose `schemaVersion` it does not recognise.

## Where files live

R2 bucket `gil-bricks-data`, served read-only over the public base URL in
`src/site.config.ts` (`dataBaseUrl`).

| Object | Path |
| --- | --- |
| Manifest | `manifest.json` (bucket root) |
| Sector file | `sectors/{OUTCODE}/{SECTOR}.json` — sector "CF37 1" → `sectors/CF37/CF37-1.json` (space becomes a hyphen) |

## Sector file

One JSON file per postcode sector, holding the last 12 months of sales and
precomputed stats for that window.

```jsonc
{
  "schemaVersion": 1,
  "fixture": true,            // OPTIONAL — present and true only on hand-authored test data
  "sector": "CF37 1",
  "country": "W92000004",     // ONSPD CTRY: E92000001 England, W92000004 Wales — nothing else
  "updatedAt": "2026-08-30T00:00:00Z",
  "sales": [
    {
      "id": "{...}",           // Land Registry transaction GUID
      "date": "2026-07-11",    // completion date, YYYY-MM-DD
      "price": 127000,          // £, integer
      "paon": "48",            // primary addressable object (house number/name)
      "saon": "",              // secondary (flat number); "" when none
      "street": "MEADOW STREET",
      "town": "PONTYPRIDD",
      "postcode": "CF37 1RX",  // always inside this file's sector
      "type": "T",             // D detached, S semi, T terraced, F flat, O other
      "tenure": "F",           // F freehold, L leasehold
      "newBuild": false,
      "lat": 51.6016,
      "lng": -3.3465,
      "floorAreaSqm": null,     // from EPC match; null when no match
      "ppsqm": null             // price / floorAreaSqm, rounded; null when no area
    }
  ],
  "stats": {
    "count": 12,
    "typicalPrice": 137575,     // interquartile mean of sale prices
    "typicalPpsqm": 1668,       // interquartile mean of ppsqm values; null when fewer than 3 sales have one
    "p10Price": 98650,          // 80% range, lower bound
    "p90Price": 206300          // 80% range, upper bound
  }
}
```

### How the stats are computed

Canonical metric definitions live in [docs/definitions.md](definitions.md);
the pipeline computes them exactly like this:

- **Interquartile mean**: sort, drop `floor(n/4)` values from each end, take
  the arithmetic mean of what remains, round to the nearest integer. This
  truncation IS the canonical discretisation of definitions.md's "mean of
  values between the 25th and 75th percentiles" — show-the-maths accordions
  must reproduce it exactly.
- **Percentiles (p10/p90)**: linear interpolation between closest ranks
  (type-7, the numpy/Excel default), rounded to the nearest integer.
- Window: sales dated within the 12 months up to and including `ppdMonth`.

## Manifest

`manifest.json` at the bucket root is the **single as-of source** — the UI
reads `dataAsOf` from it and never invents dates.

```jsonc
{
  "schemaVersion": 1,
  "fixture": true,              // OPTIONAL — only on hand-authored test data
  "ppdMonth": "2026-07",        // Land Registry Price Paid Data month included
  "ukhpiMonth": "2026-06",      // latest month in ukhpi.json (was "" before S3.4 ingested UKHPI)
  "epcExtractDate": "2026-08-01", // EPC bulk extract date (fields are strings; "" was the pre-join none-value)
  "onspdEdition": "2026-08",    // ONS Postcode Directory edition
  "generatedAt": "2026-08-30T00:00:00Z",
  "sectorsCount": 1,
  "postcodeFiles": 2414,          // OPTIONAL — additive v1 companions (S3.3–S3.4)
  "sectorsIndexAt": "2026-08-31T00:00:00Z"
}
```

## Additive v1 companions (S3.3–S3.4)

These additional file families sit beside the sector files. They are ADDITIVE —
sector schema v1 is untouched — and carry no schemaVersion of their own; the
manifest records them (`postcodeFiles`, `sectorsIndexAt`, `ukhpiMonth`).

| Object | Path | Shape |
| --- | --- | --- |
| Postcode geocode map | `postcodes/{OUTCODE}.json` | `{ "CF371DL": [lat, lng, country, "CF37 1"], ... }` — every LIVE England & Wales postcode in the outcode (keys uppercase, no space). Lets the app geocode a subject postcode with zero third-party calls. |
| UKHPI index | `ukhpi.json` (bucket root) | `{ source, ukhpiMonth, index: { E92000001: { "2019-03": 80.3, ... }, W92000004: { ... } } }` — the official UK House Price Index, all-property monthly values per country (1968 onwards). Powers last-sale indexation; `manifest.ukhpiMonth` mirrors its latest month. |
| Sectors index | `sectors-index.json` (bucket root) | `[{ sectorId, lat, lng, country, salesCount, spanMiles }]` — centroid of each sector's live postcodes plus `spanMiles`, the farthest live postcode OR window sale from that centroid (rounded up), which bounds how far a radius search must widen its sector sweep — verified: every sale sits within its sector's span. Sectors whose postcodes have all terminated fall back to the centroid of their sales. |


## Additive v1 companions (S5.1) — area stats + deprivation

`area/{OUTCODE}.json` — one file per outcode, `{sectorId: AreaStats}` for that
outcode's sectors (schema v1 untouched; `sectors-index.json` is deliberately
UNCHANGED — r2.dev serves uncompressed and every comps search downloads the
index, so fattening it measurably slowed every page: 2.3MB vs 0.9MB).

| Field | Meaning |
|---|---|
| `typicalPriceByType` | `{D,S,T,F}` — IQM sold price per property type over the 12-month window; `null` when that type has fewer than 3 sales. Type `O` (other) is excluded. |
| `newBuildShare` | Fraction (0–1, 3dp) of window sales that were new builds. |
| `freeholdShare` | Fraction (0–1, 3dp) of window sales sold freehold. |
| `salesByMonth` | 12 counts, oldest month first, ending at the manifest `ppdMonth`. |
| `imdDecile` / `imdCoverage` | England sectors only. Modal decile (1 = most deprived tenth, 10 = least) of the sector's live postcodes under the **English Indices of Deprivation 2025** (MHCLG, published 30 Oct 2025, files updated 17 Nov 2025; File 7, LSOA 2021). Ties resolve to the more deprived decile. Coverage = scored live postcodes / all live postcodes in the sector. |
| `wimdDecile` / `wimdCoverage` | Wales sectors only. Same construction under the **Welsh Index of Multiple Deprivation 2025** (Welsh Government, published 27 Nov 2025; index ranks ODS, LSOA 2021, official decile column). |

The two indices each rank their own country only and are **never blended or
compared across the border**. Postcode → LSOA (2021) comes from ONSPD `lsoa21cd`.
The manifest gained `imdEdition` / `wimdEdition` labels.

Sources (logged in DECISIONS_LOG S5.1):
- England: `assets.publishing.service.gov.uk/.../File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv`
- Wales: `gov.wales/.../wimd-2025-index-and-domain-ranks-by-small-area.ods`

## Versioning policy

- `schemaVersion` appears in **every** sector file and in the manifest.
- Any change to shapes, field meanings, path convention or stats maths bumps
  the version and adds a dated migration note below. Old files are replaced by
  a full pipeline re-run publishing the new version — never edited in place.
- The client (`src/lib/data/client.ts`) validates `schemaVersion === 1` and
  fails with a `BadSchema` error on anything else.

### Migration log

- **v1** — 2026-08-30 — initial schema (this document).

## Source data attribution

- Contains HM Land Registry data © Crown copyright and database right 2026.
  This data is licensed under the Open Government Licence v3.0.
- Contains OS data © Crown copyright and database right 2026; contains Royal
  Mail data © Royal Mail copyright and database right 2026; contains
  National Statistics data © Crown copyright and database right 2026
  (ONS Postcode Directory, via the ONS Open Geography portal).
