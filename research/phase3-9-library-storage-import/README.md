# Phase 3.9 Library Storage & Production Import Layer

This phase adds durable storage and an explicit production import command. It
does not create or import real content. Existing static articles remain the
legacy Library source.

## Run

Install backend dependencies once:

```powershell
Set-Location backend
npm install
```

Run the service and import command in separate shells:

```powershell
npm start
npm run import
```

The service uses `backend/data/library.sqlite` unless
`LIBRARY_DATABASE_PATH` points to a durable volume. The Vite development server
proxies `/api` to `http://localhost:4174`. Production must route same-origin
`/api/*` to the Node API.

The import command reads JSON package files under the Phase 3.7
`approved-content/` directory and separate human approval sidecars under
`research/phase3-9-library-storage-import/approvals/`. It creates neither
directory and makes no network requests. Phase 3.7 `ELIGIBLE` plus
`reviewStatus: approved` is not production import approval: each package needs
a sidecar conforming to
[`library-import-approval.schema.json`](./schemas/library-import-approval.schema.json)
with `approvalStatus: APPROVED_FOR_LIBRARY_IMPORT`, matching package ID and
version, the exact SHA-256 of the package file bytes, timestamp, approver, and
decision. The sidecar must be created by the authorized human approval process;
Phase 3.9 provides no approval-generation command. Limit write access to the
approval directory. A package changed after approval is blocked.

Unapproved candidates, malformed or mismatched approvals, and orphan approval
files fail closed and are audited. The CLI refuses synthetic test packages.
With no packages and no approval files, it records an audited `NO_OP` and
reports zero package candidates, zero approved packages, and zero imports.

## Checks

```powershell
npm test
```

See [storage architecture](./docs/architecture.md) and
[field mapping](./docs/mapping.md). The required result and test/regression
summary are in [the Phase 3.9 report](./reports/phase3-9-report.md).
