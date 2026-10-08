ALTER TABLE library_content ADD COLUMN import_approval_json TEXT;
ALTER TABLE import_runs ADD COLUMN approved_packages_discovered INTEGER NOT NULL DEFAULT 0
  CHECK (approved_packages_discovered >= 0);
