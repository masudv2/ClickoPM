-- Cycles: time-boxed work periods per team

CREATE TABLE cycle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'active', 'cooldown', 'completed')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    cooldown_ends_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    scope_history JSONB NOT NULL DEFAULT '[]',
    completed_scope_history JSONB NOT NULL DEFAULT '[]',
    started_scope_history JSONB NOT NULL DEFAULT '[]',
    position REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_cycle_team_number ON cycle(team_id, number);
CREATE INDEX idx_cycle_team_status ON cycle(team_id, status);
CREATE INDEX idx_cycle_workspace ON cycle(workspace_id);

-- Add cycle_id and estimate to issue
ALTER TABLE issue ADD COLUMN cycle_id UUID REFERENCES cycle(id) ON DELETE SET NULL;
ALTER TABLE issue ADD COLUMN estimate INTEGER;

CREATE INDEX idx_issue_cycle ON issue(cycle_id);
CREATE INDEX idx_issue_team_cycle ON issue(team_id, cycle_id);
