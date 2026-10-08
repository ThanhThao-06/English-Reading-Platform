# Phase 4.8 - Public Domain Review + Wiktionary Import Batch

A 10-article batch imported through the existing Phase 3.5 -> 3.6 -> 3.7 -> 3.9
intake, validation, approval and import workflow. **No validator, schema, source
policy, whitelist entry or runtime code was created or changed.**

## Result

| Measure | Value |
| --- | --- |
| Packages discovered | 51 |
| **Imported (this batch)** | **10** |
| Skipped | 8 |
| Rejected | 33 |
| Import outcome | `COMMITTED` |
| **Batch ID** | **`362430b8-f36b-4c20-afaf-9885f1574271`** |
| Run ID | `21c35fe3-671e-4159-a2dd-b45e1642ef05` |
| `library_content` rows before / after | 41 / 51 |

All 8 skipped and all 33 rejected packages are **pre-existing VOA and NOAA
packages** re-offered to the importer, not this batch. No PDR or Wiktionary item
was skipped or rejected, and no failing item stopped the batch.

## The 10 imported articles

### Mythology, Folklore & Dark History (5) - The Public Domain Review

| # | Record | Title | Author | Words | Rights evidence (item's own page) |
| --- | --- | --- | --- | --- | --- |
| 1 | `public-domain-review-the-mowing-devil` | The Mowing-Devil (1678), or, the Earliest Known Depiction of a Crop Circle | Thea Applebaum Licht | 553 | rights label `CC BY-SA` |
| 2 | `public-domain-review-animal-vegetable-lamb` | Animal, Vegetable, Lamb: The Zoophyte from Tartary | Thom Sliwowski | 2893 | "The text of this essay is published under a CC BY-SA license" |
| 3 | `public-domain-review-glass-delusion` | Fear and Fragility: The Glass Delusion and Its History | Tamara Sanderson | 3376 | "The text of this essay is published under a CC BY-SA license" |
| 4 | `public-domain-review-maskenfest` | Animal Costumes from the 1862 Fairytale Ball of the Jung-München Artist's Association | Thea Applebaum Licht | 631 | rights label `CC BY-SA` |
| 5 | `public-domain-review-mail-order-occult` | Magic by Return of Post: How Mail Order Delivered the Occult | Allan Johnson | 3811 | "The text of this essay is published under a CC BY-SA license" |

### Linguistics & Etymology (5) - Wiktionary

| # | Record | Title | Words | Rights evidence |
| --- | --- | --- | --- | --- |
| 6 | `wiktionary-salary` | salary | 166 | footer: "Definitions and other text are available under the Creative Commons Attribution-ShareAlike License" |
| 7 | `wiktionary-quarantine` | quarantine | 385 | same CC BY-SA footer statement |
| 8 | `wiktionary-window` | window | 233 | same CC BY-SA footer statement |
| 9 | `wiktionary-posh` | posh | 180 | same CC BY-SA footer statement |
| 10 | `wiktionary-gossip` | gossip | 157 | same CC BY-SA footer statement |

## Rights basis (verified per item)

### Public Domain Review

The publisher's site-wide page (`https://publicdomainreview.org/legal/`) says:

> All unquoted text in our Collections posts, Curator's Choice posts, and
> Conjectures posts are published under a Creative Commons Attribution-ShareAlike
> 4.0 licence (CC BY-SA). While most of the pieces in our Essays series are also
> published under a CC BY-SA licence, **some are published under more restrictive
> terms (usually the case for book excerpts)** - please see information provided
> at the end of the essay for details.

**That site-wide statement was never used to decide an item.** Each of the five
articles was re-fetched and judged only on the Creative Commons evidence printed
### Wiktionary

Every page footer carries:

> Definitions and other text are available under the Creative Commons
> Attribution-ShareAlike License; additional terms may apply.

Wiktionary's copyright page warns that entries "may include text, images, sounds,
or other material from external sources with different copyright terms ... used
with permission or under the 'fair use' doctrine", with those rights holders
retaining their rights. That material is therefore **excluded from the stored
body**, not assumed compatible. Per item the extraction removed every fair-use
quotation block, every usage example carrying a quotation, and every
File/Image link:

| Item | Third-party blocks removed |
| --- | --- |
| `window` | 14 |
| `gossip` | 26 |
| `quarantine` | 9 |
| `salary` | 2 |
| `posh` | 0 |
| `*The Mowing-Devil*` | image captions only |

Only each entry's own English **Etymology** and part-of-speech definition prose is
stored; other-language sections, translation tables and reference apparatus are
excluded. Entries are read through the official MediaWiki API with requests
paced and backed off on HTTP 429, so a throttled read is never mistaken for an
empty page.

