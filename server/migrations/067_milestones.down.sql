DROP INDEX IF EXISTS issue_milestone_idx;
ALTER TABLE issue DROP COLUMN IF EXISTS milestone_id;
DROP INDEX IF EXISTS milestone_project_idx;
DROP TABLE IF EXISTS milestone;
