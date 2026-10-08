# Phase 4.7 - NASA Import Batch

The next real article batch, imported from official NASA sources through the
existing whitelist, source-policy, approval, deduplication and controlled-library
import workflow.

## Result

| Measure | Value |
| --- | --- |
| Packages discovered | 41 |
| **Imported (this batch)** | **10** |
| Skipped | 8 |
| Rejected | 23 |
| Import outcome | `COMMITTED` |
| **Batch ID** | **`ac178b83-e1ce-45c9-a1bd-95151c6dfe2e`** |
| `library_content` rows before / after | 31 / 41 |

All 8 skipped and all 23 rejected packages are **pre-existing VOA and NOAA
packages**, not NASA items. No NASA item was skipped or rejected, and no failing
item stopped the batch.

## The 10 imported articles

| # | Record | Title | Genre | Level | Words |
| --- | --- | --- | --- | --- | --- |
| 1 | `nasa-saturn` | Saturn | Science & Nature | A2 | 346 |
| 2 | `nasa-black-holes` | Black Hole Basics | Science & Nature | B1 | 555 |
| 3 | `nasa-sun` | The Sun | Science & Nature | B1 | 577 |
| 4 | `nasa-skywatching` | Skywatching | Culture, Art & Travel | B1 | 2370 |
| 5 | `nasa-moon` | The Moon | Science & Nature | B2 | 840 |
| 6 | `nasa-exoplanets` | Exoplanets | Science & Nature | B2 | 1509 |
| 7 | `nasa-earth-science` | NASA Earth Science | Environment | B2 | 930 |
| 8 | `nasa-climate-change` | Climate Change | Environment | B2 | 148 |
| 9 | `nasa-machine-learning` | NASA Uses Machine Learning to Enhance Flash Flood Warnings | Technology & AI | B2 | 749 |
| 10 | `nasa-dark-matter` | Dark Matter | Science & Nature | C1 | 1820 |

4 distinct genres and 4 reading levels (A2, B1, B2, C1). `genre` and `level` are
Library editorial mappings recorded during the audit, not publisher-claimed labels.

## Rights basis (verified per item)

Source permission is NASA's official Images and Media Usage Guidelines, recorded
verbatim in `research/phase3-5-content-intake/fixtures/source-policies/nasa.json`:

> NASA content - images, audio, video, and media files used in the rendition of
> 3-dimensional models, such as texture maps and polygon data in any format -
> generally are not subject to copyright in the United States. You may use this
> material for educational or informational purposes... News outlets, schools, and
> text-book authors may use NASA content without needing explicit permission,
> subject to compliance with these guidelines. NASA content used in a factual
> manner that does not imply endorsement may be used without needing explicit
> permission. NASA should be acknowledged as the source of the material.

**This is not a blanket public-domain claim.** NASA states two hard limits, both
recorded in the policy and enforced per item:

> NASA occasionally uses copyright-protected material of third parties with
> permission on its website... **NASA's use does not convey any rights to others
> to use the same material.**

> The NASA Insignia, Logotype, identifiers, and imagery are **not in the public
> domain**.

So each page was checked individually and is skipped on any of these findings:

- a copyright notice, courtesy line, licence note or "used with permission";
- a third-party or partner credit line (ESA, CSA, STSci, a university, a commercial provider) - credit naming only NASA centres is allowed;
- syndicated, contributed-by, guest-post or news-agency content;
- no NASA page provenance (page editor or responsible NASA official);
- no readable "Page Last Updated" date;
- a body too short to be a real article (<120 words);
- topic-hub shape (more than 0.5 in-body links per block - navigation, not an article).

All 10 imported items passed every check. Reuse is recorded as `permission` basis
(educational/informational, factual, no implied endorsement) with
`attributionRequired=true` and the attribution `NASA`, matching NASA's instruction
that "NASA should be acknowledged as the source of the material".

## Images and identifiers

