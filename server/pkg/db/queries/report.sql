-- name: GetTeamDailySummary :many
-- Returns issues that had status changes in a time range for a given team.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.status AS current_status,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name,
    a.action,
    a.details,
    a.created_at
FROM activity_log a
JOIN issue i ON i.id = a.issue_id
WHERE a.workspace_id = $1
  AND i.team_id = $2
  AND a.action IN ('status_changed', 'created')
  AND a.created_at >= $3
  AND a.created_at < $4
ORDER BY a.created_at DESC;

-- name: GetTeamBlockers :many
-- Returns blocked issues for a team with days-blocked calculation.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name,
    EXTRACT(DAY FROM now() - COALESCE(
        (SELECT al.created_at FROM activity_log al WHERE al.issue_id = i.id AND al.action = 'status_changed' ORDER BY al.created_at DESC LIMIT 1),
        i.created_at
    ))::integer AS days_blocked
FROM issue i
WHERE i.team_id = $1
  AND i.status = 'blocked'
ORDER BY days_blocked DESC;

-- name: GetTeamInProgressIssues :many
-- Returns in-progress issues for a team ordered by assignee.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
WHERE i.team_id = $1
  AND i.status = 'in_progress'
ORDER BY assignee_name, i.created_at;

-- name: GetTeamTodoCount :one
-- Returns count of todo issues for a team.
SELECT COUNT(*) AS count
FROM issue
WHERE team_id = $1
  AND status = 'todo';

-- name: GetTeamTodoIssues :many
-- Returns todo issues for a team with assignee names.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
WHERE i.team_id = $1
  AND i.status = 'todo'
ORDER BY i.created_at;

-- name: GetTeamCompletedToday :many
-- Returns issues completed in a time range for a team.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
JOIN activity_log a ON a.issue_id = i.id
WHERE a.workspace_id = $1
  AND i.team_id = $2
  AND a.action = 'status_changed'
  AND a.created_at >= $3
  AND a.created_at < $4
  AND (a.details->>'to') IN ('done', 'cancelled')
ORDER BY a.created_at DESC;

-- name: GetTeamWeeklyCompletedByAssignee :many
-- Returns completed issue counts by assignee for a time range.
SELECT
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name,
    COUNT(*) AS completed_count
FROM issue i
JOIN activity_log a ON a.issue_id = i.id
WHERE a.workspace_id = $1
  AND i.team_id = $2
  AND a.action = 'status_changed'
  AND a.created_at >= $3
  AND a.created_at < $4
  AND (a.details->>'to') IN ('done', 'cancelled')
GROUP BY assignee_name
ORDER BY completed_count DESC;

-- name: GetTeamWeeklyCompletedWithTitles :many
-- Returns completed issues with titles and points for a time range, grouped by assignee.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    COALESCE(i.estimate, 0)::integer AS points,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
JOIN activity_log a ON a.issue_id = i.id
WHERE a.workspace_id = $1
  AND i.team_id = $2
  AND a.action = 'status_changed'
  AND a.created_at >= $3
  AND a.created_at < $4
  AND (a.details->>'to') IN ('done', 'cancelled')
ORDER BY assignee_name, a.created_at DESC;

-- name: GetTeamBacklogIssues :many
-- Returns backlog issues for a team with assignee names.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    COALESCE(i.estimate, 0)::integer AS points,
    i.priority,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
WHERE i.team_id = $1
  AND i.status = 'backlog'
ORDER BY i.priority ASC, i.created_at;

-- name: GetTeamNewIssuesCreatedToday :many
-- Returns issues created in a time range for a team.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
WHERE i.workspace_id = $1
  AND i.team_id = $2
  AND i.created_at >= $3
  AND i.created_at < $4
ORDER BY i.created_at DESC;
