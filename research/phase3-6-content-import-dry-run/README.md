# Phase 3.6 - Content Import Dry Run

This is a read-only dry run of the Phase 3.4 pilot records through the Phase
3.5 intake validator. It writes only the generated JSON and Markdown reports
under this directory. It does not import into the app, create an approved
content package, publish, write a database, read abstract/body files, or make
network requests.

The same module exports an independent per-article dry-run function for future
batch intake. It reports `PASS`, `SKIPPED`, or `REJECTED` plus safe error and
warning codes without echoing content bodies or creating packages/approvals.
A single skipped or rejected item does not stop evaluation of later items.

## Run

From the project root:

```powershell
node research/phase3-6-content-import-dry-run/scripts/dry-run.mjs
node research/phase3-6-content-import-dry-run/scripts/dry-run-tests.mjs
```

Or run `node scripts/dry-run.mjs` and `node scripts/dry-run-tests.mjs` from
this directory. Inputs are read from the Phase 3.4 manifest and Phase 3.5
source-policy fixtures. The actual Phase 3.5 `validateIntake` function is
called on all mapped Phase 3.4 records; errors are not suppressed or repaired.

The adapter deliberately preserves the item reuse mode from Phase 3.4. In
particular, the two PLOS item decisions still request `verified-full-text`,
which conflicts with the unchanged PLOS `unknown` / `link-only` source policy.
Their abstract-only retained artifacts are never opened or passed as intake
body. The six VOA records preserve the absent canonical URL as `null`; the RSS
link is not asserted to be a verified canonical URL. Missing facts remain
visible to the validator and reviewer.

The Phase 3.4 records are source-derived pilot data; Phase 3.5 synthetic
fixtures are not included in this run. `PASS` means only ready for a further
human Phase 3.7 review, not approval to import. No record is marked
`APPROVED_FOR_LIBRARY_IMPORT`.
