package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var ticketCmd = &cobra.Command{
	Use:   "ticket",
	Short: "Work with tickets",
}

var ticketListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tickets",
	RunE:  runTicketList,
}

var ticketGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "Get ticket details",
	Args:  exactArgs(1),
	RunE:  runTicketGet,
}

var ticketCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new ticket",
	RunE:  runTicketCreate,
}

var ticketUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update a ticket",
	Args:  exactArgs(1),
	RunE:  runTicketUpdate,
}

var ticketDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a ticket",
	Args:  exactArgs(1),
	RunE:  runTicketDelete,
}

var ticketMessagesCmd = &cobra.Command{
	Use:   "messages <id>",
	Short: "List ticket messages",
	Args:  exactArgs(1),
	RunE:  runTicketMessages,
}

var ticketReplyCmd = &cobra.Command{
	Use:   "reply <id>",
	Short: "Reply to a ticket",
	Args:  exactArgs(1),
	RunE:  runTicketReply,
}

var ticketCreateIssueCmd = &cobra.Command{
	Use:   "create-issue <id>",
	Short: "Create a linked issue from a ticket",
	Args:  exactArgs(1),
	RunE:  runTicketCreateIssue,
}

func init() {
	ticketCmd.AddCommand(ticketListCmd)
	ticketCmd.AddCommand(ticketGetCmd)
	ticketCmd.AddCommand(ticketCreateCmd)
	ticketCmd.AddCommand(ticketUpdateCmd)
	ticketCmd.AddCommand(ticketDeleteCmd)
	ticketCmd.AddCommand(ticketMessagesCmd)
	ticketCmd.AddCommand(ticketReplyCmd)
	ticketCmd.AddCommand(ticketCreateIssueCmd)

	// ticket list
	ticketListCmd.Flags().String("status", "", "Filter by status")
	ticketListCmd.Flags().String("priority", "", "Filter by priority")
	ticketListCmd.Flags().String("assignee-id", "", "Filter by assignee ID")
	ticketListCmd.Flags().String("output", "table", "Output format: table or json")

	// ticket get
	ticketGetCmd.Flags().String("output", "json", "Output format: table or json")

	// ticket create
	ticketCreateCmd.Flags().String("client", "", "Client ID (required)")
	ticketCreateCmd.Flags().String("project", "", "Project ID")
	ticketCreateCmd.Flags().String("subject", "", "Ticket subject (required)")
	ticketCreateCmd.Flags().String("description", "", "Ticket description")
	ticketCreateCmd.Flags().String("type", "", "Ticket type: bug, question, feature_request, task, support, change_request, clarification")
	ticketCreateCmd.Flags().String("priority", "", "Priority: critical, high, normal, low")
	ticketCreateCmd.Flags().String("output", "json", "Output format: table or json")

	// ticket update
	ticketUpdateCmd.Flags().String("subject", "", "New subject")
	ticketUpdateCmd.Flags().String("description", "", "New description")
	ticketUpdateCmd.Flags().String("status", "", "New status")
	ticketUpdateCmd.Flags().String("priority", "", "New priority")
	ticketUpdateCmd.Flags().String("internal-status", "", "New internal status")
	ticketUpdateCmd.Flags().String("assignee-type", "", "Assignee type")
	ticketUpdateCmd.Flags().String("assignee", "", "Assignee ID")
	ticketUpdateCmd.Flags().String("output", "json", "Output format: table or json")

	// ticket delete (no extra flags)

	// ticket messages
	ticketMessagesCmd.Flags().String("output", "table", "Output format: table or json")

	// ticket reply
	ticketReplyCmd.Flags().String("content", "", "Reply content (required)")
	ticketReplyCmd.Flags().Bool("internal", false, "Mark as internal note")
	ticketReplyCmd.Flags().String("output", "json", "Output format: table or json")

	// ticket create-issue
	ticketCreateIssueCmd.Flags().String("team", "", "Team ID (required)")
	ticketCreateIssueCmd.Flags().String("output", "json", "Output format: table or json")
}

// ---------------------------------------------------------------------------
// Ticket commands
// ---------------------------------------------------------------------------

