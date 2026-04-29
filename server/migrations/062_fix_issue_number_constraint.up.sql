-- Change issue number uniqueness from workspace-scoped to team-scoped.
-- Each team has its own issue_counter, so numbers are unique per team, not workspace.
ALTER TABLE issue DROP CONSTRAINT IF EXISTS uq_issue_workspace_number;
DROP INDEX IF EXISTS idx_issue_workspace_number;

ALTER TABLE issue ADD CONSTRAINT uq_issue_team_number UNIQUE (team_id, number);
CREATE INDEX idx_issue_team_number ON issue (team_id, number);