`imageReference` is **null for all 10 items**. No images are reused, and the NASA
Insignia, Logotype and identifiers are never imported. Figures, captions and image
credits are stripped from every body before storage; a database check confirms no
stored NASA body contains insignia/logotype language.


## Policy change (narrowly scoped, no global safeguard weakened)

One new source policy, `nasa` (`verified` / `verified-full-text`), scoped to that
single `sourceId`, plus a matching `ALLOWED_CONDITIONAL` whitelist entry carrying
the same conditions. Nothing else changed:

- `voa-learning-english.json` and `noaa-ocean-service.json` are unchanged.
- `plos-one.json` is unchanged (`unknown` / `link-only`).
- No runtime code, validator, migration or frontend file was modified.
- Every NASA item passes the unmodified Phase 3.5 and Phase 3.7 validators, the
  hash-bound import approval, and the importer's duplicate, provenance and atomic
  transaction gates.

NASA items carry **item-scoped `item-rights` evidence** citing the guidelines, so
the per-item gate stays enforced. They do not use the VOA conditional grant, which
is VOA-only by construction; "Case E: non-VOA source cannot benefit from the VOA
rights rule" still passes.

## Verification

| Check | Result |
| --- | --- |
| `scripts/verify-import.mjs` (live database) | ALL CHECKS PASSED (10 checks) |
| `scripts/verify-api.mjs` (live HTTP API) | ALL API CHECKS PASSED (11 checks) |
| `scripts/verify-duplicate-gate.mjs` (temp database) | IDEMPOTENCY / DUPLICATE GATE VERIFIED (9 checks) |
| Phase 3.5 intake tests | 31 scenarios, 108 assertions pass |
| Phase 3.8 integration tests | 23 scenarios, 71 assertions pass |
| `backend` `npm test` | 20/21 pass - see note below |
| Phase 3.7 package tests | 18/18 validation scenarios pass - see note below |

The duplicate gate is proven on a throwaway database: run 1 imports all 33
importable packages, run 2 imports 0 and rejects all 33 with
`DUPLICATE_PACKAGE_VERSION, DUPLICATE_SOURCE_CONTENT_ID, DUPLICATE_CANONICAL_URL,
DUPLICATE_CONTENT_HASH`, outcome `BLOCKED`.

### Pre-existing test failures (not caused by this batch)

The same two assertions already failed before this batch, and were previously
confirmed to fail with only the 21 original VOA approvals present:

1. `backend` - "production command with an absent approved-package directory
   records zero imported" expects `NO_OP` but gets `BLOCKED`, because the real
   approvals directory is non-empty so the importer correctly reports orphaned
   approvals.
2. `phase3-7` - "real Phase 3.6 results create zero packages and no
   approved-content directory" asserts `approved-content/` does not exist; it
   legitimately contains 41 approved packages.

Both assume a pristine repository that Phases 4.1/4.5/4.6 already invalidated.
They are unrelated to the NASA work and were left unmodified.

## Audited and skipped (real findings)

| Page | Finding |
| --- | --- |
| `science.nasa.gov/technology/` | topic hub, 18 links / 26 blocks |
| `science.nasa.gov/aeronautics/` | topic hub, 11 links / 14 blocks |
| `www.nasa.gov/history/` | topic hub, 53 links / 84 blocks |
| `science.nasa.gov/technology/technology-highlights-2/` | topic hub, 217 links / 218 blocks |
| `science.nasa.gov/humans-in-space/` | no readable "Page Last Updated" date |
| `science.nasa.gov/learning-resources/` | no readable "Page Last Updated" date |

## Reproduce

```powershell
node research/phase4-7-nasa/scripts/audit-batch.mjs
node research/phase4-7-nasa/scripts/build-packages.mjs
cd backend; npm run import
node research/phase4-7-nasa/scripts/verify-import.mjs
node research/phase4-7-nasa/scripts/verify-api.mjs
node research/phase4-7-nasa/scripts/verify-duplicate-gate.mjs
```
