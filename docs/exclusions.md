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
- **Time-on-market data** — free-data honesty: portal-only data, not freely licensed.
- **Auction data** — free-data honesty: no free licensed feed of auction results.
- **EPC-C / MEES warnings** — compliance: proposed rules unsettled; stale compliance warnings are worse than none.
- **Per-council HMO licensing links** — simplicity: 300+ council URLs rot constantly; broken links destroy trust.
- **Bedrooms column in comps** — free-data honesty: Land Registry sold prices carry no reliable bedroom counts.
- **Bathrooms / parking / garden as comp filters** — free-data honesty: these attributes are absent from free data; filtering on guesses is dishonest.
- **Live asking prices / rents** — free-data honesty: live portal data is licensed; we show sold/registered data only.
- **Scraping** — compliance: breaches portal terms of service and creates legal risk.
- **Brevo** — simplicity: one marketing system only, and it is Kit.
- **Sending email from the app** — compliance: deliverability and spam-law risk; golden rule 6 — Kit outbox row + Worker push only.
- **Cookie banner** — simplicity: strictly-necessary cookies only means no banner is required; adding one only adds confusion.
- **Named lenders** — compliance: naming lenders strays toward financial promotion; we stay generic.
