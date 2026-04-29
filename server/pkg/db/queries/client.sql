-- name: ListClients :many
SELECT c.*, u.name AS user_name, u.email AS user_email,
       s.name AS sla_policy_name
FROM client c
JOIN "user" u ON u.id = c.user_id
LEFT JOIN sla_policy s ON s.id = c.sla_policy_id
WHERE c.workspace_id = $1
ORDER BY u.name ASC;

-- name: GetClient :one
SELECT c.*, u.name AS user_name, u.email AS user_email,
       s.name AS sla_policy_name
FROM client c
JOIN "user" u ON u.id = c.user_id
LEFT JOIN sla_policy s ON s.id = c.sla_policy_id
WHERE c.id = $1;

-- name: GetClientByUserAndWorkspace :one
SELECT c.*, u.name AS user_name, u.email AS user_email,
       s.name AS sla_policy_name
FROM client c
JOIN "user" u ON u.id = c.user_id
LEFT JOIN sla_policy s ON s.id = c.sla_policy_id
WHERE c.user_id = $1 AND c.workspace_id = $2;

-- name: CreateClient :one
INSERT INTO client (workspace_id, user_id, sla_policy_id, company_name)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateClient :one
UPDATE client SET
    sla_policy_id = sqlc.narg('sla_policy_id'),
    company_name = sqlc.narg('company_name'),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteClient :exec
DELETE FROM client WHERE id = $1;

-- name: ListClientProjects :many
SELECT p.* FROM project p
JOIN client_project cp ON cp.project_id = p.id
WHERE cp.client_id = $1
ORDER BY p.title ASC;

-- name: AddClientProject :exec
INSERT INTO client_project (client_id, project_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveClientProject :exec
DELETE FROM client_project
WHERE client_id = $1 AND project_id = $2;

-- name: ListClientProjectIDs :many
SELECT project_id FROM client_project
WHERE client_id = $1;

-- name: IncrementWorkspaceTicketCounter :one
UPDATE workspace SET ticket_counter = ticket_counter + 1
WHERE id = $1
RETURNING ticket_counter;
