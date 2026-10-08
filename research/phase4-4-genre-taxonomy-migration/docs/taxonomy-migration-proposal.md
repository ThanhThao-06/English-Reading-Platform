# Genre Taxonomy Migration — Proposal (2026-10-04)

**Status: DESIGN ONLY. Nothing in this document has been applied.**

No code, schema, migration, database, whitelist or rights-policy file was
modified. The proposed SQL lives in
`research/phase4-4-genre-taxonomy-migration/proposed/006-expanded-genre-taxonomy.sql`,
deliberately **outside** `backend/migrations/`.

> ### Why it is NOT in `backend/migrations/`
> `backend/src/database.mjs:20-38` auto-applies every file matching
> `/^\d{3}-.*\.sql$/` in that directory, in order, gated on `user_version`.
> Dropping a `006-*.sql` there would **execute it immediately** the next time
> the server or the importer opens the database. It stays here until approved.

---

## 1. The blocker this resolves

The genre vocabulary is a closed enum in **four** places. Verified by running
the real `validatePackage` against the real source policies:

| Probe genre | `validatePackage` result |
|---|---|
| `Society` (control) | `eligible: true` / `ELIGIBLE` |
| `Education`, `History`, `Environment`, `Health & Psychology`, `Technology & AI`, `Culture, Art & Travel` | `eligible: false` / `NOT_ELIGIBLE` — `PACKAGE_SCHEMA_INVALID: libraryPresentation.genre has an unsupported value` |

| # | Location | Current value |
|---|---|---|
| 1 | `research/phase3-7-approved-content-package/scripts/build-package.mjs:33` | `LIBRARY_GENRES` |
| 2 | `backend/src/library-repository.mjs:5` | `GENRES` |
| 3 | `frontend/src/types/article.ts:1-6` | `type Genre` |
| 4 | `backend/migrations/001-initial.sql:12`, `005:12` (live) | SQL `CHECK (genre IN (...))` |

Live database state: `user_version = 5`; `library_content` DDL matches the
output of migration 005; 9 rows; all five audit columns non-NULL
(`rights_json`, `source_json`, `provenance_json`, `package_json`,
`import_approval_json`).

---

## 2. Proposed changes

### 2.1 New migration `006-expanded-genre-taxonomy`

Rebuilds `library_content` with the 11-value CHECK, copying every column 1:1
and remapping only `genre`. Follows the exact pattern of migration 005.
Full SQL: `proposed/006-expanded-genre-taxonomy.sql`.

### 2.2 `build-package.mjs:33`

```diff
-const LIBRARY_GENRES = new Set(['News', 'Business & Economics', 'Science', 'Society', 'Fiction / Stories']);
+const LIBRARY_GENRES = new Set([
+  'News & Social Issues',
+  'Science & Nature',
+  'Technology & AI',
+  'Business & Economics',
+  'Health & Psychology',
+  'Culture, Art & Travel',
+  'Stories & Literature',
+  'Education',
+  'History',
+  'Environment',
+  'Law & Politics',
+]);
```

### 2.3 `backend/src/library-repository.mjs:5`

```diff
-const GENRES = new Set(['News', 'Business & Economics', 'Science', 'Society', 'Fiction / Stories']);
+const GENRES = new Set([
+  'News & Social Issues',
+  'Science & Nature',
+  'Technology & AI',
+  'Business & Economics',
+  'Health & Psychology',
+  'Culture, Art & Travel',
+  'Stories & Literature',
+  'Education',
+  'History',
+  'Environment',
+  'Law & Politics',
+]);
```

### 2.4 `frontend/src/types/article.ts:1-6`

```diff
 export type Genre =
-  | 'News'
-  | 'Business & Economics'
-  | 'Science'
-  | 'Society'
-  | 'Fiction / Stories';
+  | 'News & Social Issues'
+  | 'Science & Nature'
+  | 'Technology & AI'
+  | 'Business & Economics'
+  | 'Health & Psychology'
+  | 'Culture, Art & Travel'
+  | 'Stories & Literature'
+  | 'Education'
+  | 'History'
+  | 'Environment'
+  | 'Law & Politics';
```


---

## 3. Forced ripple (NOT optional UI work)

