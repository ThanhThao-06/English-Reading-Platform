# Phase 3.6 Content Import Dry Run

- Generated: 2026-10-03T09:44:29.874Z
- Input scope: Phase 3.4 source-derived pilot records only; Phase 3.5 synthetic fixtures excluded.
- Outcome: dry run only; no import, approval, or publication.

## Summary

| Measure | Records |
| --- | ---: |
| Processed | 8 |
| PASS | 0 |
| BLOCKED | 2 |
| REVIEW_REQUIRED | 6 |
| Ready for Phase 3.7 human review | 0 |
| Approved for Library Import | 0 |
| Records with schema errors | 6 |
| Records restricted by source policy | 2 |
| Records with duplicate errors | 0 |
| Records with other errors | 2 |
| Validation error occurrences | 16 |

### Error codes

- `SOURCE_POLICY_EXCEEDED`: 2
- `FULL_TEXT_BODY_REQUIRED`: 2
- `SCHEMA_FIELD_TYPE`: 6
- `URL_INVALID`: 6

## Per-record results

| Record ID | Source ID | Source | Content type | Reuse / rights | Validation result | Simulated review | Error codes | Missing evidence | Phase 3.7 next step | Ready for Phase 3.7? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plos-one-0309377 | plos-one | PLOS ONE | other | verified-full-text / verified | BLOCKED | needs-rights-review | SOURCE_POLICY_EXCEEDED, FULL_TEXT_BODY_REQUIRED | The Phase 3.4 artifact is abstract-only and was deliberately not supplied as intake body under the link-only source ceiling. | Do not carry the abstract into intake. Keep the source at unknown/link-only; a human must decide whether to propose link-only handling in a separately reviewed next phase. | No |
| plos-one-0257734 | plos-one | PLOS ONE | other | verified-full-text / verified | BLOCKED | needs-rights-review | SOURCE_POLICY_EXCEEDED, FULL_TEXT_BODY_REQUIRED | The Phase 3.4 artifact is abstract-only and was deliberately not supplied as intake body under the link-only source ceiling. | Do not carry the abstract into intake. Keep the source at unknown/link-only; a human must decide whether to propose link-only handling in a separately reviewed next phase. | No |
| voa-8008342 | voa-learning-english | VOA Learning English | unassigned | metadata-only / partially-verified | REVIEW_REQUIRED | needs-source-review | SCHEMA_FIELD_TYPE, URL_INVALID | canonicalUrl is null in Phase 3.4; the recorded RSS/source link has not been verified as canonical.; No author was recorded in Phase 3.4 metadata.; contentType is unassigned in Phase 3.4.; Classification categories are unassigned in Phase 3.4.; No item-level rights/ownership evidence URL was recorded; third-party authorship clearance remains unresolved. | Keep metadata-only scope. Resolve canonical URL status and any needed metadata from recorded evidence before a Phase 3.7 review; do not fetch or retain a story body in this dry run. | No |
| voa-8008344 | voa-learning-english | VOA Learning English | unassigned | metadata-only / partially-verified | REVIEW_REQUIRED | needs-source-review | SCHEMA_FIELD_TYPE, URL_INVALID | canonicalUrl is null in Phase 3.4; the recorded RSS/source link has not been verified as canonical.; No author was recorded in Phase 3.4 metadata.; contentType is unassigned in Phase 3.4.; Classification categories are unassigned in Phase 3.4.; No item-level rights/ownership evidence URL was recorded; third-party authorship clearance remains unresolved. | Keep metadata-only scope. Resolve canonical URL status and any needed metadata from recorded evidence before a Phase 3.7 review; do not fetch or retain a story body in this dry run. | No |
| voa-7979346 | voa-learning-english | VOA Learning English | unassigned | metadata-only / partially-verified | REVIEW_REQUIRED | needs-source-review | SCHEMA_FIELD_TYPE, URL_INVALID | canonicalUrl is null in Phase 3.4; the recorded RSS/source link has not been verified as canonical.; No author was recorded in Phase 3.4 metadata.; contentType is unassigned in Phase 3.4.; Classification categories are unassigned in Phase 3.4.; No item-level rights/ownership evidence URL was recorded; third-party authorship clearance remains unresolved. | Keep metadata-only scope. Resolve canonical URL status and any needed metadata from recorded evidence before a Phase 3.7 review; do not fetch or retain a story body in this dry run. | No |
| voa-7979350 | voa-learning-english | VOA Learning English | unassigned | metadata-only / partially-verified | REVIEW_REQUIRED | needs-source-review | SCHEMA_FIELD_TYPE, URL_INVALID | canonicalUrl is null in Phase 3.4; the recorded RSS/source link has not been verified as canonical.; No author was recorded in Phase 3.4 metadata.; contentType is unassigned in Phase 3.4.; Classification categories are unassigned in Phase 3.4.; No item-level rights/ownership evidence URL was recorded; third-party authorship clearance remains unresolved. | Keep metadata-only scope. Resolve canonical URL status and any needed metadata from recorded evidence before a Phase 3.7 review; do not fetch or retain a story body in this dry run. | No |
| voa-7979347 | voa-learning-english | VOA Learning English | unassigned | metadata-only / partially-verified | REVIEW_REQUIRED | needs-source-review | SCHEMA_FIELD_TYPE, URL_INVALID | canonicalUrl is null in Phase 3.4; the recorded RSS/source link has not been verified as canonical.; No author was recorded in Phase 3.4 metadata.; contentType is unassigned in Phase 3.4.; Classification categories are unassigned in Phase 3.4.; No item-level rights/ownership evidence URL was recorded; third-party authorship clearance remains unresolved. | Keep metadata-only scope. Resolve canonical URL status and any needed metadata from recorded evidence before a Phase 3.7 review; do not fetch or retain a story body in this dry run. | No |
| voa-7979349 | voa-learning-english | VOA Learning English | unassigned | metadata-only / partially-verified | REVIEW_REQUIRED | needs-source-review | SCHEMA_FIELD_TYPE, URL_INVALID | canonicalUrl is null in Phase 3.4; the recorded RSS/source link has not been verified as canonical.; No author was recorded in Phase 3.4 metadata.; contentType is unassigned in Phase 3.4.; Classification categories are unassigned in Phase 3.4.; No item-level rights/ownership evidence URL was recorded; third-party authorship clearance remains unresolved. | Keep metadata-only scope. Resolve canonical URL status and any needed metadata from recorded evidence before a Phase 3.7 review; do not fetch or retain a story body in this dry run. | No |

## Safety and interpretation

- PLOS remains `unknown` / `link-only`; item-level evidence recorded in the pilot does not override this source ceiling in Phase 3.5 validation.
- VOA remains `partially-verified` / `metadata-only`; no story body is supplied or approved.
- Phase 3.4 abstract-only artifacts were not opened or passed as body. No source URLs were contacted.
- `PASS` would mean eligible only for human Phase 3.7 review, never production approval. This report marks zero records approved for Library import.
- Synthetic Phase 3.5 fixtures are excluded from these eight source-derived records and are not evidence.
