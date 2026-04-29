-- name: ListTicketMessages :many
SELECT tm.*, u.name AS sender_name
FROM ticket_message tm
LEFT JOIN "user" u ON u.id = tm.sender_id
WHERE tm.ticket_id = $1
ORDER BY tm.created_at ASC;

-- name: ListTicketReplies :many
SELECT tm.*, u.name AS sender_name
FROM ticket_message tm
LEFT JOIN "user" u ON u.id = tm.sender_id
WHERE tm.ticket_id = $1 AND tm.type = 'reply'
ORDER BY tm.created_at ASC;

-- name: CreateTicketMessage :one
INSERT INTO ticket_message (ticket_id, type, body, sender_type, sender_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CountTeamRepliesForTicket :one
SELECT COUNT(*) FROM ticket_message
WHERE ticket_id = $1 AND type = 'reply' AND sender_type = 'member';