§2.4 changes the `Genre` union, so TypeScript breaks in four further places.
These are compile/runtime consequences of the type change, **not** UI redesign,
and they must land in the same commit:

| # | File | What breaks | Fix |
|---|---|---|---|
| 5 | `frontend/src/data/articles.ts` | 10 × `genre:` values use removed strings | remap per §4.1 |
| 6 | `frontend/src/hooks/useLibraryData.ts:5` | `GENRES` set rejects every new API value → `useImportedArticles` throws "invalid article list" and **the whole Library shows zero imported articles** | widen `GENRES` to the 11 values |
| 7 | `frontend/src/components/FilterBar.tsx:14-21` | `GENRE_OPTIONS` still lists the old 5 | rebuild from the 11 values (see §6 R2) |
| 8 | `frontend/src/utils/libraryBrowse.ts` | `GENRE_PRESENTATION_ORDER` is the fallback ordering used by `buildGenreIndex`, `resolveGenreParam` and `getGenreRoute` | rebuild to the 11 values |

**Nothing else in the frontend needs to change.** The rule "a genre with no
articles must not be displayed" is **already satisfied**: `buildGenreIndex`
(`utils/libraryBrowse.ts`) derives the list from the articles actually
available, and the Library/Genre pages render only that list. Empty genres
cannot appear without further work.

---

## 4. Genre mapping

Rule applied throughout: **primary genre = the article's main subject, not its
form.** A news report *about* solar-cell research is Science & Nature, not News.

### 4.1 The 10 bundled articles (`data/articles.ts` — no DB rows)

| id | Title | Old | New | Basis |
|---|---|---|---|---|
| art-001 | Deep Ocean Hydrothermal Vents | Science | **Science & Nature** | marine geology / chemosynthesis |
| art-002 | Global Supply Chains in Automation | Business & Economics | **Business & Economics** | unchanged; technology is secondary |
| art-003 | Pocket forests / urban rewilding | Society | **Environment** | recorded `environment, society` — Society was a mis-file |
| art-004 | Solar cell efficiency record | News | **Science & Nature** | form is news, subject is science (recorded `science, technology, environment`) |
| art-005 | The Clockmaker of Prague, Part 1 | Fiction / Stories | **Stories & Literature** | form governs a narrative |
| art-006 | Atmospheric microplastics → clouds | Science | **Science & Nature** | recorded `science, environment` |
| art-007 | Circular economy / apparel | Business & Economics | **Business & Economics** | recorded `business, environment` |
| art-008 | Oral storytelling in prehistory | Society | **History** | recorded `history, culture` — Society was a mis-file |
| art-009 | Morning forest walk narrative | Fiction / Stories | **Stories & Literature** | form governs |
| art-010 | Reading concentration / micro-friction | Society | **Health & Psychology** ⚠️ | recorded `psychology, education` — borderline vs Education, **needs a decision** |

### 4.2 The 9 imported articles (`library_content` — remapped by the SQL)

Keyed on `source_record_id`, exactly as written in the proposed SQL.

| source_record_id | Title | Old | New | Recorded categories | Confidence |
|---|---|---|---|---|---|
| 3947928 | Learning English with English Clubs | Society | **Education** | primary `education` | High |
| 5649722 | How to Write a Good Email | Business & Economics | **Education** | primary `career`; sec. `education, language-learning` | Medium — defensible as Business & Economics |
| 7940837 | Sometimes We 'Spread Ourself Too Thin' | Society | **Health & Psychology** | primary `language-learning`; sec. `psychology, society` | Medium |
| 7963076 | What Does It Take to Be a 'Power Couple'? | Society | **Education** | primary `language-learning`; sec. `society` | Medium |
| 7979814 | The Importance of Being 'Dialed In' | Society | **Education** | primary `language-learning`; sec. `technology` | Medium |
| 7980848 | How to Dish Up Something Good | Society | **Culture, Art & Travel** | primary `language-learning`; sec. `food, culture` | Medium |
| 7990415 | Lincoln's Cottage | Society | **History** | primary `history`; sec. `culture` | High |
| 7998765 | Wilbur and Orville Wright | Science | **Science & Nature** | primary `science`; sec. `history, technology` | High |

