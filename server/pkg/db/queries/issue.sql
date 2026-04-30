-- name: ListIssues :many
SELECT id, workspace_id, title, description, status, priority,
       assignee_type, assignee_id, creator_type, creator_id,
       parent_issue_id, position, due_date, created_at, updated_at, number, project_id, team_id,
       cycle_id, estimate, start_date
FROM issue
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND (sqlc.narg('assignee_ids')::uuid[] IS NULL OR assignee_id = ANY(sqlc.narg('assignee_ids')::uuid[]))
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('team_id')::uuid IS NULL OR team_id = sqlc.narg('team_id'))
ORDER BY position ASC, created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetIssue :one
SELECT * FROM issue
WHERE id = $1;

-- name: GetIssueInWorkspace :one
SELECT * FROM issue
WHERE id = $1 AND workspace_id = $2;

-- name: CreateIssue :one
INSERT INTO issue (
    workspace_id, title, description, status, priority,
    assignee_type, assignee_id, creator_type, creator_id,
    parent_issue_id, position, due_date, number, project_id, team_id,
    cycle_id, estimate, start_date
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
    $16, $17, $18
) RETURNING *;

-- name: GetIssueByNumber :one
SELECT * FROM issue
WHERE workspace_id = $1 AND number = $2;

-- name: UpdateIssue :one
UPDATE issue SET
    title = COALESCE(sqlc.narg('title'), title),
    description = COALESCE(sqlc.narg('description'), description),
    status = COALESCE(sqlc.narg('status'), status),
    priority = COALESCE(sqlc.narg('priority'), priority),
    assignee_type = sqlc.narg('assignee_type'),
    assignee_id = sqlc.narg('assignee_id'),
    position = COALESCE(sqlc.narg('position'), position),
    due_date = sqlc.narg('due_date'),
    start_date = sqlc.narg('start_date'),
    parent_issue_id = sqlc.narg('parent_issue_id'),
    project_id = sqlc.narg('project_id'),
    cycle_id = sqlc.narg('cycle_id'),
    estimate = sqlc.narg('estimate'),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateIssueStatus :one
UPDATE issue SET
    status = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateIssueWithOrigin :one
INSERT INTO issue (
    workspace_id, title, description, status, priority,
    assignee_type, assignee_id, creator_type, creator_id,
    parent_issue_id, position, due_date, number, project_id, team_id,
    origin_type, origin_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
    sqlc.narg('origin_type'), sqlc.narg('origin_id')
) RETURNING *;

-- name: DeleteIssue :exec
DELETE FROM issue WHERE id = $1;

-- name: ListOpenIssues :many
SELECT id, workspace_id, title, description, status, priority,
       assignee_type, assignee_id, creator_type, creator_id,
       parent_issue_id, position, due_date, created_at, updated_at, number, project_id, team_id,
       cycle_id, estimate, start_date
FROM issue
WHERE workspace_id = $1
  AND status NOT IN ('done', 'cancelled')
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND (sqlc.narg('assignee_ids')::uuid[] IS NULL OR assignee_id = ANY(sqlc.narg('assignee_ids')::uuid[]))
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('team_id')::uuid IS NULL OR team_id = sqlc.narg('team_id'))
ORDER BY position ASC, created_at DESC;

-- name: CountIssues :one
SELECT count(*) FROM issue
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND (sqlc.narg('assignee_ids')::uuid[] IS NULL OR assignee_id = ANY(sqlc.narg('assignee_ids')::uuid[]))
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('team_id')::uuid IS NULL OR team_id = sqlc.narg('team_id'));

-- name: ListChildIssues :many
SELECT * FROM issue
WHERE parent_issue_id = $1
ORDER BY position ASC, created_at DESC;

-- name: GetIssueParentSummaries :many
-- Minimal projection for enriching child issues with their parent's
-- identifier and title (used by the list/board parent chip).
SELECT id, team_id, number, title FROM issue
WHERE id = ANY($1::uuid[]);

-- name: CountCreatedIssueAssignees :many
-- Count assignees on issues created by a specific user.
SELECT
  assignee_type,
  assignee_id,
  COUNT(*)::bigint as frequency
