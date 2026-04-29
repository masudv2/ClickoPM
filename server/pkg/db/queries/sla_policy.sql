-- name: ListSLAPolicies :many
SELECT * FROM sla_policy
WHERE workspace_id = $1
ORDER BY name ASC;

-- name: GetSLAPolicy :one
SELECT * FROM sla_policy
WHERE id = $1;

-- name: CreateSLAPolicy :one
INSERT INTO sla_policy (
    workspace_id, name,
    critical_first_response, critical_update_interval, critical_resolution,
    high_first_response, high_update_interval, high_resolution,
    normal_first_response, normal_update_interval, normal_resolution,
    low_first_response, low_update_interval, low_resolution,
    support_hours
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
) RETURNING *;

-- name: UpdateSLAPolicy :one
UPDATE sla_policy SET
    name = COALESCE(sqlc.narg('name'), name),
    critical_first_response = sqlc.narg('critical_first_response'),
    critical_update_interval = sqlc.narg('critical_update_interval'),
    critical_resolution = sqlc.narg('critical_resolution'),
    high_first_response = sqlc.narg('high_first_response'),
    high_update_interval = sqlc.narg('high_update_interval'),
    high_resolution = sqlc.narg('high_resolution'),
    normal_first_response = sqlc.narg('normal_first_response'),
    normal_update_interval = sqlc.narg('normal_update_interval'),
    normal_resolution = sqlc.narg('normal_resolution'),
    low_first_response = sqlc.narg('low_first_response'),
    low_update_interval = sqlc.narg('low_update_interval'),
    low_resolution = sqlc.narg('low_resolution'),
    support_hours = COALESCE(sqlc.narg('support_hours'), support_hours),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteSLAPolicy :exec
DELETE FROM sla_policy WHERE id = $1;
