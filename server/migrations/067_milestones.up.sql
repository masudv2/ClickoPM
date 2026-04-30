CREATE TABLE milestone (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    start_date  DATE,
    target_date DATE,
    position    DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX milestone_project_idx ON milestone(project_id, position);

ALTER TABLE issue ADD COLUMN milestone_id UUID REFERENCES milestone(id) ON DELETE SET NULL;
CREATE INDEX issue_milestone_idx ON issue(milestone_id) WHERE milestone_id IS NOT NULL;
