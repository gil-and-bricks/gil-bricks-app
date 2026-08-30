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
    "typicalPpsqm": 1668,       // interquartile mean of ppsqm values; null if no areas
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
  "ukhpiMonth": "2026-06",      // UK House Price Index month used for indexation
  "epcExtractDate": "2026-08-01",
  "onspdEdition": "2026-08",    // ONS Postcode Directory edition
  "generatedAt": "2026-08-30T00:00:00Z",
  "sectorsCount": 1
}
```

## Versioning policy

- `schemaVersion` appears in **every** sector file and in the manifest.
- Any change to shapes, field meanings, path convention or stats maths bumps
  the version and adds a dated migration note below. Old files are replaced by
  a full pipeline re-run publishing the new version — never edited in place.
- The client (`src/lib/data/client.ts`) validates `schemaVersion === 1` and
  fails with a `BadSchema` error on anything else.

### Migration log

- **v1** — 2026-08-30 — initial schema (this document).
