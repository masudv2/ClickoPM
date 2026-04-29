-- name: ListCycles :many
SELECT * FROM cycle
WHERE team_id = $1
ORDER BY starts_at DESC, number DESC;

-- name: ListCyclesByStatus :many
SELECT * FROM cycle
WHERE team_id = $1 AND status = $2
ORDER BY starts_at ASC, number ASC;

-- name: GetCycle :one
SELECT * FROM cycle WHERE id = $1;

-- name: GetCycleInWorkspace :one
SELECT * FROM cycle WHERE id = $1 AND workspace_id = $2;

-- name: GetActiveCycleForTeam :one
SELECT * FROM cycle WHERE team_id = $1 AND status = 'active' LIMIT 1;

-- name: CreateCycle :one
INSERT INTO cycle (
    workspace_id, team_id, name, description, number, status,
    starts_at, ends_at, cooldown_ends_at, position
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
) RETURNING *;

-- name: UpdateCycle :one
UPDATE cycle SET
    name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    status = COALESCE(sqlc.narg('status'), status),
    starts_at = COALESCE(sqlc.narg('starts_at'), starts_at),
    ends_at = COALESCE(sqlc.narg('ends_at'), ends_at),
    cooldown_ends_at = COALESCE(sqlc.narg('cooldown_ends_at'), cooldown_ends_at),
    completed_at = COALESCE(sqlc.narg('completed_at'), completed_at),
    scope_history = COALESCE(sqlc.narg('scope_history'), scope_history),
    completed_scope_history = COALESCE(sqlc.narg('completed_scope_history'), completed_scope_history),
    started_scope_history = COALESCE(sqlc.narg('started_scope_history'), started_scope_history),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteCycle :exec
DELETE FROM cycle WHERE id = $1;

-- name: CountCycleIssues :one
SELECT COUNT(*) FROM issue WHERE cycle_id = $1;

-- name: GetMaxCycleNumber :one
SELECT COALESCE(MAX(number), 0)::integer AS max_number FROM cycle WHERE team_id = $1;

-- name: GetMaxCyclePosition :one
SELECT COALESCE(MAX(position), 0)::real AS max_position FROM cycle WHERE team_id = $1;

-- name: CountPlannedCycles :one
SELECT COUNT(*) FROM cycle WHERE team_id = $1 AND status = 'planned';

-- name: GetLastCycleEndDate :one
SELECT COALESCE(MAX(COALESCE(cooldown_ends_at, ends_at)), now()) AS last_end
FROM cycle WHERE team_id = $1;

-- name: ListTeamsWithCyclesEnabled :many
SELECT * FROM team WHERE settings->'cycles'->>'enabled' = 'true';

-- name: MoveUnfinishedIssuesToCycle :exec
UPDATE issue SET cycle_id = $2
WHERE cycle_id = $1 AND status NOT IN ('done', 'cancelled');

-- name: AutoAssignIssuesToCycle :exec
UPDATE issue SET cycle_id = $2
WHERE team_id = $1 AND cycle_id IS NULL AND status = ANY($3::text[]);

-- name: GetCycleScopeSnapshot :one
SELECT
    COUNT(*) AS total_count,
    COALESCE(SUM(estimate), 0)::integer AS total_points,
    COUNT(*) FILTER (WHERE status IN ('in_progress')) AS started_count,
    COALESCE(SUM(estimate) FILTER (WHERE status IN ('in_progress')), 0)::integer AS started_points,
    COUNT(*) FILTER (WHERE status IN ('done', 'cancelled')) AS completed_count,
    COALESCE(SUM(estimate) FILTER (WHERE status IN ('done', 'cancelled')), 0)::integer AS completed_points
FROM issue WHERE cycle_id = $1;

