# Phase 3.8 - Controlled Library Integration

This phase inspects the Phase 3.7 approved-package directory and evaluates
packages against the Phase 3.7 validator, unchanged Phase 3.5 source policies,
duplicate checks, and a documented Reading Library mapping. It does not import
content into the application.

## Current result

The Phase 3.7 `approved-content/` directory does not exist: its report records
zero eligible packages from eight Phase 3.4 source-derived records (two
`BLOCKED`, six `REVIEW_REQUIRED`). Therefore this run discovers zero packages,
imports zero records, and approves zero records for Library import.

The app's Reading Library is a static TypeScript bundle (`ARTICLES_DATA`) with
optional `ARTICLE_ENRICHMENTS`. The existing localStorage modules persist
reader progress and annotations, not article content. There is no supported
content writer or transactional import interface. The required `Article`
fields also cannot all be populated from a Phase 3.7 package without separate
editorial decisions and rights-cleared image mapping. The CLI consequently
fails closed: even if a future package passes validation, `IMPORT` is blocked
until an explicitly designed destination can preserve provenance and support
snapshot/rollback. No app writer is included in this phase.

## Run

From the project root:

```powershell
node research/phase3-8-controlled-library-integration/scripts/integration.mjs
node research/phase3-8-controlled-library-integration/scripts/integration-tests.mjs
node research/phase3-8-controlled-library-integration/scripts/integration.mjs --mode IMPORT
```

The default is `DRY_RUN`. Reports are uniquely named under this phase's
`reports/` directory. The optional `IMPORT` mode only evaluates import
eligibility and is fail-closed; it never writes to the app or Library.
Tests use synthetic, in-memory packages and an in-memory adapter solely to
exercise validation, all-before-write behavior, and rollback semantics.

## Limits

The validator checks recorded package data and local policy fixtures only. It
does not access the Internet, verify license assertions, resolve content URLs,
infer unknown metadata, publish content, or authorize production use.
`READY_FOR_IMPORT` in a test means only that the simulated gates passed. It is
not `APPROVED_FOR_LIBRARY_IMPORT`.

See [integration design](./docs/integration-design.md), [Library mapping](./docs/library-mapping.md),
and [transaction safety](./docs/transaction-safety.md). The run output is
recorded in the `reports/` directory.
