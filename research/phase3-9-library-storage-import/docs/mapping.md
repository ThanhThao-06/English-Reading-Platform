# Approved Package → Content Model → Reading Library

The database record preserves the original package snapshot, rights, and
provenance independently of the smaller `Article` view model used by the UI.
Mapping is deterministic and does not enrich missing facts.

| Approved Content Package | Library content model / database | Reading Library view |
| --- | --- | --- |
| `packageId`, `version` | `package_id`, `package_version`; unique pair | Stable id derived from the package key |
| `content.recordId` | `source_record_id` | Not shown |
| `content.title` | `title` | `Article.title` |
| `content.body` | `body`; SHA-256 stored as `content_hash` | `Article.content` |
| `libraryPresentation.description` | `description` | `Article.description` |
| `libraryPresentation.imageReference` | `image_reference` | `Article.image` |
| `libraryPresentation.level` | `level` | `Article.level` |
| `libraryPresentation.genre` | `genre` | `Article.genre` |
| `libraryPresentation.readingTime` | `reading_time` | `Article.readingTime` |
| `content.language` | `language` | `Article.importMetadata.content.language` |
| `content.contentType` | `content_type` | `Article.importMetadata.content.contentType` |
| `content.contentGroup`, categories | `content_group`, `categories_json`; full package JSON | `Article.importMetadata.content` |
| `source.sourceId`, `source.sourceName` | `source_id`, `source_name`; full `source_json` | `Article.importMetadata.source` |
| `source.canonicalUrl` | `canonical_url`; full `source_json` | `Article.importMetadata.source` |
| `source.externalId`, DOI, optional source URL | `external_id`, `doi`, `source_url` (null when absent), and full `source_json` | Retained in database; no lossy UI projection |
| `content.authors` | `authors_json` (null when absent) and original package JSON | Full author list in `Article.importMetadata.authors`; never reduced to a guessed single author |
| `rights.verificationStatus`, `permittedReuseMode` | `rights_status`, `reuse_mode`; exact `rights_json` | `Article.importMetadata.rights`; no lossy legacy license projection |
| `rights.*` including policy/license/attribution/evidence | Exact `rights_json` | Full snapshot in `Article.importMetadata.rights` |
| `provenance.*` | Exact `provenance_json` | Full snapshot in `Article.importMetadata.provenance` |
| Phase 3.9 approval sidecar (`approvalStatus`, package identity, exact package SHA-256, approver, decision, timestamp) | `import_approval_json`; binds and audits import authorization | `Article.importMetadata.libraryImportApproval` |
| `createdAt` and import execution | `imported_at`, `import_batch_id` | Not shown |

The Phase 3.7 package's `ELIGIBLE` status and its review approval are not
production import authorization. Import requires a separate human-created
`APPROVED_FOR_LIBRARY_IMPORT` sidecar in
`research/phase3-9-library-storage-import/approvals/`; the SHA-256 must match
the exact package-file bytes. See
[`library-import-approval.schema.json`](../schemas/library-import-approval.schema.json).
Changing even formatting bytes in the package invalidates the authorization.

Duplicate preflight covers package ID/version, stable source/content ID,
normalized canonical URL (HTTP(S), fragment removed), and exact body SHA-256;
database uniqueness provides the final concurrency gate for each key.

Description, level, genre, and reading time must be explicitly present and
valid. `imageReference` must be explicit but may be `null`. A non-null image
requires an `asset-rights` evidence entry with `scope: asset` and
`appliesToRecordId` equal to the package content record ID. Unverified or
unmatched media is omitted during package construction; the evidence record is
retained verbatim in `rights_json`, and the importer does not contact its URL
or attest to its truth.

If description, level, genre, reading time, body, source
identity, rights, or required provenance is absent, the whole import batch is
blocked. No default genre/level/time, generated summary, placeholder image URL,
author, rights status, canonical URL, or chapter boundary is supplied.

Static `Article` entries continue to come directly from
`frontend/src/data/articles.ts`. The API returns imported articles alongside
them at runtime. Imported articles have no chapters unless a future package
contract explicitly carries reviewed chapter data; the current package does
not, so none are fabricated.
