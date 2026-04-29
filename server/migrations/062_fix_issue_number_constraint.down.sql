ALTER TABLE issue DROP CONSTRAINT IF EXISTS uq_issue_team_number;
DROP INDEX IF EXISTS idx_issue_team_number;

ALTER TABLE issue ADD CONSTRAINT uq_issue_workspace_number UNIQUE (workspace_id, number);
CREATE INDEX idx_issue_workspace_number ON issue (workspace_id, number);
