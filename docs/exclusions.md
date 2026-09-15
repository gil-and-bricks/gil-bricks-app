# Permanent exclusions

These are out of scope forever, per CLAUDE.md → "Do NOT". Each carries its reason:
**free-data honesty** (no free, licensed, reliable source exists — pretending
otherwise would mislead), **simplicity** (adds confusion or maintenance burden
for little value), or **compliance** (legal, privacy, or regulatory risk).

- **LHA (Local Housing Allowance) rates** — simplicity: rates change annually and vary by BRMA; keeping them current is a maintenance burden, and a stale figure misleads worse than no figure.
- **Section 21 content** — compliance: Section 21 evictions are being abolished under the Renters' Rights Act; legal guidance dates fast and is not our job.
- **Renters' Rights content** — compliance: evolving law; summarising it risks giving outdated legal advice.
- **SpareRoom (room-rate data)** — free-data honesty: no licensed free feed, and scraping is banned.
- **Student / employment demand data** — free-data honesty: no reliable free dataset at sector level.
- **Commercial HMO valuation** — free-data honesty: yield-based commercial valuation needs data and expertise free sources cannot support.
- **Portfolio tracker** — simplicity: scope creep beyond deal analysis; a different product.
- **Phone number capture** — compliance: GDPR data minimisation; we never need it.
- **Time-on-market as a DATASET** — free-data honesty: portal-only data, not
  freely licensed. We never ingest, scrape, store or republish it. **Reading the
  first-listed date off the single page the user has personally opened, in their
  own browser, and saying it back to them, is allowed** — nothing is fetched,
  kept or republished, so the licensing reason does not apply. That is what the
  extension's seller signals do (ruled 2026-09-07; see docs/AUDIT.md §1.1).
- **Auction data as a DATASET** — free-data honesty: no free licensed feed of
  auction results, so we ingest none. **Detecting from the opened listing that a
  property is going to auction, and warning about the legal pack, is allowed** —
  same reason: it reads the page in front of the user and stores no feed.
- **EPC-C / MEES warnings** — compliance: proposed rules unsettled; stale compliance warnings are worse than none.
- **Per-council HMO licensing links** — simplicity: 300+ council URLs rot constantly; broken links destroy trust.
- **Bedrooms column in comps** — free-data honesty: Land Registry sold prices carry no reliable bedroom counts.
- **Bathrooms / parking / garden as comp filters** — free-data honesty: these attributes are absent from free data; filtering on guesses is dishonest.
- **Live asking prices / rents** — free-data honesty: live portal data is licensed; we show sold/registered data only.
- **Listing price history (listed / reduced / relisted / withdrawn)** — free-data
  honesty. RULED OUT PERMANENTLY, 2026-09-15, and worth naming explicitly because
  it is the feature competitors are most praised for and it will keep being
  suggested. PropBar's best-reviewed capability is exactly this: showing when a
  property was listed, reduced, relisted or withdrawn, and catching agents who
  raise a price in order to reduce it. Building it requires INGESTING AND STORING
  A TIME SERIES OF PORTAL ASKING PRICES — the dataset this document already
  forbids two lines above, and the same dataset that rules out time-on-market and
  auction results. Reading the single page the user has personally opened and
  saying it back to them remains allowed; keeping a history of what that page
  said last month is not. **We are not competing on listing history.** What we
  compete on instead is the thing no portal shows and no competitor computes: the
  asking price set against what similar-sized homes of the same type actually
  SOLD for nearby — Land Registry joined to EPC floor areas — which is now the
  first line of the on-page box. See docs/DECISIONS_LOG.md (X4).
- **Scraping** — compliance: breaches portal terms of service and creates legal risk.
- **Brevo** — simplicity: one marketing system only, and it is Kit.
- **Sending email from the app** — compliance: deliverability and spam-law risk; golden rule 6 — Kit outbox row + Worker push only.
- **Cookie banner** — simplicity: strictly-necessary cookies only means no banner is required; adding one only adds confusion.
- **Named lenders** — compliance: naming lenders strays toward financial promotion; we stay generic.
