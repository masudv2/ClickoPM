ALTER TABLE project ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX project_archived_idx ON project(workspace_id) WHERE archived_at IS NULL;