## Audited and excluded (real findings)

| Page | Finding |
| --- | --- |
| `essay/ars-notoria/` | "Copyright © Anne-Lawrence-Mathers. All rights reserved." |
| `essay/the-great-majority/` | "© 2025 Roger Luckhurst. All rights reserved." |
| `essay/parodies-of-pedantry/` | "Reprinted by permission of Princeton University Press" |
| `essay/twilight-of-the-velocipede/` | "Reprinted by permission of Basic Books ... All rights reserved." |
| `collection/marnameh/` | rights label is `CC BY-NC-SA` only (non-commercial) |
| `collection/brahan-seer/` | rights label is `CC BY-NC-SA` only (non-commercial) |
| `collection/of-the-sympathetick-powder/` | rights label is `CC BY-NC-SA` only (non-commercial) |

Of 100 on-topic PDR candidates audited, exactly 5 carried their own permissive
article-level CC evidence. `magic-by-return-of-post` is eligible as **text only**:
its illustrations are IAPSOP `CC BY-NC` and are excluded, since no image is reused.

## Curiosity Topic tagging

Each article is tagged with its shelf in `reviewNotes` of its intake record, and
the mapping is declared once in `scripts/article-manifest.mjs`:

- 5 PDR items -> **Mythology, Folklore & Dark History**
- 5 Wiktionary items -> **Linguistics & Etymology**

**Known limitation, reported rather than worked around:** the import pipeline has
no field for a Curiosity Topic. The taxonomy is a frontend-only union
(`CuriosityTopic` in `frontend/src/types/article.ts`), `ArticleCardData` has no
curiosity field, and `matchesLibraryFilters` in `utils/libraryBrowse.ts`
deliberately holds the curiosity filter inert, with a comment stating that adding
the field "would mean touching stored article content". The intake schema
(`classification`) and the package schema (`content.categories`) both declare
`additionalProperties: false`, so a curiosity tag cannot be persisted without
changing a validator or schema. That was out of scope here, so the tag is
recorded in the intake provenance and in this manifest rather than forced into an
unrelated existing field. Persisting it properly would need the one-clause filter
change the frontend comment already describes.

## Verification

| Check | Result |
| --- | --- |
| Phase 3.5 intake validation | 0 errors across 10 records |
| Phase 3.7 package build | 10 `ELIGIBLE`, 10 hash-bound approvals written |
| Official importer | `COMMITTED`, 10 imported, batch `362430b8-...` |
| Database check | 51 rows; all 10 new rows `verified` / `verified-full-text` |
| `scripts/verify-duplicate-gate.mjs` (temp database) | IDEMPOTENCY CHECK PASSED (9 checks) |
| Phase 3.5 intake tests | 31 scenarios, 108 assertions pass |
| `backend` `npm test` | 20/21 pass - see note |

The duplicate gate is proven on a throwaway database: run 1 imports all 43
importable packages, run 2 imports 0 and rejects all 43 with
`DUPLICATE_PACKAGE_VERSION, DUPLICATE_SOURCE_CONTENT_ID, DUPLICATE_CANONICAL_URL,
DUPLICATE_CONTENT_HASH`, outcome `BLOCKED`. The Phase 4.7 copy of that script
hardcodes a total of 33 packages and now fails its count assertions only; this
phase's copy is count-agnostic (run 1 compared against run 2), so it stays valid
as later batches add packages.

### Pre-existing test failure (not caused by this batch)

`backend` - "production command with an absent approved-package directory records
zero imported" expects `NO_OP` but gets `BLOCKED`, because the real approvals
directory is non-empty so the importer correctly reports orphaned approvals. This
is the failure already documented in the Phase 4.7 README; it assumes a pristine
repository that Phases 4.1/4.5/4.6/4.7 had already invalidated. It was left
unmodified.

## Reproduce

```powershell
node research/phase4-8-pdr-wiktionary/scripts/audit-pdr.mjs
node research/phase4-8-pdr-wiktionary/scripts/audit-wiktionary.mjs
node research/phase4-8-pdr-wiktionary/scripts/build-packages.mjs
cd backend; npm run import
node research/phase4-8-pdr-wiktionary/scripts/verify-duplicate-gate.mjs
```
on that article's own page - either the essay's own licence sentence or its
rights label. An item is excluded on any of:

- no article-level CC evidence;
- `All rights reserved`;
- `Reprinted by permission of <publisher>`;
- a NonCommercial-only licence (`CC BY-NC` / `CC BY-NC-SA`), which can never
  satisfy the CC BY / CC BY-SA requirement.

PDR also states it **does not assert rights over the historical images it
features**, so no image or media is reused: `imageReference` is `null` on every
item and no asset evidence is recorded.