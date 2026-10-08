# Phase 3.7 Approved Content Package - Eligibility Report

- Generated at: 2026-10-05T03:28:05.051Z
- Scope: Phase 3.4 real/source-derived pilot records, checked using Phase 3.5 intake validation and Phase 3.5 local source policies.
- This report does not authorize Library import or publication.

## Current result

| Measure | Count |
| --- | ---: |
| Source records examined | 8 |
| Phase 3.6 PASS | 0 |
| Phase 3.6 BLOCKED | 2 |
| Phase 3.6 REVIEW_REQUIRED | 6 |
| Phase 3.6 ready for Phase 3.7 review | 0 |
| Phase 3.6 approved for Library import | 0 |
| Phase 3.7 ELIGIBLE records | 0 |
| NOT_ELIGIBLE | 8 |
| BLOCKED | 2 |
| REVIEW_REQUIRED | 6 |
| Approved packages created | 0 |
| Approved for Library import | 0 |

## Per-record result

| Record ID | Source | Dry-run result | Package status | Error codes | Eligible for Phase 3.8? |
| --- | --- | --- | --- | --- | --- |
| plos-one-0309377 | plos-one | BLOCKED | NOT_ELIGIBLE | SOURCE_POLICY_EXCEEDED, FULL_TEXT_BODY_REQUIRED, PACKAGE_POLICY_EXCEEDED, PACKAGE_METADATA_INCOMPLETE, PACKAGE_INTAKE_NOT_PASS, PACKAGE_DRY_RUN_NOT_PASS, PACKAGE_REVIEW_INCOMPLETE | No |
| plos-one-0257734 | plos-one | BLOCKED | NOT_ELIGIBLE | SOURCE_POLICY_EXCEEDED, FULL_TEXT_BODY_REQUIRED, PACKAGE_POLICY_EXCEEDED, PACKAGE_METADATA_INCOMPLETE, PACKAGE_INTAKE_NOT_PASS, PACKAGE_DRY_RUN_NOT_PASS, PACKAGE_REVIEW_INCOMPLETE | No |
| voa-8008342 | voa-learning-english | REVIEW_REQUIRED | NOT_ELIGIBLE | SCHEMA_FIELD_TYPE, URL_INVALID, PACKAGE_METADATA_INCOMPLETE, PACKAGE_INTAKE_NOT_PASS, PACKAGE_DRY_RUN_NOT_PASS, PACKAGE_REVIEW_INCOMPLETE | No |
| voa-8008344 | voa-learning-english | REVIEW_REQUIRED | NOT_ELIGIBLE | SCHEMA_FIELD_TYPE, URL_INVALID, PACKAGE_METADATA_INCOMPLETE, PACKAGE_INTAKE_NOT_PASS, PACKAGE_DRY_RUN_NOT_PASS, PACKAGE_REVIEW_INCOMPLETE | No |
| voa-7979346 | voa-learning-english | REVIEW_REQUIRED | NOT_ELIGIBLE | SCHEMA_FIELD_TYPE, URL_INVALID, PACKAGE_METADATA_INCOMPLETE, PACKAGE_INTAKE_NOT_PASS, PACKAGE_DRY_RUN_NOT_PASS, PACKAGE_REVIEW_INCOMPLETE | No |
| voa-7979350 | voa-learning-english | REVIEW_REQUIRED | NOT_ELIGIBLE | SCHEMA_FIELD_TYPE, URL_INVALID, PACKAGE_METADATA_INCOMPLETE, PACKAGE_INTAKE_NOT_PASS, PACKAGE_DRY_RUN_NOT_PASS, PACKAGE_REVIEW_INCOMPLETE | No |
| voa-7979347 | voa-learning-english | REVIEW_REQUIRED | NOT_ELIGIBLE | SCHEMA_FIELD_TYPE, URL_INVALID, PACKAGE_METADATA_INCOMPLETE, PACKAGE_INTAKE_NOT_PASS, PACKAGE_DRY_RUN_NOT_PASS, PACKAGE_REVIEW_INCOMPLETE | No |
| voa-7979349 | voa-learning-english | REVIEW_REQUIRED | NOT_ELIGIBLE | SCHEMA_FIELD_TYPE, URL_INVALID, PACKAGE_METADATA_INCOMPLETE, PACKAGE_INTAKE_NOT_PASS, PACKAGE_DRY_RUN_NOT_PASS, PACKAGE_REVIEW_INCOMPLETE | No |

## Policy and interpretation

- PLOS remains `unknown` / `link-only`; no approved PLOS full-text package was created.
- VOA remains `partially-verified` / `metadata-only`; no approved VOA content package was created. Its canonical URL remains unverified.
- Phase 3.6 contains no record with `readyForPhase37Review=true`; all BLOCKED and REVIEW_REQUIRED records remain ineligible.
- Synthetic test-only records are not included in these real-data results and are never persisted.
- `ELIGIBLE` would only indicate eligibility for a Phase 3.8 integration plan. No app import, Library modification, database write, or publish operation is implemented.
