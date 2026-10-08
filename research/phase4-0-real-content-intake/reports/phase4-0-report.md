# Phase 4.0 — First Real Content Intake & Import

## Final outcome

```text
BLOCKED — NO CONTENT IMPORTED
```

```text
Source: VOA Learning English
Candidate articles reviewed: 3
Accepted for package: 0
Blocked pending review/required metadata: 1
Rejected for third-party rights: 1
Excluded at discovery as video-only: 1
Approved packages discovered by production importer: 0
Records imported: 0
Real content imported: NO
```

No article text, photo, video, audio, quiz, or lesson document was copied into
the production database. The single Phase 4.0 intake record that appears to be
VOA-original is metadata-only, marked `needs-rights-review`, and has no body.
The Phase 3.5 validator accepts the intake schema; that is not rights approval
or import eligibility.

## Source and policy evidence

Reviewed on **2026-10-03**:

1. [VOA Learning English — Requesting usage of VOA Learning English content](https://learningenglish.voanews.com/p/6861.html).
   The page states that Learning English texts, MP3s, photos, and videos are
   public domain and may be reprinted for educational and commercial purposes
   with credit to `learningenglish.voanews.com`. It separately excludes
   copyrighted AP, Reuters, AFP, and other agency material from republication.
2. [VOA — Terms of Use and Privacy Notice](https://learningenglish.voanews.com/p/6021.html).
   The terms state that material produced exclusively by VOA is public domain,
   while third-party material licensed only for VOA programming is not.
3. [VOA page 5374](https://learningenglish.voanews.com/p/5374.html) was
   inspected but is a Privacy Statement, not rights evidence.

The Phase 3.5 policy file
`research/phase3-5-content-intake/fixtures/source-policies/voa-learning-english.json`
still carries the `partially-verified` / `metadata-only` source ceiling. It now
also records a reviewed `conditionalFullText` grant block that encodes the two
official VOA policies listed above. The grant changes one thing only: a
VOA-produced article no longer needs its own separate item-level licence or
rights document, because publisher-produced material has no per-article licence.

The grant is conditional per item and is never a source-wide widening. Each
item must independently satisfy all of:

1. `canonicalUrl` is on `learningenglish.voanews.com`;
2. a byline/author credit identifies VOA Learning English or VOA as producer
   (official page JSON-LD author counts as such evidence);
3. no AP, Reuters, AFP or other third-party copyright attribution appears in the
   byline, title, or attribution text;
4. `rightsEvidenceUrl` and `rightsEvidenceExcerpt` record the official policy
   statement;
5. `attributionRequired` is true with the official credit line.

The source-policy check itself, the `restricted`/`not-allowed` veto, body
without verified rights, and every other existing rule are unchanged. A
third-party attribution is a hard block (`THIRD_PARTY_CONTENT_BLOCKED`) that a
VOA domain can never override. Synthetic policies may not carry a grant at all.

This Phase 4.0 run did not mark any package or import approval as approved, and
no content was imported.

Required attribution for eligible VOA Learning English material, in the
policy's wording:

```text
Credit to learningenglish.voanews.com
```

Candidate evidence, source-page metadata, intake, and per-candidate decisions
are recorded in [candidates.json](../candidates.json) and
[records.json](../intake/records.json). No full-text body is stored there.

## Candidate decisions

| Candidate | Source facts observed | Rights / third-party check | Decision |
| --- | --- | --- | --- |
| [Lesson 1: Welcome!](https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html) | Canonical/article URL are the same. VOA page JSON-LD says author `VOA Learning English`, type `NewsArticle`, published 2019-09-10; the page describes a Level 1 course for beginning learners. Topic: language-learning. | Official policy conditionally permits VOA-produced lesson text. No item-level full-text clearance was recorded in the intake policy; all page-associated image/video assets are excluded pending separate evidence. No third-party credit was observed in the reviewed lesson text; this is not a final clearance. | **BLOCKED.** No body retained. Library needs CEFR level (page gives Level 1/beginning but no A1–C2 equivalence), a matching genre (no language-learning/dialogue genre exists), reading time (not supplied; no estimate invented), and an image reference with item-applicable asset rights. Current source policy permits metadata-only. No import-approval sidecar exists. |
| [Senegal Starts Introducing English in Preschools](https://learningenglish.voanews.com/a/senegal-starts-introducing-english-in-preschools/7972239.html) | Page/listing date 2025-02-19. Closing credit names Andrew Smith, says Malick Rokhy Ba reported for AFP, and Anna Matteo adapted it for VOA Learning English. Topic: education. | **AFP material appears in the story.** Article text attributes reporting and quotes to AFP. The lead-photo caption says “Photo: Sofia Christensen for VOA”; the photo was nevertheless excluded with the article. VOA policy expressly excludes AFP stories absent separate permission; none was found. | **REJECTED.** No body or image retained; no package created. |
| [Everyday Grammar Video: Ramen, A Popular Food in Japan](https://learningenglish.voanews.com/a/8008342.html) | Official page JSON-LD identifies a `VideoObject`, author `VOA Learning English`, published 2025-04-29. Topic from title: ramen/food. | The page is a video player, not a text article. Video contents and media were not copied or assessed as text. | **EXCLUDED AT DISCOVERY.** No article body for Reading Library; no transcript or content was fabricated. |

## Pipeline results

| Stage | Result |
| --- | --- |
| Phase 3.5 intake | **2 records, 0 errors, 0 warnings.** Lesson 1 remains `needs-rights-review`; the AFP story is `rejected`. Schema validity does not imply approval. |
| Phase 3.6 candidate dry-run | **1 candidate: `REVIEW_REQUIRED`, not ready for Phase 3.7.** Missing evidence: “No item-level rights/ownership evidence URL was recorded; third-party authorship clearance remains unresolved.” No body passed to this stage. |
| Phase 3.7 package | **Not run for the Phase 4.0 candidate.** Phase 3.6 did not produce `readyForPhase37Review`; no package/version or package approval was created. Existing Phase 3.7 baseline regression still reports 0 eligible records and 0 packages. |
| Phase 3.8 integration | **Not run for this candidate.** There is no eligible Phase 3.7 package to preflight. |
| Phase 3.9 production import | `NO_OP`; 0 package candidates, 0 separately approved packages, 0 imported records. Audit batch: `80e41ba1-b426-400e-a988-46b7f9625960`. |
| Persisted database | Schema v4; 0 content rows; latest audit `NO_OP`; no canonical URLs stored. |

Phase 3.9 requires a separate human-created
`APPROVED_FOR_LIBRARY_IMPORT` sidecar bound to exact package bytes. No such
approval exists. Phase 4.0 did not create or imply one.

### Production import ledger

| Field | Result |
| --- | --- |
| Imported article IDs | None |
| Imported canonical URLs | None |
| Package IDs / versions | None |
| Full-text content hashes | None; no body was packaged |
| Applied article attribution | None; no article was published/imported |
| Required VOA attribution for any future eligible reuse | `Credit to learningenglish.voanews.com` |
| Import run / batch | `NO_OP` / `80e41ba1-b426-400e-a988-46b7f9625960` |

### Duplicate and transaction checks

No Phase 4.0 package reached production duplicate preflight, so no real
package ID/version, stable package content ID, canonical URL, or content hash
was presented to the production database. The database contained 0 imported
records before and after the run.

As a tightly related safety fix, Phase 3.9 now normalizes HTTP(S) canonical
URLs by removing fragments, checks duplicates within the batch and against
stored Library rows, and enforces a unique database index (migration 004).
Backend tests verify duplicate package/version, source/content ID, normalized
canonical URL, and exact body hash. They also verify atomic batch commit and
rollback after a mid-batch failure. Those positive-path packages are synthetic
fixtures in isolated in-memory databases only.

The production command had zero candidates, so it correctly wrote only a
`NO_OP` audit. No content transaction ran; therefore there was no partial
batch to commit or roll back.

## Library state

| Count | Before | After |
| --- | ---: | ---: |
| Existing static articles in `ARTICLES_DATA` | 10 | 10 |
| Imported production records | 0 | 0 |
| Reading Library total | 10 | 10 |

`frontend/src/data/articles.ts` and `frontend/src/data/articleEnrichment.ts`
were not changed. Chapter, Highlight, Note, SRS, and reading progress paths
were not migrated or redesigned. The browser smoke check still displays the
static articles; while the API is stopped, the UI shows its existing
“Imported articles could not be loaded” notice and retains static content.

## Regression and verification

| Check | Result |
| --- | --- |
| Phase 3.4 pilot and manifest | PASS; 8 source-derived records |
| Phase 3.5 regression | PASS; 26 scenarios, 85 assertions |
| Phase 3.5 Case A — VOA original article, no item-level licence evidence | PASS |
| Phase 3.5 Case B — VOA article with AFP | PASS; `THIRD_PARTY_CONTENT_BLOCKED` |
| Phase 3.5 Case C — VOA article with Reuters | PASS; `THIRD_PARTY_CONTENT_BLOCKED` |
| Phase 3.5 Case D — VOA article with AP | PASS; `THIRD_PARTY_CONTENT_BLOCKED` |
| Phase 3.5 Case E — non-VOA source gets no VOA rule | PASS |
| Phase 3.5 Phase 4.0 intake validation | PASS; 2 records, 0 errors, 0 warnings |
| Phase 3.6 regression | PASS; 43 assertions |
| Phase 3.6 Phase 4.0 candidate dry-run | `REVIEW_REQUIRED`; not approved or ready |
| Phase 3.7 regression | PASS; 21 scenarios, 66 assertions; 0 real packages |
| Phase 3.8 regression | PASS; 22 scenarios, 69 assertions |
| Phase 3.9 backend/API tests | PASS; 20 scenarios, 89 assertions |
| Frontend chapters / SRS / Highlights & Notes | PASS; 120 / 99 / 7 assertions |
| Source registry regression | PASS; 637 assertions |
| Article metadata regression | PASS; 750 assertions |
| Typecheck and production build | PASS |
| Frontend lint | PASS |
| Production import/database audit | PASS; `NO_OP`, 0 candidates, 0 approvals, 0 rows, schema v4 |

The Phase 4.0 intake records were deliberately **not** changed to `verified` /
`verified-full-text`: doing so would require retaining article body text, and this
task is a pipeline fix only. Content imported: **0**.

## Files created or changed in Phase 4.0

Created:

- `research/phase4-0-real-content-intake/candidates.json`
- `research/phase4-0-real-content-intake/intake/records.json`
- `research/phase4-0-real-content-intake/reports/phase4-0-report.md`

Changed to close the canonical-URL duplicate gap:

- `backend/src/library-repository.mjs`
- `backend/migrations/004-canonical-url-uniqueness.sql`
- `backend/test/library-repository.test.mjs`
- `research/phase3-9-library-storage-import/docs/architecture.md`
- `research/phase3-9-library-storage-import/docs/mapping.md`

Changed for the VOA item-level rights-gate fix:

- `research/phase3-5-content-intake/scripts/conditional-full-text-grant.mjs` (new)
- `research/phase3-5-content-intake/scripts/validate-intake.mjs`
- `research/phase3-5-content-intake/scripts/intake-tests.mjs`
- `research/phase3-5-content-intake/fixtures/source-policies/voa-learning-english.json`
- `research/phase3-5-content-intake/docs/validation-rules.md`
- `research/phase3-6-content-import-dry-run/scripts/dry-run.mjs`
- `research/phase3-7-approved-content-package/scripts/build-package.mjs`
- `research/phase3-7-approved-content-package/scripts/package-tests.mjs`
- `research/phase3-7-approved-content-package/docs/package-validation-rules.md`
- `research/phase3-8-controlled-library-integration/scripts/integration.mjs`
- `research/phase4-0-real-content-intake/candidates.json`
- `research/phase4-0-real-content-intake/reports/phase4-0-report.md`

No intake record schema change was needed: the existing `authors`,
`rightsEvidenceUrl`, `rightsEvidenceExcerpt`, `attributionRequired`, and
`attributionText` fields already carry every fact the grant requires. No
frontend, UI, Quiz, Reading Analytics, Flashcards/SRS, or database change was
made.

No approved package, import approval sidecar, or real content was created.
