# Phase 3.9 Library storage architecture

## Decision

Use a small Node.js API and SQLite database for imported Library content.
SQLite is durable on a persistent application volume, has unique indexes and
real ACID transactions, and is proportionate to this single-app Library. The
API uses Node's built-in HTTP server; `better-sqlite3` is the only new runtime
dependency and provides a supported SQLite driver with transaction support.
The frontend reads imported articles through same-origin `/api/library`
endpoints. Existing `ARTICLES_DATA` remains the static legacy source and is
never migrated or deleted.

The database is not browser storage, memory, or a static-file write. Production
must mount `backend/data` on durable storage, back it up, and preserve a single
SQLite writer/API instance. SQLite allows the service to scale vertically and
serve concurrent readers. If horizontal multi-writer deployment becomes a
requirement, migrate the repository and versioned SQL migrations to PostgreSQL
before adding writer replicas; do not share a SQLite file across hosts.

## Components

- `backend/src/database.mjs`: opens the configured database, applies ordered
  `PRAGMA user_version` migrations, enables foreign keys, WAL, and a busy
  timeout.
- `backend/src/library-repository.mjs`: validates approved packages, maps
  records, checks duplicates, imports batches transactionally, and persists
  audit reports.
- `backend/src/server.mjs`: read-only same-origin JSON endpoints for imported
  articles.
- `backend/src/import-packages.mjs`: explicit production CLI. It reads only
  JSON package files from the Phase 3.7 `approved-content` directory and
  separate approval records from Phase 3.9 `approvals/`; it makes no network
  calls and never creates or approves packages.
- `backend/migrations/`: append-only SQL migrations. Existing migrations are
  never edited after deployment.

The default database path is `backend/data/library.sqlite`; deployments may
set `LIBRARY_DATABASE_PATH` to a persistent volume. The import CLI and API use
the same repository and database. A missing package directory is an empty
input, not a reason to create it.

## Persistence model

`library_content` stores the validated Library presentation fields and
identity keys, plus exact JSON snapshots for the full source, rights,
provenance, original package, and explicit Library import approval. Authors
are stored as a JSON array (or JSON `null` when the package omits them).
`content_hash` is SHA-256 over the exact UTF-8 inline body bytes; no
normalization changes the imported content. `import_runs` stores one durable
audit result for each attempted import, including package candidates, approved
packages, empty, blocked, committed, and rolled-back runs. A failed content
transaction is rolled back first; its `ROLLED_BACK` audit is then written in a
separate transaction so failure evidence survives.

`package_id + version`, `source_id + content.recordId`, normalized
`canonical_url` (HTTP(S), fragment removed), and `content_hash` have
independent unique constraints. Duplicate content is blocked; there is no
replacement or upsert path.

## Transactions and concurrency

All package shape/rights/provenance/presentation checks and duplicate checks
happen before writes, independently for each package. Packages without an
approval, with unresolved rights, or with missing required presentation
metadata are marked `SKIPPED`; explicitly restricted or third-party content,
invalid approvals, and duplicates are marked `REJECTED`. These per-package
results contain package IDs and error codes/fields only, never rejected body
text. Only packages that pass every check and have a matching approval enter
the write set. That eligible write set is committed atomically with
`BEGIN IMMEDIATE`; an insert, verification, or commit error rolls back that
entire write set while preserving the per-package decisions in the audit.
SQLite unique constraints are the final concurrency-safe duplicate gate in
addition to the preflight checks. An empty input writes only a `NO_OP` audit
and no content rows.

## Migration and operations

Migrations are numbered SQL files; `user_version` advances only after a
migration succeeds. Back up the SQLite database before deploying a migration.
Migration 001 creates content and audit tables and indexes; migration 002 adds
queryable source, category, and rights columns; migration 003 records the
human import approval and approved-package audit count; migration 004 adds a
unique index for canonical URLs; migration 005 makes imported images nullable
while preserving existing records and indexes. Future schema changes append a migration and
retain all original package/provenance/approval JSON. The database file and its
WAL/SHM sidecars are runtime data and must not be committed.

For local development, run the API on port 4174 and use the Vite `/api` proxy.
In production, route same-origin `/api/*` requests to the Node service and
serve the Vite build as static assets. API readiness/storage errors are
surfaced; the frontend continues showing the unchanged static articles.

## Safety boundary

Phase 3.7 explicitly states that `ELIGIBLE`, `eligibleForPhase38: true`, and
`reviewStatus: approved` do **not** mean `APPROVED_FOR_LIBRARY_IMPORT`.
Import additionally requires a separately maintained Phase 3.9 approval JSON
in `research/phase3-9-library-storage-import/approvals/`, conforming to
`schemas/library-import-approval.schema.json`. It records the package ID and
version, exact lowercase SHA-256 of the package file bytes, approval status,
timestamp, approver, and decision. The repository verifies the approval key
and digest against the exact bytes it parses, and stores the approval snapshot
with the imported record. A changed package needs a new approval. Missing
approval skips only its matching package; an invalid approval rejects only
that package. Duplicate or orphan approval files remain an input-level
fail-closed error because they cannot be unambiguously paired. Phase 3.9
provides no approval-generation command; approval files are created only by an
authorized human process, and write access to that directory must be
restricted. `testOnly` packages are always rejected by the production
repository.

Phase 3.7 carries an optional `libraryPresentation` section. The production
import adapter requires its description, image reference (nullable), CEFR
level, genre, and reading time; absent non-image metadata blocks import and is
never inferred. An image is retained only when its exact asset has verified
rights/evidence and required attribution. Otherwise it is omitted before
package validation. Migration 005 permits the production Library record and
API model to represent no image without changing the legacy static content.

## Independent batch ingestion

Phase 3.5 evaluates item-level rights even if no source policy is registered.
An absent policy does not grant rights: verified full-text still needs a
recorded item-level public-domain, reusable-license, or documented-permission
basis, captured rights evidence, the full text, and required attribution.
License-based reuse additionally requires its item license URL/type/identifier.
Any registered explicit restriction or reuse ceiling remains binding,
including the unchanged PLOS and conditional VOA rules.
Per-record `PASS`, `SKIPPED`, and `REJECTED` outcomes are isolated so one item
does not stop evaluation of later items. Unclear rights or missing required
metadata are skipped; invalid, duplicate, explicitly prohibited, or
third-party-blocked content is rejected. Audit results contain safe IDs,
warning/error codes, and metadata only, never rejected full-text bodies.

The Phase 3.7 independent package builder operates in memory and requires
explicit reviewer/decision/timestamp input. It does not persist packages or
create approval sidecars. Phase 3.9 production import still requires the
separate human approval bound to exact package bytes. A missing item policy is
stored as `rights.sourcePolicy: null` to preserve, rather than invent,
provenance.

At implementation time both the Phase 3.7 package directory and Phase 3.9
approval directory contain zero files. The importer creates neither; an empty
input is audited as `NO_OP`.
