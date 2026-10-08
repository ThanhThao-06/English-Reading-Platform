# Phase 3.9 — Library Storage & Production Import Layer

## Outcome

The Reading Library now has a durable SQLite-backed content repository, an
explicit production import command, and a read-only API for imported articles.
The existing static article bundle remains in place and continues to serve the
current UI.

```text
Approved packages discovered: 0
Records imported: 0
Real content imported: NO
```

Phase 3.7 still reports zero eligible packages, and the Phase 3.9 human
`APPROVED_FOR_LIBRARY_IMPORT` sidecar directory contains zero approval files.
Phase 3.8's baseline remains zero imported records.
The production import command was run against these actual empty input
directories. It returned `NO_OP`, persisted an audit record, and imported zero
records. The database has schema version 3 and contains zero
`library_content` rows.

## Architecture

- **Storage:** SQLite on a persistent application volume, accessed only by the
  Node.js Library API/import service. The browser and static files are not
  persistence.
- **Driver/API:** `better-sqlite3` for SQLite transactions and Node's built-in
  HTTP server for a small `/api/library` read API. No large web framework or
  external database service was added.
- **Runtime database:** `backend/data/library.sqlite` by default, or
  `LIBRARY_DATABASE_PATH` in deployment. WAL, full synchronous durability,
  foreign-key enforcement, and a 5-second busy timeout are enabled. Production
  must mount a durable volume and run one SQLite writer/API instance.
- **Scale path:** SQLite is suitable for the current single-app Library and
  vertical/read scaling. If multiple writer replicas are required, migrate
  repository operations and append-only migrations to PostgreSQL before
  horizontal write scaling; do not share a SQLite file between hosts.
- **Model:** `library_content` stores content/presentation, normalized source
  and rights identity, authors/categories, exact source/rights/provenance,
  original package and import-approval JSON snapshots, SHA-256 content hash,
  `imported_at`, and batch ID. `import_runs` stores every committed, blocked,
  rolled-back, and empty run, with discovered/approved/imported counts.
- **Migrations:** numbered SQL migrations advance `PRAGMA user_version` in a
  transaction. Migration 001 creates the content and audit tables; migration
  002 adds queryable source, category, and rights columns; migration 003
  retains the explicit import approval and approved-package audit count. Future
  migrations append rather than rewriting deployed migrations.

Decision and operational requirements are documented in
[architecture.md](../docs/architecture.md).

## Package → Content Model → Library

Mapping is documented in [mapping.md](../docs/mapping.md). Key fields:

| Package field | Persisted Library field | Reading Library |
| --- | --- | --- |
| `packageId`, `version` | `package_id`, `package_version` | Stable imported article ID |
| `content.recordId` | `source_id` + `source_record_id` | Used for stable identity/deduplication |
| `content.title`, `content.body` | `title`, `body`, `content_hash` | `Article.title`, `Article.content` |
| `libraryPresentation.description`, `imageReference`, `level`, `genre`, `readingTime` | Corresponding required presentation columns | Existing Article card/detail fields |
| `content.language`, `contentType`, `contentGroup`, categories, authors | Dedicated columns/JSON | `Article.importMetadata.content` and `.authors` |
| Source identity, URLs, external ID, DOI | Normalized query columns plus exact `source_json` | `Article.importMetadata.source` |
| Rights, source policy, license, attribution, all evidence | `rights_status`, `reuse_mode`, exact `rights_json` | `Article.importMetadata.rights` |
| Full provenance and original package | Exact `provenance_json`, `package_json` | `Article.importMetadata.provenance` |
| Phase 3.9 human approval sidecar | Exact `import_approval_json`, bound to package-file SHA-256 | `Article.importMetadata.libraryImportApproval` |
| Import execution | `imported_at`, `import_batch_id`; `import_runs` audit | Available through article metadata/audit repository |

The Phase 3.7 package schema now permits an optional, closed
`libraryPresentation` object. Import requires all five presentation fields;
it also requires item-applicable asset-rights evidence for an image. Missing
description, image reference, level, genre, reading time, inline body, rights,
or provenance blocks the entire batch. No values are guessed, generated, or
upgraded. The historical static `ARTICLES_DATA` and
`ARTICLE_ENRICHMENTS` were not migrated or removed.

