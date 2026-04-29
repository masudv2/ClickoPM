-- name: ListProjects :many
SELECT * FROM project
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('team_id')::uuid IS NULL OR team_id = sqlc.narg('team_id'))
ORDER BY created_at DESC;

-- name: GetProject :one
SELECT * FROM project
WHERE id = $1;

-- name: GetProjectInWorkspace :one
SELECT * FROM project
WHERE id = $1 AND workspace_id = $2;

-- name: CreateProject :one
INSERT INTO project (
    workspace_id, title, description, icon, status,
    lead_type, lead_id, priority, team_id, start_date, target_date
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
) RETURNING *;

-- name: UpdateProject :one
UPDATE project SET
    title = COALESCE(sqlc.narg('title'), title),
    description = sqlc.narg('description'),
    icon = sqlc.narg('icon'),
    status = COALESCE(sqlc.narg('status'), status),
    priority = COALESCE(sqlc.narg('priority'), priority),
    lead_type = sqlc.narg('lead_type'),
    lead_id = sqlc.narg('lead_id'),
    start_date = sqlc.narg('start_date'),
    target_date = sqlc.narg('target_date'),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteProject :exec
DELETE FROM project WHERE id = $1;

-- name: CountIssuesByProject :one
SELECT count(*) FROM issue
WHERE project_id = $1;

-- name: ListProjectsForRoadmap :many
SELECT p.*,
       COALESCE(s.total_count, 0)::bigint AS total_count,
       COALESCE(s.done_count, 0)::bigint AS done_count
FROM project p
LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS total_count,
           count(*) FILTER (WHERE i.status IN ('done', 'cancelled'))::bigint AS done_count
    FROM issue i WHERE i.project_id = p.id
) s ON true
WHERE p.workspace_id = $1
  AND p.status NOT IN ('completed', 'cancelled')
  AND (sqlc.narg('team_id')::uuid IS NULL OR p.team_id = sqlc.narg('team_id'))
ORDER BY p.team_id, p.start_date NULLS LAST, p.created_at;

-- name: GetProjectIssueStats :many
SELECT project_id,
       count(*)::bigint AS total_count,
       count(*) FILTER (WHERE status IN ('done', 'cancelled'))::bigint AS done_count
FROM issue
WHERE project_id = ANY(sqlc.arg('project_ids')::uuid[])
GROUP BY project_id;
