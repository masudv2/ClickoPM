-- Drop old label tables from 001_init (never wired up)
DROP TABLE IF EXISTS issue_to_label CASCADE;
DROP TABLE IF EXISTS issue_label CASCADE;

-- Workspace-level labels
CREATE TABLE label (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'gray'
        CHECK (color IN ('red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'gray')),
    position REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_label_workspace_name ON label(workspace_id, lower(name));
CREATE INDEX idx_label_workspace ON label(workspace_id);

-- Many-to-many: issues <-> labels
CREATE TABLE issue_label (
    issue_id UUID NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

CREATE INDEX idx_issue_label_label ON issue_label(label_id);
