-- Teams: primary organizational unit within a workspace

CREATE TABLE team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    identifier TEXT NOT NULL,
    icon TEXT,
    color TEXT NOT NULL DEFAULT 'blue'
        CHECK (color IN ('red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'gray')),
    timezone TEXT NOT NULL DEFAULT 'UTC',
    settings JSONB NOT NULL DEFAULT '{}',
    issue_counter INTEGER NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_team_workspace_identifier ON team(workspace_id, lower(identifier));
CREATE UNIQUE INDEX idx_team_workspace_name ON team(workspace_id, lower(name));
CREATE INDEX idx_team_workspace ON team(workspace_id);

CREATE TABLE team_member (
    team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, member_id)
);

CREATE INDEX idx_team_member_member ON team_member(member_id);

-- Add team_id to issue (nullable initially for backfill)
ALTER TABLE issue ADD COLUMN team_id UUID REFERENCES team(id) ON DELETE CASCADE;

-- Add team_id to project (nullable initially for backfill)
ALTER TABLE project ADD COLUMN team_id UUID REFERENCES team(id) ON DELETE CASCADE;

-- For each workspace, create a default team and backfill
DO $$
DECLARE
    ws RECORD;
    new_team_id UUID;
    prefix TEXT;
BEGIN
    FOR ws IN SELECT id, name, issue_prefix, issue_counter FROM workspace LOOP
        -- Generate identifier from existing issue_prefix or workspace name
        prefix := ws.issue_prefix;
        IF prefix = '' OR prefix IS NULL THEN
            prefix := UPPER(LEFT(REGEXP_REPLACE(ws.name, '[^a-zA-Z]', '', 'g'), 3));
            IF prefix = '' THEN prefix := 'DEF'; END IF;
        END IF;

        INSERT INTO team (workspace_id, name, identifier, color, issue_counter, position)
        VALUES (ws.id, 'Default', prefix, 'blue', ws.issue_counter, 0)
        RETURNING id INTO new_team_id;

        -- Backfill all issues in this workspace
        UPDATE issue SET team_id = new_team_id WHERE workspace_id = ws.id;

        -- Backfill all projects in this workspace
        UPDATE project SET team_id = new_team_id WHERE workspace_id = ws.id;

        -- Add all workspace members to the default team
        INSERT INTO team_member (team_id, member_id)
        SELECT new_team_id, m.id FROM member m WHERE m.workspace_id = ws.id;
    END LOOP;
END $$;

-- Now set NOT NULL
ALTER TABLE issue ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE project ALTER COLUMN team_id SET NOT NULL;

CREATE INDEX idx_issue_team ON issue(team_id);
CREATE INDEX idx_project_team ON project(team_id);