## Import safety and transaction behavior

- The CLI is `cd backend; npm run import`. It reads sorted package JSON files
  in Phase 3.7 `approved-content/` and separate approval sidecars from the
  Phase 3.9 `approvals/` directory. It makes no network requests and never
  creates or approves a package.
- Phase 3.7 `packageStatus: ELIGIBLE`, `eligibleForPhase38: true`, and
  `reviewStatus: approved` are not final Library import approval. Every
  imported package also requires a separate human-created sidecar with
  `approvalStatus: APPROVED_FOR_LIBRARY_IMPORT`, matching package ID/version,
  exact SHA-256 of package-file bytes, approval timestamp, approver, and
  decision. The repository binds the approval to the exact bytes it validates
  and stores the approval snapshot. Missing, changed, malformed, duplicate, or
  orphan approval data fails closed. Phase 3.9 does not generate approvals;
  write access to the approval directory must be restricted. `testOnly`
  packages are rejected outside explicitly isolated in-memory tests.
- All package, rights, provenance, presentation, image-evidence, and duplicate
  checks run before any content write. Missing/unreadable input fails closed.
- Duplicate checks cover package ID/version, source ID + content record ID, and
  SHA-256 of exact UTF-8 body text. Unique database constraints provide the
  final concurrency gate. Existing records are never overwritten.
- The complete batch and success audit are written in one `BEGIN IMMEDIATE`
  transaction. Any write or verification failure rolls back all content, then
  writes a separate durable `ROLLED_BACK` audit. Empty input writes only a
  `NO_OP` audit.
- The API serves imported list/detail reads at `/api/library/articles`; Vite
  proxies `/api` in development. If the API is unavailable, the UI reports
  that condition while retaining the static articles.

## Verification

| Suite/check | Result |
| --- | --- |
| Phase 3.9 repository/API and approval tests | **19 scenarios, 85 assertions passed** |
| Phase 3.4 pilot | Manifest validation passed; 8 source-derived records |
| Phase 3.5 intake | **17 scenarios, 30 assertions passed** |
| Phase 3.6 dry run | **43 assertions passed** |
| Phase 3.7 package | **18 scenarios, 42 assertions passed**; 0 packages created |
| Phase 3.8 integration | **22 scenarios, 69 assertions passed** |
| Frontend chapters | **120 assertions passed** |
| Frontend SRS | **99 assertions passed** |
| Highlights & Notes storage regression | **7 assertions passed** |
| Source registry regression | **637 assertions passed** |
| Article metadata regression | **750 assertions passed** |
| Frontend typecheck/build (`tsc -b && vite build`) | **PASS** |
| Frontend lint | **PASS** |
| Production import command | **PASS — `NO_OP`, 0 package candidates, 0 approved packages, 0 imported** |
| Persisted database verification | **PASS — 0 content rows, latest audit `NO_OP`, schema v3** |
| API health/list smoke test | **PASS — healthy, 0 imported articles** |
| Browser static Library smoke test | **PASS — 10 static cards; Article Detail showed 3 chapters; Reader opened chapter 1** |

Backend positive-path packages and failure injections exist only in isolated
in-memory tests and are explicitly marked synthetic/test-only. They were not
written to the production database, package directory, or approval directory.
The Phase 3.7 test runner refreshed its generated package report with the
unchanged zero-package outcome; no historical result was hand-edited.

## Files created/changed

- Backend service, SQLite migrations, transactional repository, import CLI,
  and isolated tests under `backend/`.
- Frontend data hook, additive Article import metadata, static/imported Library
  composition, detail/reader lookup, and Vite API proxy under `frontend/`.
- Highlight/Note regression test and frontend `test:highlights` command.
- Phase 3.7 package schema/validator/specification extension for optional,
  explicitly supplied Library presentation fields.
- Phase 3.9 architecture, mapping, README, and this report.

## Final status

```text
PASS — LIBRARY DATA LAYER READY, IMPORT NOT EXECUTED
```
