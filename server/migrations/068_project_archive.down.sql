DROP INDEX IF EXISTS project_archived_idx;
ALTER TABLE project DROP COLUMN IF EXISTS archived_at;
