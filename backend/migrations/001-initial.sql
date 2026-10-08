CREATE TABLE library_content (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  package_version INTEGER NOT NULL CHECK (package_version > 0),
  source_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  image_reference TEXT NOT NULL,
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
  UNIQUE (package_id, package_version),
  UNIQUE (source_id, source_record_id),
  UNIQUE (content_hash)
);

CREATE INDEX library_content_imported_at_idx ON library_content (imported_at);
CREATE INDEX library_content_title_idx ON library_content (title);

CREATE TABLE import_runs (
  run_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK (outcome IN ('NO_OP', 'BLOCKED', 'COMMITTED', 'ROLLED_BACK')),
  packages_discovered INTEGER NOT NULL CHECK (packages_discovered >= 0),
  records_imported INTEGER NOT NULL CHECK (records_imported >= 0),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  report_json TEXT NOT NULL
);
