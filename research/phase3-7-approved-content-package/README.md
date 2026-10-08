# Phase 3.7 - Approved Content Package

Phase 3.7 defines and validates a versioned content package with traceable
source, rights evidence, attribution, validation, review, and provenance.
`ELIGIBLE` means eligible for a separate Phase 3.8 integration plan only; it is
not approval to import into the Library. This phase has no app integration,
database writes, publication, or network access.

## Current real-data outcome

The Phase 3.6 report currently has 0 `PASS`, 2 `BLOCKED`, 6 `REVIEW_REQUIRED`,
0 `readyForPhase37Review`, and 0 `approvedForLibraryImport`. Accordingly,
Phase 3.7 creates **0 packages** and no `approved-content/` directory. PLOS
remains `unknown` / `link-only`; VOA remains `partially-verified` /
`metadata-only`. These policies are loaded and checked, never changed.

## Run

From the project root:

```powershell
node research/phase3-7-approved-content-package/scripts/build-package.mjs
node research/phase3-7-approved-content-package/scripts/package-tests.mjs
```

The builder reads the Phase 3.4 manifest, Phase 3.5 policy fixtures and
validator, and Phase 3.6 JSON results. It writes the package report under
`reports/`; package files are written only for records passing every
eligibility gate, under `approved-content/`, with overwrite protection. It
does not persist synthetic tests.

Synthetic positive-path test data is constructed only in memory and is marked
test-only. It is never emitted as an approved content package or represented
as real content, rights evidence, or production eligibility.

`buildPackagesFromIntake()` is also available for independent future batch
records. It evaluates each record against Phase 3.5 and the package gates,
requires explicit reviewer input, returns package objects in memory only, and
does not write package files or approval sidecars. A registered source policy
remains binding when present; otherwise the item must pass item-level rights
checks. Unsafe/unverified images are omitted and reported without blocking
otherwise eligible text.

See `docs/package-specification.md` for package shape and versioning, and
`docs/package-validation-rules.md` for eligibility gates and stable issue
codes.