func runTicketList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	params := url.Values{}
	if v, _ := cmd.Flags().GetString("status"); v != "" {
		params.Set("status", v)
	}
	if v, _ := cmd.Flags().GetString("priority"); v != "" {
		params.Set("priority", v)
	}
	if v, _ := cmd.Flags().GetString("assignee-id"); v != "" {
		params.Set("assignee_id", v)
	}

	path := "/api/tickets"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	var result map[string]any
	if err := client.GetJSON(ctx, path, &result); err != nil {
		return fmt.Errorf("list tickets: %w", err)
	}

	ticketsRaw, _ := result["tickets"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, ticketsRaw)
	}

	headers := []string{"ID", "IDENTIFIER", "SUBJECT", "STATUS", "PRIORITY", "CLIENT", "CREATED"}
	rows := make([][]string, 0, len(ticketsRaw))
	for _, raw := range ticketsRaw {
		t, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		created := strVal(t, "created_at")
		if len(created) >= 10 {
			created = created[:10]
		}
		rows = append(rows, []string{
			truncateID(strVal(t, "id")),
			strVal(t, "identifier"),
			strVal(t, "subject"),
			strVal(t, "status"),
			strVal(t, "priority"),
			strVal(t, "client_name"),
			created,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runTicketGet(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var ticket map[string]any
	if err := client.GetJSON(ctx, "/api/tickets/"+args[0], &ticket); err != nil {
		return fmt.Errorf("get ticket: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "IDENTIFIER", "SUBJECT", "STATUS", "PRIORITY", "DESCRIPTION"}
		rows := [][]string{{
			truncateID(strVal(ticket, "id")),
			strVal(ticket, "identifier"),
			strVal(ticket, "subject"),
			strVal(ticket, "status"),
			strVal(ticket, "priority"),
			strVal(ticket, "description"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, ticket)
}

func runTicketCreate(cmd *cobra.Command, _ []string) error {
	clientID, _ := cmd.Flags().GetString("client")
	if clientID == "" {
		return fmt.Errorf("--client is required")
	}
	subject, _ := cmd.Flags().GetString("subject")
	if subject == "" {
		return fmt.Errorf("--subject is required")
	}

	apiClient, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{
		"client_id": clientID,
		"subject":   subject,
	}
	if v, _ := cmd.Flags().GetString("project"); v != "" {
		body["project_id"] = v
	}
	if v, _ := cmd.Flags().GetString("description"); v != "" {
		body["description"] = v
	}
	if v, _ := cmd.Flags().GetString("type"); v != "" {
		body["type"] = v
	}
	if v, _ := cmd.Flags().GetString("priority"); v != "" {
		body["priority"] = v
	}

	var result map[string]any
	if err := apiClient.PostJSON(ctx, "/api/tickets", body, &result); err != nil {
		return fmt.Errorf("create ticket: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "IDENTIFIER", "SUBJECT", "STATUS", "PRIORITY"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "identifier"),
			strVal(result, "subject"),
			strVal(result, "status"),
			strVal(result, "priority"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runTicketUpdate(cmd *cobra.Command, args []string) error {
	apiClient, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{}
	if cmd.Flags().Changed("subject") {
		v, _ := cmd.Flags().GetString("subject")
		body["subject"] = v
	}
	if cmd.Flags().Changed("description") {
		v, _ := cmd.Flags().GetString("description")
		body["description"] = v
	}
	if cmd.Flags().Changed("status") {
		v, _ := cmd.Flags().GetString("status")
		body["status"] = v
	}
	if cmd.Flags().Changed("priority") {
		v, _ := cmd.Flags().GetString("priority")
		body["priority"] = v
	}
	if cmd.Flags().Changed("internal-status") {
		v, _ := cmd.Flags().GetString("internal-status")
		body["internal_status"] = v
	}
	if cmd.Flags().Changed("assignee-type") {
		v, _ := cmd.Flags().GetString("assignee-type")
		body["assignee_type"] = v
	}
	if cmd.Flags().Changed("assignee") {
		v, _ := cmd.Flags().GetString("assignee")
		body["assignee_id"] = v
	}

	if len(body) == 0 {
		return fmt.Errorf("no fields to update; use flags like --subject, --status, --priority, --internal-status, --assignee")
	}

	var result map[string]any
	if err := apiClient.PutJSON(ctx, "/api/tickets/"+args[0], body, &result); err != nil {
		return fmt.Errorf("update ticket: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "IDENTIFIER", "SUBJECT", "STATUS", "PRIORITY"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "identifier"),
			strVal(result, "subject"),
			strVal(result, "status"),
			strVal(result, "priority"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runTicketDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.DeleteJSON(ctx, "/api/tickets/"+args[0]); err != nil {
		return fmt.Errorf("delete ticket: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Ticket %s deleted.\n", truncateID(args[0]))
	return nil
}

func runTicketMessages(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/tickets/"+args[0]+"/messages", &result); err != nil {
		return fmt.Errorf("list messages: %w", err)
	}

	messagesRaw, _ := result["messages"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, messagesRaw)
	}

	headers := []string{"SENDER", "TYPE", "CONTENT", "CREATED"}
	rows := make([][]string, 0, len(messagesRaw))
	for _, raw := range messagesRaw {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		created := strVal(m, "created_at")
		if len(created) >= 10 {
			created = created[:10]
		}
		rows = append(rows, []string{
			strVal(m, "sender_name"),
			strVal(m, "type"),
			strVal(m, "content"),
			created,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runTicketReply(cmd *cobra.Command, args []string) error {
	content, _ := cmd.Flags().GetString("content")
	if content == "" {
		return fmt.Errorf("--content is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{
		"content": content,
	}
	if v, _ := cmd.Flags().GetBool("internal"); v {
		body["is_internal_note"] = true
	}

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/tickets/"+args[0]+"/replies", body, &result); err != nil {
		return fmt.Errorf("reply to ticket: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"SENDER", "TYPE", "CONTENT", "CREATED"}
		rows := [][]string{{
			strVal(result, "sender_name"),
			strVal(result, "type"),
			strVal(result, "content"),
			strVal(result, "created_at"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runTicketCreateIssue(cmd *cobra.Command, args []string) error {
	teamID, _ := cmd.Flags().GetString("team")
	if teamID == "" {
		return fmt.Errorf("--team is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{
		"team_id": teamID,
	}

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/tickets/"+args[0]+"/create-issue", body, &result); err != nil {
		return fmt.Errorf("create issue from ticket: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ISSUE ID", "IDENTIFIER", "TITLE", "STATUS"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "identifier"),
			strVal(result, "title"),
			strVal(result, "status"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}