### 4.3 Resulting distribution (19 articles)

| New genre | Count | Source |
|---|---|---|
| Education | 5 | 5 imported |
| Science & Nature | 4 | 1 imported + 3 bundled |
| Business & Economics | 2 | 2 bundled |
| Health & Psychology | 2 | 1 imported + 1 bundled |
| History | 2 | 1 imported + 1 bundled |
| Stories & Literature | 2 | 2 bundled |
| Environment | 1 | 1 bundled |
| Culture, Art & Travel | 1 | 1 imported |
| **News & Social Issues** | **0** | — |
| **Technology & AI** | **0** | — |
| **Law & Politics** | **0** | — |

Largest shelf drops from 53% (Society) to 26% (Education). Three shelves are
deliberately empty and must not render.

---

## 5. Applying it (when approved — NOT now)

1. Copy `proposed/006-expanded-genre-taxonomy.sql` → `backend/migrations/006-expanded-genre-taxonomy.sql`.
2. Apply §2.2, §2.3, §2.4 and the §3 ripple **in one commit**.
3. Open the database once (server start or `npm run import`); `database.mjs`
   applies 006 and sets `user_version = 6`.
4. Only then import the 13 audited articles.

### Verification checklist after step 3

```sql
SELECT COUNT(*) FROM library_content;                                  -- expect 9
SELECT genre, COUNT(*) FROM library_content GROUP BY genre;             -- expect §4.2
SELECT COUNT(*) FROM library_content
  WHERE rights_json IS NULL OR source_json IS NULL
     OR provenance_json IS NULL OR package_json IS NULL
     OR import_approval_json IS NULL;                                   -- expect 0
SELECT title, json_extract(rights_json,'$.attributionText') FROM library_content; -- credit intact
```

Also byte-compare `rights_json` / `source_json` / `provenance_json` /
`package_json` / `import_approval_json` before vs after; they must be identical.

---

## 6. Risks and known consequences

| # | Risk | Handling |
|---|---|---|
| R1 | Migration auto-applies on any DB open | File is outside `backend/migrations/` until approved. Copy it in as the last step. |
| R2 | `FilterBar`'s static `GENRE_OPTIONS` would offer empty genres | **Deferred follow-up:** drive the dropdown from `buildGenreIndex` so only genres with articles appear. Not done in this proposal. |
| R3 | The 9 existing packages in `approved-content/` still say the old genre names | Re-running `npm run import` after the migration would mark them `REJECTED` (genre not in the new set) instead of `IMPORTED`. Harmless — they are already in the DB and duplicates are caught anyway — but noisy. Option: leave them as historical artefacts. |
| R4 | Two low-confidence mappings | `art-010` and `8003108` are flagged ⚠️. A human decision is needed before the migration is finalised; both are one-line changes. |
| R5 | Frontend `Genre` union change alone is not deployable | §3 ripple must ship together or the Library shows zero imported articles. |
| R6 | `frontend/scripts/metadataTests.ts` asserts on genre-adjacent metadata | Not on `Genre` itself, but the full test run is warranted once §2.4 lands, since 5 frontend files change. |

---

## 7. Explicitly NOT done

- Migration **not applied**; `user_version` is still `5`.
- `build-package.mjs`, `library-repository.mjs`, `types/article.ts`,
  `articles.ts`, `useLibraryData.ts`, `FilterBar.tsx`, `libraryBrowse.ts` —
  **unmodified**.
- Migrations `001-initial.sql` and `005-optional-imported-image.sql` —
  **unmodified** (immutable history; live DB is already past them).
- No whitelist / source-policy change. No rights policy change.
- The **13 audited articles were NOT imported**. They remain blocked until the
  taxonomy lands.
- No regression suite run — no functional code changed.

| 8003108 | 'Watching the Grass Grow' Is Not Fun | Society | **Education** ⚠️ | primary `language-learning`, **no secondary** | **Low** — title suggests health/wellbeing; **needs a decision** |

**No article is mapped to `Law & Politics`, `Technology & AI` or
`News & Social Issues`**, because no current article belongs to them. Those
genres exist in the schema and stay empty until real content arrives.
