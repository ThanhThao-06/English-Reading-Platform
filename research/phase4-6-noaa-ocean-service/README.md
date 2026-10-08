# Phase 4.6 - NOAA Ocean Service Import Batch

A real import batch of 10 English articles from official NOAA National Ocean
Service pages, run through the existing whitelist, source-policy, approval,
deduplication and controlled-library import workflow.

## Outcome

| Measure | Value |
| --- | --- |
| Packages discovered in the import run | 31 |
| **Imported (this batch)** | **10** |
| Skipped | 8 |
| Rejected | 13 |
| Import outcome | `COMMITTED` |
| Import batch id | `5f40fe62-597e-4d71-8e92-0cae519cf395` |
| `library_content` rows before / after | 21 / 31 |

All 8 skipped and all 13 rejected packages are **pre-existing VOA packages**, not
NOAA items. No NOAA item was skipped or rejected, and no failing item stopped the
batch: the 8 skipped legacy packages failed
`PACKAGE_SCHEMA_INVALID, IMPORT_FIELD_INVALID` and the 13 rejects were
`DUPLICATE_*` rejections of VOA content already stored in the database.

## The 10 imported articles

| # | Record | Title | Genre | Level | Words |
| --- | --- | --- | --- | --- | --- |
| 1 | `noaa-ocean-service-seafoam` | What is sea foam? | Science & Nature | A2 | 296 |
| 2 | `noaa-ocean-service-oceaneconomy` | How important is the ocean to our economy? | Business & Economics | B1 | 127 |
| 3 | `noaa-ocean-service-lighthouse` | Do We Still Need Lighthouses? | Culture, Art & Travel | B1 | 288 |
| 4 | `noaa-ocean-service-marheritage` | What is maritime heritage? | History | B1 | 193 |
| 5 | `noaa-ocean-service-ocean-gliders` | What is an ocean glider? | Technology & AI | B2 | 404 |
| 6 | `noaa-ocean-service-lawofsea` | What is the law of the sea? | Law & Politics | B2 | 336 |
| 7 | `noaa-ocean-service-coral_medicine` | What does the ocean have to do with human health? | Health & Psychology | B2 | 619 |
| 8 | `noaa-ocean-service-greenland-shark` | How long do Greenland sharks live? | Science & Nature | B2 | 438 |
| 9 | `noaa-ocean-service-coral_bleach` | What is coral bleaching? | Environment | B2 | 417 |
| 10 | `noaa-ocean-service-amoc` | What is the AMOC? | Science & Nature | C1 | 425 |

8 distinct genres and 4 reading levels (A2, B1, B2, C1). `genre` and `level` are
Library editorial mappings recorded during the audit, not publisher-claimed labels.

## Rights basis (verified per item, never assumed from the publisher)

The source permission is the official NOAA National Ocean Service website
disclaimer, recorded verbatim in
`research/phase3-5-content-intake/fixtures/source-policies/noaa-ocean-service.json`:

> Information presented on this website is considered public information and may be
> distributed or copied, unless specifically noted otherwise. This website is
> maintained by NOAA's National Ocean Service.

The permission is **expressly qualified by "unless specifically noted otherwise"**,
so NOAA ownership of the domain is never treated as a blanket grant. Each page was
checked individually and an item is excluded on any of these findings:

- a copyright, third-party credit, courtesy/licence or restriction notice in the page text;
- no NOAA author credit on the page (every imported item carries the page's own `Author: NOAA` credit);
- no readable citation (`Last updated`) date on the page;
- a body too short to be a real article (<120 words);
- a page-level `copyright-notice` or `third-party-source` provenance signal.

## Policy change (narrowly scoped, no global safeguard weakened)

Added exactly one new source policy, `noaa-ocean-service`
(`verified` / `verified-full-text`), scoped to that single `sourceId`. Nothing else
changed:

- `voa-learning-english.json` is byte-for-byte unchanged and still carries its
  `conditionalFullText` grant with its `partially-verified` / `metadata-only` ceiling.
- `plos-one.json` is unchanged (`unknown` / `link-only`).
- No runtime code, validator, migration or frontend file was modified.
- Every NOAA item still passes the unmodified Phase 3.5 and Phase 3.7 validators,
  the hash-bound import approval, and the importer's duplicate, provenance and
  atomic transaction gates.

No NOAA record uses a conditional publisher grant: the VOA grant is VOA-only by
construction (`detectVoaProducerCredit`), and the existing test
"Case E: non-VOA source cannot benefit from the VOA rights rule" still passes. NOAA
items instead carry **item-scoped `item-rights` evidence** citing the disclaimer, so
the per-item gate stays enforced rather than being waived.

## Verification

| Check | Result |
| --- | --- |
| `scripts/verify-import.mjs` (live database) | ALL CHECKS PASSED (9 checks) |
| `scripts/verify-api.mjs` (live HTTP API) | ALL API CHECKS PASSED (10 checks) |
| `scripts/verify-duplicate-gate.mjs` (temp database) | IDEMPOTENCY / DUPLICATE GATE VERIFIED |
| `backend` `npm test` | 20/21 pass - see note below |
| Phase 3.5 intake tests | 31 scenarios, 108 assertions pass |
| Phase 3.7 package tests | 18/18 validation scenarios pass - see note below |
| Phase 3.8 integration tests | 23 scenarios, 71 assertions pass |

Database and API both confirm: 31 articles served, 10 NOAA, rights
(`public-domain` / `verified-full-text`), attribution
(`NOAA Ocean Service, oceanservice.noaa.gov`), NOAA canonical URLs, `NOAA` author
credit, rights evidence, import approval and provenance present on every item, and
`image` null on every item.

### Pre-existing test failures (not caused by this batch)

Two assertions fail because they assume a pristine repository, and earlier phases
(4.1 and 4.5) already populated the real data directories. Both were confirmed to
fail **with only the 21 original VOA approvals present**, before any NOAA file was
added:

1. `backend` - "production command with an absent approved-package directory records
   zero imported" expects `NO_OP`, but the real approvals directory is non-empty so
   the importer correctly reports `BLOCKED` (orphaned approvals).
2. `phase3-7` - "real Phase 3.6 results create zero packages and no approved-content
   directory" asserts `approved-content/` does not exist; it legitimately contains
   31 approved packages.

These are unrelated to the NOAA work and were left unmodified.

## Audited but not selected

Verified eligible, held back only to respect the 10-article cap: `tigershrimp`
(Environment, B2), `nutpollution` (Environment, B1), `barrier-islands`
(Environment, B2), `bathymetry` (Technology & AI, B1).

## Reproduce

```powershell
node research/phase4-6-noaa-ocean-service/scripts/audit-batch.mjs
node research/phase4-6-noaa-ocean-service/scripts/build-packages.mjs
cd backend; npm run import
node research/phase4-6-noaa-ocean-service/scripts/verify-import.mjs
node research/phase4-6-noaa-ocean-service/scripts/verify-api.mjs
node research/phase4-6-noaa-ocean-service/scripts/verify-duplicate-gate.mjs
```


All 10 imported items passed every check. Two audited pages
(`greenland-shark`, `barrier-islands`) showed page-level `wikipedia-or-wikimedia`
or `credits-other-agency` signals. These were reviewed individually: they occur in
image captions and related-link furniture, **not** in the article prose, and no
image or media is reused from those pages.

## Images

`imageReference` is **null for all 10 items**. No item-level asset-rights evidence
was recorded, so no image is imported. Agency seals, initials and agency
identification are expressly not reusable without written permission and are never
imported.
