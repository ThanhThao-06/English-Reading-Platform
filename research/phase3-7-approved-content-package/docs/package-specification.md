# Approved Content Package specification

## Purpose and boundary

A package is a versioned, auditable snapshot of one intake record after intake
validation, source-policy checks, item-rights checks, and a completed human
review. Package status `ELIGIBLE` means only that the record can be considered
by Phase 3.8. Phase 3.7 never imports, publishes, or labels a record
`APPROVED_FOR_LIBRARY_IMPORT`.

The current Phase 3.6 results contain no eligible records. Therefore this
phase defines package infrastructure but emits no real package and creates no
`approved-content/` directory.

## Package components

`schemas/approved-content-package.schema.json` defines a closed JSON object
with:

- `schemaVersion`, stable `packageId`, positive integer `version`, UTC
  `createdAt`, optional `supersedes`, `packageStatus`, and
  `eligibleForPhase38`;
- content identity and metadata, classifications, language (nullable until
  actually known), reuse mode, and either inline body or a body reference;
- source identity/name, canonical URL, and source URL, DOI and external
  identifier (optional facts remain null when absent in the source record);
- item rights decision plus a separately recorded source policy ceiling,
  license fields, attribution requirement/text, and typed evidence records;
- intake validation result, review decision and reviewer/time where recorded;
- provenance joining the original Phase 3.4 ID, Phase 3.5 intake ID/schema
  version, Phase 3.6 per-record result, review status, source manifest and
  package creation time.
- optional `libraryPresentation` for the separately recorded, reviewed fields
  needed by the existing Article UI: description, image reference, CEFR level,
  genre, and reading time. Phase 3.7 validates its shape when supplied. Phase
  3.9 production import requires the metadata and permits a null image. A
  non-null image is retained only when the exact referenced asset has verified
  rights/evidence and required attribution; otherwise package construction
  omits it and preserves the eligible text candidate.

No missing author, source URL, language, license identifier, evidence date,
reviewer, or citation is invented. The source name and canonical article URL
remain required. Null is allowed for optional facts in the schema; the Library
presentation still requires title, description, level, genre/category,
reading time, and eligible full text.

## Package status lifecycle

- `DRAFT`: assembled candidate, not validated.
- `VALIDATED`: schema and structural checks pass, but eligibility gates have
  not all been satisfied.
- `ELIGIBLE`: all defined package, source, evidence, validation, review,
  provenance and duplicate checks pass. `eligibleForPhase38` is true.
- `NOT_ELIGIBLE`: one or more gates fail.
- `REJECTED`: an explicit review rejection; never built as an eligible
  package.

Only `ELIGIBLE` packages may be emitted to `approved-content/`. That directory
is created only when a real eligible package is actually emitted. Synthetic
test objects are never emitted, even if a test exercises the positive-path
eligibility logic.

## Rights and evidence

Source policy, item-level rights evidence, and package status are distinct. A
registered source policy is an additional constraint, not an intake
prerequisite. Without one, full-text still requires verified item-level
public-domain, reusable-license, or documented-permission basis and captured
evidence, with required attribution. A license basis requires its item license
URL/type/identifier; the other bases do not require an invented license
document. Any registered restricted policy or reuse ceiling remains a hard
veto.
Every evidence item states its type, source URL, reference, retrieval date
when recorded, scope (`source`, `item`, or `asset`), and exact record it
applies to. A URL is a pointer, not proof that the license is applicable.
Full-text requires verified item rights, an item-specific license and
evidence, and attribution where required. Item-level statements cannot raise
a registered source ceiling. Media evidence is asset-scoped and independently
checked; unverified media is omitted without blocking otherwise eligible text.

## Versioning and traceability

`packageId` identifies the logical content record; `version` increments when
rights, evidence, metadata, body/reference, or review decision changes.
`supersedes` points to the prior `packageId@version` when a new version
replaces it. The builder refuses to overwrite an existing package path.
Duplicate identity checks cover record ID, source plus external ID, DOI,
canonical URL, and package ID/version. Similar titles alone do not trigger
merge or automatic duplicate rejection.

The trace chain is:

```text
possible Phase 3.8 library item
  -> eligible Phase 3.7 package and version
  -> Phase 3.4 source record / source policy
  -> item/source rights evidence
  -> Phase 3.5 intake validation and Phase 3.6 dry-run record result
```

No Phase 3.8 item exists as a result of this phase.
