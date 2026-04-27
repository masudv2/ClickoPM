-- name: ListTeams :many
SELECT * FROM team
WHERE workspace_id = $1
ORDER BY position ASC, created_at ASC;

-- name: GetTeam :one
SELECT * FROM team WHERE id = $1;

-- name: GetTeamByIdentifier :one
SELECT * FROM team
WHERE workspace_id = $1 AND lower(identifier) = lower(@identifier::text);

-- name: GetTeamInWorkspace :one
SELECT * FROM team WHERE id = $1 AND workspace_id = $2;

-- name: CreateTeam :one
INSERT INTO team (workspace_id, name, identifier, icon, color, timezone, settings, position)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: UpdateTeam :one
UPDATE team SET
    name = COALESCE(sqlc.narg('name'), name),
    identifier = COALESCE(sqlc.narg('identifier'), identifier),
    icon = COALESCE(sqlc.narg('icon'), icon),
    color = COALESCE(sqlc.narg('color'), color),
    timezone = COALESCE(sqlc.narg('timezone'), timezone),
    settings = COALESCE(sqlc.narg('settings'), settings),
    position = COALESCE(sqlc.narg('position'), position),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteTeam :exec
DELETE FROM team WHERE id = $1;

-- name: IncrementTeamIssueCounter :one
UPDATE team SET issue_counter = issue_counter + 1
WHERE id = $1
RETURNING issue_counter;

-- name: GetMaxTeamPosition :one
SELECT COALESCE(MAX(position), 0)::real AS max_position FROM team WHERE workspace_id = $1;

-- name: CountTeamIssues :one
SELECT COUNT(*) FROM issue WHERE team_id = $1;

-- name: CountTeamMembers :one
SELECT COUNT(*) FROM team_member WHERE team_id = $1;

-- Team members
-- name: ListTeamMembers :many
SELECT m.id, m.workspace_id, m.user_id, m.role, m.created_at,
       u.name, u.email, u.avatar_url
FROM team_member tm
JOIN member m ON m.id = tm.member_id
JOIN "user" u ON u.id = m.user_id
WHERE tm.team_id = $1
ORDER BY u.name ASC;

-- name: AddTeamMember :exec
INSERT INTO team_member (team_id, member_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveTeamMember :exec
DELETE FROM team_member WHERE team_id = $1 AND member_id = $2;

-- name: IsTeamMember :one
SELECT EXISTS(SELECT 1 FROM team_member WHERE team_id = $1 AND member_id = $2);
