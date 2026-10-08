# Integration design

## Inputs and gates

The only production input directory is Phase 3.7's
`research/phase3-7-approved-content-package/approved-content/`. Each JSON
package is checked by Phase 3.7 `validatePackage` and `validatePackageBatch`,
using the unchanged Phase 3.5 policy fixtures. Policy baselines are checked
against the Phase 3.4 manifest before package evaluation:

| Source | Rights baseline | Maximum reuse |
| --- | --- | --- |
| `plos-one` | `unknown` | `link-only` |
| `voa-learning-english` | `partially-verified` | `metadata-only` |

The integration gates are `PACKAGE_SCHEMA_VALID`, `SOURCE_VALID`,
`RIGHTS_VALID`, `EVIDENCE_VALID`, `PROVENANCE_VALID`, `REVIEW_VALID`,
`DUPLICATE_CHECK_PASS`, and `LIBRARY_MAPPING_VALID`. A failed gate blocks the
entire package; a review-only condition holds it for human review. Package
batch duplicate errors are preserved, never auto-merged.

Full-text requires the Phase 3.7 validator to pass item-level evidence,
attribution (when required), and the source policy ceiling. A source-level
policy cannot stand in for item-level evidence. Metadata-only, link-only,
unknown, and restricted packages cannot be mapped into the app's full-text
`Article.content`.

Duplicate matching is exact on package record ID, DOI, external ID, or
normalized canonical URL. A matching title without an exact identifier is
`POSSIBLE_DUPLICATE` and requires review. If a Library snapshot is unavailable,
the duplicate gate fails closed; absence of a snapshot is never represented as
`NO_DUPLICATE`.

## Workflow

`DRY_RUN` loads and validates candidates and writes only a report under this
phase. It does not create a Library projection or mutate app state. `IMPORT`
performs the same preflight but requires every gate to pass. In this workspace
it remains blocked because there is no supported Library snapshot/writer and
no eligible approved package.

`READY_FOR_IMPORT` is an internal gate result, not a legal conclusion,
production approval, publication, or `APPROVED_FOR_LIBRARY_IMPORT`. No package
status or rights value is changed to produce a passing result.

## Current Phase 3.7 input

The approved-package directory is absent. Phase 3.7's report records eight
source-derived candidates, zero eligible packages, two blocked PLOS records,
and six VOA records requiring review. Consequently, this run discovers zero
packages and reports zero imports. Phase 3.5 synthetic fixtures are not input
to the production runner.