FROM issue
WHERE workspace_id = $1
  AND creator_id = $2
  AND creator_type = 'member'
  AND assignee_type IS NOT NULL
  AND assignee_id IS NOT NULL
GROUP BY assignee_type, assignee_id;

-- name: ChildIssueProgress :many
SELECT parent_issue_id,
       COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE status IN ('done', 'cancelled'))::bigint AS done
FROM issue
WHERE workspace_id = $1
  AND parent_issue_id IS NOT NULL
GROUP BY parent_issue_id;

-- name: GetDashboardStats :one
SELECT
  COUNT(*) FILTER (WHERE status NOT IN ('done', 'cancelled'))::int as open_count,
  COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < NOW() AND status NOT IN ('done', 'cancelled'))::int as overdue_count
FROM issue
WHERE workspace_id = $1;

-- name: GetDashboardBlockers :many
SELECT
  i.id, i.workspace_id, i.team_id, i.number, i.title, i.status, i.priority,
  i.assignee_type, i.assignee_id, i.due_date,
  t.identifier as team_identifier, t.name as team_name, t.color as team_color
FROM issue i
JOIN team t ON t.id = i.team_id
WHERE i.workspace_id = $1
  AND i.status NOT IN ('done', 'cancelled')
  AND (
    (i.priority = 'urgent' AND i.assignee_id IS NULL)
    OR i.status = 'blocked'
    OR (i.due_date IS NOT NULL AND i.due_date < NOW())
  )
ORDER BY
  CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
  i.due_date ASC NULLS LAST;

-- name: GetWorkloadByTeam :many
-- Returns per-assignee workload stats for all active cycles in a workspace.
SELECT
  t.id AS team_id,
  t.name AS team_name,
  t.color AS team_color,
  t.identifier AS team_identifier,
  c.id AS cycle_id,
  c.name AS cycle_name,
  c.number AS cycle_number,
  c.starts_at AS cycle_starts_at,
  c.ends_at AS cycle_ends_at,
  i.assignee_type,
  i.assignee_id,
  COUNT(*) AS issue_count,
  COALESCE(SUM(i.estimate), 0)::integer AS assigned_points,
  COUNT(*) FILTER (WHERE i.status IN ('done', 'cancelled')) AS completed_issue_count,
  COALESCE(SUM(i.estimate) FILTER (WHERE i.status IN ('done', 'cancelled')), 0)::integer AS completed_points
FROM issue i
JOIN team t ON t.id = i.team_id
JOIN cycle c ON c.id = i.cycle_id AND c.status = 'active'
WHERE i.workspace_id = $1
  AND i.assignee_id IS NOT NULL
GROUP BY t.id, t.name, t.color, t.identifier, c.id, c.name, c.number, c.starts_at, c.ends_at, i.assignee_type, i.assignee_id
ORDER BY t.name, i.assignee_type, i.assignee_id;

-- name: GetWorkloadIssues :many
-- Returns issues for a specific assignee in an active cycle.
SELECT i.id, i.workspace_id, i.title, i.status, i.priority, i.estimate,
       i.assignee_type, i.assignee_id, i.team_id, i.cycle_id, i.number,
       t.identifier AS team_identifier
FROM issue i
JOIN team t ON t.id = i.team_id
JOIN cycle c ON c.id = i.cycle_id AND c.status = 'active'
WHERE i.workspace_id = $1
  AND i.assignee_type = $2
  AND i.assignee_id = $3
ORDER BY
  CASE i.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'in_review' THEN 2 WHEN 'todo' THEN 3 WHEN 'backlog' THEN 4 WHEN 'done' THEN 5 WHEN 'cancelled' THEN 6 END,
  CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END;

-- SearchIssues: moved to handler (dynamic SQL for multi-word search support).

-- name: MarkIssueFirstExecuted :one
-- Flips first_executed_at from NULL to now() atomically. Returns the row if
-- this was the first time the issue was executed; no rows otherwise. The
-- analytics issue_executed event fires exactly when this returns a row —
-- retries and re-assignments hit the WHERE clause and no-op.
UPDATE issue
SET first_executed_at = now()
WHERE id = $1 AND first_executed_at IS NULL
RETURNING id, workspace_id, creator_type, creator_id, first_executed_at;
