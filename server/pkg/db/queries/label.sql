-- name: ListLabels :many
SELECT * FROM label
WHERE workspace_id = $1
ORDER BY position ASC, created_at ASC;

-- name: GetLabel :one
SELECT * FROM label
WHERE id = $1;

-- name: GetLabelInWorkspace :one
SELECT * FROM label
WHERE id = $1 AND workspace_id = $2;

-- name: CreateLabel :one
INSERT INTO label (workspace_id, name, color, position)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateLabel :one
UPDATE label SET
    name = COALESCE(sqlc.narg('name'), name),
    color = COALESCE(sqlc.narg('color'), color),
    position = COALESCE(sqlc.narg('position'), position),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteLabel :exec
DELETE FROM label WHERE id = $1;

-- name: GetMaxLabelPosition :one
SELECT COALESCE(MAX(position), 0)::real AS max_position
FROM label
WHERE workspace_id = $1;

-- Issue-label association
-- name: SetIssueLabels :exec
DELETE FROM issue_label WHERE issue_id = $1;

-- name: AddIssueLabel :exec
INSERT INTO issue_label (issue_id, label_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ListIssueLabels :many
SELECT l.* FROM label l
JOIN issue_label il ON il.label_id = l.id
WHERE il.issue_id = $1
ORDER BY l.position ASC;

-- name: ListIssueLabelsForIssues :many
SELECT il.issue_id, l.id, l.workspace_id, l.name, l.color, l.position, l.created_at, l.updated_at
FROM label l
JOIN issue_label il ON il.label_id = l.id
WHERE il.issue_id = ANY(sqlc.arg('issue_ids')::uuid[])
ORDER BY l.position ASC;
