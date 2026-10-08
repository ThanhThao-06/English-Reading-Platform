# Reading Library mapping assessment

## Observed architecture

`ReadingLibrary.tsx`, `ArticleDetail.tsx`, and `Reader.tsx` read from the
static `ARTICLES_DATA` array in `frontend/src/data/articles.ts`. Optional
metadata is keyed by article ID in `articleEnrichment.ts`. Existing
localStorage utilities persist reader progress, highlights, flashcards, and
vocabulary; they are not content stores. No article import API, content
database, or transactional persistence adapter was found.

This phase does not edit or import the frontend modules.

## Field mapping and gaps

| Phase 3.7 package value | Existing Library field | Assessment |
| --- | --- | --- |
| `packageId` + `version` | `Article.id` | A derived ID is possible, but the original package/version must also be retained as provenance; no current Article field stores it. |
| `content.title` | `Article.title` | Direct, subject to package validation. |
| `content.body` | `Article.content` | Only a non-empty, item-cleared `verified-full-text` body can map. The current Phase 3.4/3.7 set has no eligible package. |
| content categories/group/type/language | `ArticleEnrichment` | Mostly expressible through existing taxonomy and optional fields; mapping must use exact supported enum values and preserve source values. |
| authors, source URL, publication date | `ArticleEnrichment.source` | Only a single author and limited source metadata fit; authorship list, source ID, external ID, and DOI are not represented. |
| licence and attribution | `ArticleEnrichment.license` | Some fields fit, but source policy, evidence scope, evidence excerpts, multiple evidence records, and verification provenance do not. |
| `description` | `Article.description` | Missing in package; cannot be generated or inferred. Requires separately reviewed editorial input. |
| cover `image` | `Article.image` | Missing in package; a separately rights-cleared asset and attribution are required. |
| `genre`, CEFR `level`, `readingTime` | Required `Article` fields | Missing; genre/level require editorial assessment and reading time needs an agreed derivation. None may be invented by the importer. |
| chapters | optional `Article.chapters` | Not represented in package. No chapter boundaries may be fabricated. |
| complete package evidence/provenance | No complete destination field | Cannot be durably preserved by current Article/ArticleEnrichment types. A sidecar or app model/storage design would be required outside this phase. |

Because several required Article fields and full provenance have no safe,
lossless target, `LIBRARY_MAPPING_VALID` must not pass for production with the
current architecture. A complete test-only mapping can be supplied to the
in-memory transaction tests; it is synthetic and does not establish a
production mapping.

## Data flow

No data flow from Phase 3.7 into `articles.ts`, `articleEnrichment.ts`,
chapters, app storage, or the built frontend is performed. A future integration
requires a separately approved destination design, explicit mapping decisions,
and a provenance-preserving writer before the gate may be enabled.