-- name: GetCycleAssigneeBreakdown :many
SELECT
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unknown'
    ) AS assignee_name,
    COUNT(*) AS total_count,
    COALESCE(SUM(i.estimate), 0)::integer AS total_points,
    COUNT(*) FILTER (WHERE i.status IN ('done', 'cancelled')) AS completed_count,
    COALESCE(SUM(i.estimate) FILTER (WHERE i.status IN ('done', 'cancelled')), 0)::integer AS completed_points
FROM issue i
WHERE i.cycle_id = $1 AND i.assignee_id IS NOT NULL
GROUP BY i.assignee_type, i.assignee_id, assignee_name;

-- name: GetCycleLabelBreakdown :many
SELECT
    l.id AS label_id,
    l.name AS label_name,
    l.color AS label_color,
    COUNT(*) AS total_count,
    COALESCE(SUM(i.estimate), 0)::integer AS total_points,
    COUNT(*) FILTER (WHERE i.status IN ('done', 'cancelled')) AS completed_count,
    COALESCE(SUM(i.estimate) FILTER (WHERE i.status IN ('done', 'cancelled')), 0)::integer AS completed_points
FROM issue i
JOIN issue_label il ON il.issue_id = i.id
JOIN label l ON l.id = il.label_id
WHERE i.cycle_id = $1
GROUP BY l.id, l.name, l.color;

-- name: GetCyclePriorityBreakdown :many
SELECT
    priority,
    COUNT(*) AS total_count,
    COALESCE(SUM(estimate), 0)::integer AS total_points,
    COUNT(*) FILTER (WHERE status IN ('done', 'cancelled')) AS completed_count,
    COALESCE(SUM(estimate) FILTER (WHERE status IN ('done', 'cancelled')), 0)::integer AS completed_points
FROM issue
WHERE cycle_id = $1
GROUP BY priority;

-- name: GetCycleProjectBreakdown :many
SELECT
    p.id AS project_id,
    p.title AS project_title,
    p.icon AS project_icon,
    COUNT(*) AS total_count,
    COALESCE(SUM(i.estimate), 0)::integer AS total_points,
    COUNT(*) FILTER (WHERE i.status IN ('done', 'cancelled')) AS completed_count,
    COALESCE(SUM(i.estimate) FILTER (WHERE i.status IN ('done', 'cancelled')), 0)::integer AS completed_points
FROM issue i
JOIN project p ON p.id = i.project_id
WHERE i.cycle_id = $1
GROUP BY p.id, p.title, p.icon;

-- name: ListCompletedCyclesForDashboard :many
SELECT c.*, t.name as team_name, t.color as team_color, t.identifier as team_identifier
FROM cycle c
JOIN team t ON t.id = c.team_id
WHERE c.workspace_id = $1
  AND c.status IN ('completed', 'active')
ORDER BY c.ends_at DESC
LIMIT $2;

-- name: GetLastCompletedCyclesForTeam :many
SELECT * FROM cycle
WHERE team_id = $1 AND status = 'completed'
ORDER BY completed_at DESC
LIMIT 3;

-- name: GetAssigneePointsForCompletedCycles :many
-- Returns total completed points per assignee across the last N completed cycles for a team.
SELECT
    i.assignee_type,
    i.assignee_id,
    COALESCE(SUM(i.estimate) FILTER (WHERE i.status IN ('done', 'cancelled')), 0)::integer AS completed_points
FROM issue i
JOIN cycle c ON c.id = i.cycle_id
WHERE c.team_id = $1
  AND c.status = 'completed'
  AND c.completed_at IS NOT NULL
  AND c.completed_at >= (
      SELECT COALESCE(MIN(sub.completed_at), '1970-01-01'::timestamptz)
      FROM (
          SELECT completed_at FROM cycle
          WHERE team_id = $1 AND status = 'completed'
          ORDER BY completed_at DESC
          LIMIT 3
      ) sub
  )
  AND i.assignee_id IS NOT NULL
GROUP BY i.assignee_type, i.assignee_id;

-- name: ListIssuesByCycle :many
SELECT i.* FROM issue i
WHERE i.cycle_id = $1
ORDER BY i.status ASC, i.position ASC;
