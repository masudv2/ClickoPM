package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

const slaCheckInterval = 5 * time.Minute

func runSLAChecker(ctx context.Context, queries *db.Queries) {
	// Delay first run so the server can finish startup.
	time.Sleep(30 * time.Second)
	checkSLABreaches(ctx, queries)

	ticker := time.NewTicker(slaCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			checkSLABreaches(ctx, queries)
		}
	}
}

func checkSLABreaches(ctx context.Context, queries *db.Queries) {
	workspaces, err := queries.ListAllWorkspaces(ctx)
	if err != nil {
		slog.Error("sla checker: failed to list workspaces", "error", err)
		return
	}

	for _, ws := range workspaces {
		breached, err := queries.ListSLABreachedTickets(ctx, ws.ID)
		if err != nil {
			slog.Warn("sla checker: failed to list breached tickets",
				"workspace", util.UUIDToString(ws.ID), "error", err)
			continue
		}

		for _, ticket := range breached {
			if !ticket.AssigneeID.Valid || !ticket.AssigneeType.Valid || ticket.AssigneeType.String != "member" {
				continue
			}

			ticketIDStr := util.UUIDToString(ticket.ID)
			detailsJSON, _ := json.Marshal(map[string]string{"ticket_id": ticketIDStr})

			// Skip if we already notified for this ticket.
			exists, err := queries.ExistsSLABreachInbox(ctx, db.ExistsSLABreachInboxParams{
				WorkspaceID: ws.ID,
				RecipientID: ticket.AssigneeID,
				Column3:     detailsJSON,
			})
			if err != nil || exists {
				continue
			}

			_, err = queries.CreateInboxItem(ctx, db.CreateInboxItemParams{
				WorkspaceID:   ws.ID,
				RecipientType: "member",
				RecipientID:   ticket.AssigneeID,
				Type:          "sla_breach",
				Severity:      "action_required",
				Title:         fmt.Sprintf("SLA breached: TKT-%d %s", ticket.Number, ticket.Subject),
				Details:       detailsJSON,
			})
			if err != nil {
				slog.Warn("sla checker: failed to create inbox item",
					"ticket", ticket.Number, "error", err)
			}
		}
	}
}
