ALTER TABLE library_content ADD COLUMN source_url TEXT;
ALTER TABLE library_content ADD COLUMN external_id TEXT;
ALTER TABLE library_content ADD COLUMN doi TEXT;
ALTER TABLE library_content ADD COLUMN content_group TEXT;
ALTER TABLE library_content ADD COLUMN categories_json TEXT;
ALTER TABLE library_content ADD COLUMN rights_status TEXT;
ALTER TABLE library_content ADD COLUMN reuse_mode TEXT;
