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
  genre TEXT NOT NULL CHECK (genre IN ('News', 'Business & Economics', 'Science', 'Society', 'Fiction / Stories')),
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
  title, description, body, image_reference, level, genre, reading_time,
  language, content_type, source_name, canonical_url, authors_json, content_hash,
  source_json, rights_json, provenance_json, package_json, imported_at, import_batch_id,
  source_url, external_id, doi, content_group, categories_json, rights_status, reuse_mode,
  import_approval_json
FROM library_content;

DROP TABLE library_content;
ALTER TABLE library_content_new RENAME TO library_content;

CREATE INDEX library_content_imported_at_idx ON library_content (imported_at);
CREATE INDEX library_content_title_idx ON library_content (title);
CREATE UNIQUE INDEX library_content_canonical_url_unique_idx
  ON library_content (canonical_url);
