-- name: ListTickets :many
SELECT t.*,
       cl.company_name AS client_company,
       u.name AS client_name,
       p.title AS project_title
FROM ticket t
JOIN client cl ON cl.id = t.client_id
JOIN "user" u ON u.id = cl.user_id
LEFT JOIN project p ON p.id = t.project_id
WHERE t.workspace_id = $1
  AND (sqlc.narg('internal_status')::text IS NULL OR t.internal_status = sqlc.narg('internal_status'))
  AND (sqlc.narg('priority')::text IS NULL OR t.priority = sqlc.narg('priority'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR t.project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR t.assignee_id = sqlc.narg('assignee_id'))
  AND (sqlc.narg('client_id')::uuid IS NULL OR t.client_id = sqlc.narg('client_id'))
ORDER BY
  CASE t.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  t.created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountTickets :one
SELECT COUNT(*) FROM ticket
WHERE workspace_id = $1
  AND (sqlc.narg('internal_status')::text IS NULL OR internal_status = sqlc.narg('internal_status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND (sqlc.narg('client_id')::uuid IS NULL OR client_id = sqlc.narg('client_id'));

-- name: GetTicket :one
SELECT t.*,
       cl.company_name AS client_company,
       u.name AS client_name,
       p.title AS project_title
FROM ticket t
JOIN client cl ON cl.id = t.client_id
JOIN "user" u ON u.id = cl.user_id
LEFT JOIN project p ON p.id = t.project_id
WHERE t.id = $1;

-- name: CreateTicket :one
INSERT INTO ticket (
    workspace_id, project_id, client_id, number,
    subject, description, type, priority,
    client_status, internal_status, source,
    first_response_due, next_update_due, resolution_due
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
) RETURNING *;

-- name: UpdateTicket :one
UPDATE ticket SET
    subject = COALESCE(sqlc.narg('subject'), subject),
    description = COALESCE(sqlc.narg('description'), description),
    type = COALESCE(sqlc.narg('type'), type),
    priority = COALESCE(sqlc.narg('priority'), priority),
    client_status = COALESCE(sqlc.narg('client_status'), client_status),
    internal_status = COALESCE(sqlc.narg('internal_status'), internal_status),
    assignee_type = sqlc.narg('assignee_type'),
    assignee_id = sqlc.narg('assignee_id'),
    linked_issue_id = sqlc.narg('linked_issue_id'),
    pending_reply = COALESCE(sqlc.narg('pending_reply'), pending_reply),
    first_response_at = sqlc.narg('first_response_at'),
    resolved_at = sqlc.narg('resolved_at'),
    closed_at = sqlc.narg('closed_at'),
    next_update_due = sqlc.narg('next_update_due'),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteTicket :exec
DELETE FROM ticket WHERE id = $1;

-- name: ListTicketsForClient :many
SELECT t.*, p.title AS project_title
FROM ticket t
LEFT JOIN project p ON p.id = t.project_id
WHERE t.client_id = $1
ORDER BY t.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetTicketForClient :one
SELECT t.*, p.title AS project_title
FROM ticket t
LEFT JOIN project p ON p.id = t.project_id
WHERE t.id = $1 AND t.client_id = $2;

-- name: ListSLABreachedTickets :many
SELECT t.*, u.name AS client_name, p.title AS project_title
FROM ticket t
JOIN client cl ON cl.id = t.client_id
JOIN "user" u ON u.id = cl.user_id
LEFT JOIN project p ON p.id = t.project_id
WHERE t.workspace_id = $1
  AND t.internal_status NOT IN ('resolved', 'closed')
  AND (
    (t.first_response_due IS NOT NULL AND t.first_response_at IS NULL AND t.first_response_due < now())
    OR (t.resolution_due IS NOT NULL AND t.resolution_due < now())
    OR (t.next_update_due IS NOT NULL AND t.next_update_due < now())
  )
ORDER BY
  CASE t.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  t.created_at ASC;

-- name: ListSLAAtRiskTickets :many
SELECT t.*, u.name AS client_name, p.title AS project_title
FROM ticket t
JOIN client cl ON cl.id = t.client_id
JOIN "user" u ON u.id = cl.user_id
LEFT JOIN project p ON p.id = t.project_id
WHERE t.workspace_id = $1
  AND t.internal_status NOT IN ('resolved', 'closed')
  AND (
    (t.first_response_due IS NOT NULL AND t.first_response_at IS NULL
     AND t.first_response_due > now()
     AND t.first_response_due < now() + interval '30 minutes')
    OR (t.resolution_due IS NOT NULL
     AND t.resolution_due > now()
     AND t.resolution_due < now() + interval '1 hour')
  )
ORDER BY
  CASE t.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  t.created_at ASC;
