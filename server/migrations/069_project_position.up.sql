ALTER TABLE project ADD COLUMN position DOUBLE PRECISION NOT NULL DEFAULT 0;
-- Seed positions from creation order so existing projects keep a stable order.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at) AS rn
  FROM project
)
UPDATE project SET position = ranked.rn FROM ranked WHERE project.id = ranked.id;
CREATE INDEX project_position_idx ON project(workspace_id, position);
