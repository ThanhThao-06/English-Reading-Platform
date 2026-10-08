-- ===========================================================================
-- PROPOSAL ONLY - NOT APPLIED. DO NOT MOVE INTO backend/migrations/ YET.
-- ===========================================================================
-- Proposed migration: 006-expanded-genre-taxonomy
--
-- Expands library_content.genre CHECK from the 5 original genres to the
-- approved 11-genre taxonomy, and remaps the 9 already-imported rows.
--
-- WHY THIS REBUILDS THE TABLE
--   SQLite cannot ALTER a CHECK constraint. Migration 005 already rebuilt
--   library_content this way; the pattern is reproduced exactly below.
--
-- WHAT IS PRESERVED
--   Every column is copied 1:1, including rights_json, source_json,
--   provenance_json, package_json and import_approval_json. Only the `genre`
--   value is transformed. Verified on the live database: all 9 rows have
--   those five columns non-NULL, so nothing is lost or defaulted.
--
-- WHY THE REMAP IS INLINE
--   The new 11-genre list deliberately does NOT contain the old names
--   ('News', 'Science', 'Society', 'Fiction / Stories'), so leaving the data
--   untouched would violate the new CHECK. The remap is keyed on
--   source_record_id (stable VOA page identity), not `id` (a package-hash
--   derivative), so it stays correct and auditable.
--
-- EDITING MIGRATIONS 001/005 IS NOT REQUIRED AND MUST NOT BE DONE
--   The live database is at user_version = 5, so 001-005 are already applied
--   and never re-run. Editing them would only corrupt a from-scratch replay.
--

CREATE TABLE library_content_new (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  package_version INTEGER NOT NULL CHECK (package_version > 0),
  source_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  image_reference TEXT,
  level TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  genre TEXT NOT NULL CHECK (genre IN (
    'News & Social Issues',
    'Science & Nature',
    'Technology & AI',
    'Business & Economics',
    'Health & Psychology',
    'Culture, Art & Travel',
    'Stories & Literature',
    'Education',
    'History',
    'Environment',
    'Law & Politics'
  )),
  reading_time TEXT NOT NULL CHECK (reading_time IN ('Under 3 min', '5–10 min', 'Chapter')),
  language TEXT,
  content_type TEXT,
  source_name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  authors_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_json TEXT NOT NULL,
  rights_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  package_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  source_url TEXT,
  external_id TEXT,
  doi TEXT,
  content_group TEXT,
  categories_json TEXT,
  rights_status TEXT,
  reuse_mode TEXT,
  import_approval_json TEXT,
  UNIQUE (package_id, package_version),
  UNIQUE (source_id, source_record_id),
  UNIQUE (content_hash)
);

INSERT INTO library_content_new (
  id, package_id, package_version, source_id, source_record_id,
  title, description, body, image_reference, level, genre, reading_time,
  language, content_type, source_name, canonical_url, authors_json, content_hash,
  source_json, rights_json, provenance_json, package_json, imported_at, import_batch_id,
  source_url, external_id, doi, content_group, categories_json, rights_status, reuse_mode,
  import_approval_json
)
SELECT
  id, package_id, package_version, source_id, source_record_id,
  title, description, body, image_reference, level,
  -- Genre remap: subject-based, not form-based.
  -- Per-row rationale and confidence level are in
  -- docs/taxonomy-migration-proposal.md.
  CASE source_record_id
    WHEN 'voa-learning-english-3947928' THEN 'Education'              -- English Clubs (primary: education)
    WHEN 'voa-learning-english-5649722' THEN 'Education'              -- Good Email (career; secondary: education)
    WHEN 'voa-learning-english-7940837' THEN 'Health & Psychology'     -- Spread Ourself Too Thin (secondary: psychology)
    WHEN 'voa-learning-english-7963076' THEN 'Education'              -- Power Couple (primary: language-learning)
    WHEN 'voa-learning-english-7979814' THEN 'Education'              -- Dialed In (primary: language-learning)
    WHEN 'voa-learning-english-7980848' THEN 'Culture, Art & Travel'  -- Dish Up Something Good (food, culture)
    WHEN 'voa-learning-english-7990415' THEN 'History'                -- Lincoln's Cottage (primary: history)
    WHEN 'voa-learning-english-7998765' THEN 'Science & Nature'       -- Wilbur and Orville Wright (primary: science)
    WHEN 'voa-learning-english-8003108' THEN 'Education'              -- Watching the Grass Grow (language-learning)
  END,
  reading_time,
  language, content_type, source_name, canonical_url, authors_json, content_hash,
  source_json, rights_json, provenance_json, package_json, imported_at, import_batch_id,
  source_url, external_id, doi, content_group, categories_json, rights_status, reuse_mode,
  import_approval_json
FROM library_content;

-- No ELSE branch on purpose. An unknown source_record_id yields NULL, and
-- `genre TEXT NOT NULL` makes the INSERT fail, aborting the whole transaction.
-- A future import can therefore never land in this table unremapped.

DROP TABLE library_content;
ALTER TABLE library_content_new RENAME TO library_content;

CREATE INDEX library_content_imported_at_idx ON library_content (imported_at);
CREATE INDEX library_content_title_idx ON library_content (title);
CREATE UNIQUE INDEX library_content_canonical_url_unique_idx
  ON library_content (canonical_url);

