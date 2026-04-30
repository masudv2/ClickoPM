-- name: ListMilestonesByProject :many
-- Returns milestones with computed total/done issue counts.
SELECT
    m.id, m.project_id, m.name, m.description,
    m.start_date, m.target_date, m.position,
    m.created_at, m.updated_at,
    COALESCE(COUNT(i.id), 0)::bigint AS total_count,
    COALESCE(COUNT(i.id) FILTER (WHERE i.status IN ('done', 'cancelled')), 0)::bigint AS done_count,
    COALESCE(COUNT(i.id) FILTER (WHERE i.status NOT IN ('backlog', 'done', 'cancelled')), 0)::bigint AS started_count
FROM milestone m
LEFT JOIN issue i ON i.milestone_id = m.id
WHERE m.project_id = $1
GROUP BY m.id
ORDER BY m.position ASC, m.target_date ASC NULLS LAST;

-- name: GetMilestoneInProject :one
SELECT * FROM milestone WHERE id = $1 AND project_id = $2;

-- name: GetMilestone :one
SELECT * FROM milestone WHERE id = $1;

-- name: CreateMilestone :one
INSERT INTO milestone (project_id, name, description, start_date, target_date, position)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateMilestone :one
UPDATE milestone SET
    name        = COALESCE(sqlc.narg('name'), name),
    description = sqlc.narg('description'),
    start_date  = sqlc.narg('start_date'),
    target_date = sqlc.narg('target_date'),
    position    = COALESCE(sqlc.narg('position'), position),
    updated_at  = now()
WHERE id = $1
RETURNING *;

-- name: DeleteMilestone :exec
DELETE FROM milestone WHERE id = $1;

-- name: ReorderMilestones :exec
UPDATE milestone
SET position = data.position, updated_at = now()
FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::float8[]) AS position) AS data
WHERE milestone.id = data.id;

-- name: ListMilestoneSummariesByIDs :many
-- Minimal projection for enriching issues with their milestone name (chip).
SELECT id, project_id, name FROM milestone
WHERE id = ANY($1::uuid[]);

-- name: GetProjectFromMilestone :one
SELECT project_id FROM milestone WHERE id = $1;
