package main

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var issueCmd = &cobra.Command{
	Use:   "issue",
	Short: "Work with issues",
}

var issueListCmd = &cobra.Command{
	Use:   "list",
	Short: "List issues in the workspace",
	RunE:  runIssueList,
}

var issueGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "Get issue details",
	Args:  exactArgs(1),
	RunE:  runIssueGet,
}

var issueCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new issue",
	RunE:  runIssueCreate,
}

var issueUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update an issue",
	Args:  exactArgs(1),
	RunE:  runIssueUpdate,
}

var issueAssignCmd = &cobra.Command{
	Use:   "assign <id>",
	Short: "Assign an issue to a member or agent",
	Args:  exactArgs(1),
	RunE:  runIssueAssign,
}

var issueStatusCmd = &cobra.Command{
	Use:   "status <id> <status>",
	Short: "Change issue status",
	Args:  exactArgs(2),
	RunE:  runIssueStatus,
}

// Comment subcommands.

var issueCommentCmd = &cobra.Command{
	Use:   "comment",
	Short: "Work with issue comments",
}

var issueCommentListCmd = &cobra.Command{
	Use:   "list <issue-id>",
	Short: "List comments on an issue",
	Args:  exactArgs(1),
	RunE:  runIssueCommentList,
}

var issueCommentAddCmd = &cobra.Command{
	Use:   "add <issue-id>",
	Short: "Add a comment to an issue",
	Args:  exactArgs(1),
	RunE:  runIssueCommentAdd,
}

var issueCommentDeleteCmd = &cobra.Command{
	Use:   "delete <comment-id>",
	Short: "Delete a comment",
	Args:  exactArgs(1),
	RunE:  runIssueCommentDelete,
}

// Subscriber subcommands.

var issueSubscriberCmd = &cobra.Command{
	Use:   "subscriber",
	Short: "Work with issue subscribers",
}

var issueSubscriberListCmd = &cobra.Command{
	Use:   "list <issue-id>",
	Short: "List subscribers of an issue",
	Args:  exactArgs(1),
	RunE:  runIssueSubscriberList,
}

var issueSubscriberAddCmd = &cobra.Command{
	Use:   "add <issue-id>",
	Short: "Subscribe a user or agent to an issue (defaults to the caller)",
	Args:  exactArgs(1),
	RunE:  runIssueSubscriberAdd,
}

var issueSubscriberRemoveCmd = &cobra.Command{
	Use:   "remove <issue-id>",
	Short: "Unsubscribe a user or agent from an issue (defaults to the caller)",
	Args:  exactArgs(1),
	RunE:  runIssueSubscriberRemove,
}

// Execution history subcommands.

var issueRunsCmd = &cobra.Command{
	Use:   "runs <issue-id>",
	Short: "List execution history for an issue",
	Args:  exactArgs(1),
	RunE:  runIssueRuns,
}

var issueRunMessagesCmd = &cobra.Command{
	Use:   "run-messages <task-id>",
	Short: "List messages for an execution",
	Args:  exactArgs(1),
	RunE:  runIssueRunMessages,
}

var issueRerunCmd = &cobra.Command{
	Use:   "rerun <id>",
	Short: "Re-enqueue an issue's current agent assignment as a fresh task",
	Args:  exactArgs(1),
	RunE:  runIssueRerun,
}

var issueSearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search issues by title or description",
	Args:  cobra.ExactArgs(1),
	RunE:  runIssueSearch,
}

var validIssueStatuses = []string{
	"backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled",
}

func init() {
	issueCmd.AddCommand(issueListCmd)
	issueCmd.AddCommand(issueGetCmd)
	issueCmd.AddCommand(issueCreateCmd)
	issueCmd.AddCommand(issueUpdateCmd)
	issueCmd.AddCommand(issueAssignCmd)
	issueCmd.AddCommand(issueStatusCmd)
	issueCmd.AddCommand(issueCommentCmd)
	issueCmd.AddCommand(issueSubscriberCmd)
	issueCmd.AddCommand(issueRunsCmd)
	issueCmd.AddCommand(issueRunMessagesCmd)
	issueCmd.AddCommand(issueRerunCmd)
	issueCmd.AddCommand(issueSearchCmd)

	issueCommentCmd.AddCommand(issueCommentListCmd)
	issueCommentCmd.AddCommand(issueCommentAddCmd)
	issueCommentCmd.AddCommand(issueCommentDeleteCmd)

	issueSubscriberCmd.AddCommand(issueSubscriberListCmd)
	issueSubscriberCmd.AddCommand(issueSubscriberAddCmd)
	issueSubscriberCmd.AddCommand(issueSubscriberRemoveCmd)

	// issue list
	issueListCmd.Flags().String("output", "table", "Output format: table or json")
	issueListCmd.Flags().String("status", "", "Filter by status")
	issueListCmd.Flags().String("priority", "", "Filter by priority")
	issueListCmd.Flags().String("assignee", "", "Filter by assignee name")
	issueListCmd.Flags().String("project", "", "Filter by project ID")
	issueListCmd.Flags().String("team", "", "Filter by team ID or name")
	issueListCmd.Flags().String("label", "", "Filter by label name")
	issueListCmd.Flags().Int("limit", 50, "Maximum number of issues to return")
	issueListCmd.Flags().Int("offset", 0, "Number of issues to skip (for pagination)")

	// issue get
	issueGetCmd.Flags().String("output", "json", "Output format: table or json")

	// issue create
	issueCreateCmd.Flags().String("title", "", "Issue title (required)")
	issueCreateCmd.Flags().String("description", "", "Issue description")
	issueCreateCmd.Flags().String("status", "", "Issue status")
	issueCreateCmd.Flags().String("priority", "", "Issue priority")
	issueCreateCmd.Flags().String("assignee", "", "Assignee name (member or agent)")
	issueCreateCmd.Flags().String("parent", "", "Parent issue ID")
	issueCreateCmd.Flags().String("project", "", "Project ID")
	issueCreateCmd.Flags().String("team", "", "Team ID or name")
	issueCreateCmd.Flags().String("cycle", "", "Cycle ID")
	issueCreateCmd.Flags().String("milestone", "", "Milestone ID (issue must also have --project)")
	issueCreateCmd.Flags().Int("estimate", 0, "Point estimate (1,2,3,5,8,13)")
	issueCreateCmd.Flags().String("due-date", "", "Due date (RFC3339 format)")
	issueCreateCmd.Flags().String("start-date", "", "Start date (YYYY-MM-DD format)")
	issueCreateCmd.Flags().StringSlice("label", nil, "Label name(s) to apply (can be specified multiple times)")
	issueCreateCmd.Flags().String("output", "json", "Output format: table or json")
	issueCreateCmd.Flags().StringSlice("attachment", nil, "File path(s) to attach (can be specified multiple times)")

	// issue update
	issueUpdateCmd.Flags().String("title", "", "New title")
	issueUpdateCmd.Flags().String("description", "", "New description")
	issueUpdateCmd.Flags().String("status", "", "New status")
	issueUpdateCmd.Flags().String("priority", "", "New priority")
	issueUpdateCmd.Flags().String("assignee", "", "New assignee name (member or agent)")
	issueUpdateCmd.Flags().String("project", "", "Project ID (use --project \"\" to clear)")
	issueUpdateCmd.Flags().String("cycle", "", "Cycle ID (use --cycle \"\" to clear)")
	issueUpdateCmd.Flags().String("milestone", "", "Milestone ID (use --milestone \"\" to clear)")
	issueUpdateCmd.Flags().Int("estimate", 0, "Point estimate (1,2,3,5,8,13; use --estimate 0 to clear)")
	issueUpdateCmd.Flags().String("due-date", "", "New due date (RFC3339 format; use --due-date \"\" to clear)")
	issueUpdateCmd.Flags().String("start-date", "", "Start date (YYYY-MM-DD; use --start-date \"\" to clear)")
	issueUpdateCmd.Flags().String("parent", "", "Parent issue ID (use --parent \"\" to clear)")
	issueUpdateCmd.Flags().StringSlice("label", nil, "Label name(s) to set (replaces all existing labels)")
	issueUpdateCmd.Flags().String("output", "json", "Output format: table or json")

	// issue status
	issueStatusCmd.Flags().String("output", "table", "Output format: table or json")

	// issue assign
	issueAssignCmd.Flags().String("to", "", "Assignee name (member or agent)")
	issueAssignCmd.Flags().Bool("unassign", false, "Remove current assignee")
	issueAssignCmd.Flags().String("output", "json", "Output format: table or json")

	// issue comment list
	issueCommentListCmd.Flags().String("output", "table", "Output format: table or json")
	issueCommentListCmd.Flags().Int("limit", 0, "Maximum number of comments to return (0 = all)")
	issueCommentListCmd.Flags().Int("offset", 0, "Number of comments to skip")
	issueCommentListCmd.Flags().String("since", "", "Only return comments created after this timestamp (RFC3339)")

	// issue runs
	issueRunsCmd.Flags().String("output", "table", "Output format: table or json")

	// issue rerun
	issueRerunCmd.Flags().String("output", "json", "Output format: table or json")

	// issue run-messages
	issueRunMessagesCmd.Flags().String("output", "json", "Output format: table or json")
	issueRunMessagesCmd.Flags().Int("since", 0, "Only return messages after this sequence number")

	// issue comment add
	issueCommentAddCmd.Flags().String("content", "", "Comment content (required unless --content-stdin)")
	issueCommentAddCmd.Flags().Bool("content-stdin", false, "Read comment content from stdin (avoids shell escaping issues)")
	issueCommentAddCmd.Flags().String("parent", "", "Parent comment ID (reply to a specific comment)")
	issueCommentAddCmd.Flags().StringSlice("attachment", nil, "File path(s) to attach (can be specified multiple times)")
	issueCommentAddCmd.Flags().String("output", "json", "Output format: table or json")

	// issue search
	issueSearchCmd.Flags().Int("limit", 20, "Maximum number of results to return")
	issueSearchCmd.Flags().Bool("include-closed", false, "Include done and cancelled issues")
	issueSearchCmd.Flags().String("output", "table", "Output format: table or json")

	// issue subscriber list
	issueSubscriberListCmd.Flags().String("output", "table", "Output format: table or json")

	// issue subscriber add
	issueSubscriberAddCmd.Flags().String("user", "", "Member or agent name to subscribe (defaults to the caller)")
	issueSubscriberAddCmd.Flags().String("output", "json", "Output format: table or json")

	// issue subscriber remove
	issueSubscriberRemoveCmd.Flags().String("user", "", "Member or agent name to unsubscribe (defaults to the caller)")
	issueSubscriberRemoveCmd.Flags().String("output", "json", "Output format: table or json")
}

// ---------------------------------------------------------------------------
// Issue commands
// ---------------------------------------------------------------------------

func runIssueList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if client.WorkspaceID == "" {
		if _, err := requireWorkspaceID(cmd); err != nil {
			return err
		}
	}

	params := url.Values{}
	params.Set("workspace_id", client.WorkspaceID)
	if v, _ := cmd.Flags().GetString("status"); v != "" {
		params.Set("status", v)
	}
	if v, _ := cmd.Flags().GetString("priority"); v != "" {
		params.Set("priority", v)
	}
	if v, _ := cmd.Flags().GetInt("limit"); v > 0 {
		params.Set("limit", fmt.Sprintf("%d", v))
	}
	if v, _ := cmd.Flags().GetString("assignee"); v != "" {
		_, aID, resolveErr := resolveAssignee(ctx, client, v)
		if resolveErr != nil {
			return fmt.Errorf("resolve assignee: %w", resolveErr)
		}
		params.Set("assignee_id", aID)
	}
	if v, _ := cmd.Flags().GetInt("offset"); v > 0 {
		params.Set("offset", fmt.Sprintf("%d", v))
	}
	if v, _ := cmd.Flags().GetString("project"); v != "" {
		params.Set("project_id", v)
	}
	if v, _ := cmd.Flags().GetString("team"); v != "" {
		teamID, resolveErr := resolveTeam(ctx, client, v)
		if resolveErr != nil {
			return fmt.Errorf("resolve team: %w", resolveErr)
		}
		params.Set("team_id", teamID)
	}

	path := "/api/issues"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	var result map[string]any
	if err := client.GetJSON(ctx, path, &result); err != nil {
		return fmt.Errorf("list issues: %w", err)
	}

	issuesRaw, _ := result["issues"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		total, _ := result["total"].(float64)
		limit, _ := cmd.Flags().GetInt("limit")
		offset, _ := cmd.Flags().GetInt("offset")
		hasMore := offset+len(issuesRaw) < int(total)
		wrapped := map[string]any{
			"issues":   issuesRaw,
			"total":    int(total),
			"limit":    limit,
			"offset":   offset,
			"has_more": hasMore,
		}
		return cli.PrintJSON(os.Stdout, wrapped)
	}

	headers := []string{"ID", "IDENTIFIER", "TITLE", "STATUS", "PRIORITY", "ASSIGNEE", "ESTIMATE", "DUE DATE"}
	rows := make([][]string, 0, len(issuesRaw))
	for _, raw := range issuesRaw {
		issue, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		assignee := formatAssignee(issue)
		dueDate := strVal(issue, "due_date")
		if dueDate != "" && len(dueDate) >= 10 {
			dueDate = dueDate[:10]
		}
		estimate := ""
		if v, ok := issue["estimate"]; ok && v != nil {
			if n, ok := v.(float64); ok && n > 0 {
				estimate = strconv.Itoa(int(n))
			}
		}
		rows = append(rows, []string{
			truncateID(strVal(issue, "id")),
			strVal(issue, "identifier"),
			strVal(issue, "title"),
			strVal(issue, "status"),
			strVal(issue, "priority"),
			assignee,
			estimate,
			dueDate,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runIssueGet(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var issue map[string]any
	if err := client.GetJSON(ctx, "/api/issues/"+args[0], &issue); err != nil {
		return fmt.Errorf("get issue: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		assignee := formatAssignee(issue)
		dueDate := strVal(issue, "due_date")
		if dueDate != "" && len(dueDate) >= 10 {
			dueDate = dueDate[:10]
		}
		headers := []string{"ID", "TITLE", "STATUS", "PRIORITY", "ASSIGNEE", "DUE DATE", "DESCRIPTION"}
		rows := [][]string{{
			truncateID(strVal(issue, "id")),
			strVal(issue, "title"),
			strVal(issue, "status"),
			strVal(issue, "priority"),
			assignee,
			dueDate,
			strVal(issue, "description"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, issue)
}

func runIssueCreate(cmd *cobra.Command, _ []string) error {
	title, _ := cmd.Flags().GetString("title")
	if title == "" {
		return fmt.Errorf("--title is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	// Use a longer timeout when attachments are present (file uploads can be slow).
	timeout := 15 * time.Second
	attachments, _ := cmd.Flags().GetStringSlice("attachment")
	if len(attachments) > 0 {
		timeout = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	body := map[string]any{"title": title}
	if v, _ := cmd.Flags().GetString("description"); v != "" {
		body["description"] = v
	}
	if v, _ := cmd.Flags().GetString("status"); v != "" {
		body["status"] = v
	}
	if v, _ := cmd.Flags().GetString("priority"); v != "" {
		body["priority"] = v
	}
	if v, _ := cmd.Flags().GetString("parent"); v != "" {
		body["parent_issue_id"] = v
	}
	if v, _ := cmd.Flags().GetString("project"); v != "" {
		body["project_id"] = v
	}
	if v, _ := cmd.Flags().GetString("due-date"); v != "" {
		body["due_date"] = v
	}
	if v, _ := cmd.Flags().GetString("start-date"); v != "" {
		body["start_date"] = v
	}
	if v, _ := cmd.Flags().GetString("team"); v != "" {
		teamID, resolveErr := resolveTeam(ctx, client, v)
		if resolveErr != nil {
			return fmt.Errorf("resolve team: %w", resolveErr)
		}
		body["team_id"] = teamID
	}
	if v, _ := cmd.Flags().GetString("cycle"); v != "" {
		body["cycle_id"] = v
	}
	if v, _ := cmd.Flags().GetString("milestone"); v != "" {
		body["milestone_id"] = v
	}
	if cmd.Flags().Changed("estimate") {
		v, _ := cmd.Flags().GetInt("estimate")
		body["estimate"] = v
	}
	if v, _ := cmd.Flags().GetString("assignee"); v != "" {
		aType, aID, resolveErr := resolveAssignee(ctx, client, v)
		if resolveErr != nil {
			return fmt.Errorf("resolve assignee: %w", resolveErr)
		}
		body["assignee_type"] = aType
		body["assignee_id"] = aID
	}

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/issues", body, &result); err != nil {
		return fmt.Errorf("create issue: %w", err)
	}

	// Apply labels if specified.
	labels, _ := cmd.Flags().GetStringSlice("label")
	issueID := strVal(result, "id")
	if len(labels) > 0 && issueID != "" {
		labelIDs, resolveErr := resolveLabels(ctx, client, labels)
		if resolveErr != nil {
			fmt.Fprintf(os.Stderr, "Warning: could not resolve labels: %v\n", resolveErr)
		} else if len(labelIDs) > 0 {
			labelBody := map[string]any{"label_ids": labelIDs}
			var labelResult any
			if err := client.PutJSON(ctx, "/api/issues/"+issueID+"/labels", labelBody, &labelResult); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: could not set labels: %v\n", err)
			}
		}
	}

	// Upload attachments and link them to the newly created issue.
	for _, filePath := range attachments {
		data, readErr := os.ReadFile(filePath)
		if readErr != nil {
			return fmt.Errorf("read attachment %s: %w", filePath, readErr)
		}
		if _, uploadErr := client.UploadFile(ctx, data, filePath, issueID); uploadErr != nil {
			return fmt.Errorf("upload attachment %s: %w", filePath, uploadErr)
		}
		fmt.Fprintf(os.Stderr, "Uploaded %s\n", filePath)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "TITLE", "STATUS", "PRIORITY"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "title"),
			strVal(result, "status"),
			strVal(result, "priority"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runIssueUpdate(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{}
	if cmd.Flags().Changed("title") {
		v, _ := cmd.Flags().GetString("title")
		body["title"] = v
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
	if cmd.Flags().Changed("project") {
		v, _ := cmd.Flags().GetString("project")
		body["project_id"] = v
	}
	if cmd.Flags().Changed("due-date") {
		v, _ := cmd.Flags().GetString("due-date")
		body["due_date"] = v
	}
	if cmd.Flags().Changed("assignee") {
		v, _ := cmd.Flags().GetString("assignee")
		aType, aID, resolveErr := resolveAssignee(ctx, client, v)
		if resolveErr != nil {
			return fmt.Errorf("resolve assignee: %w", resolveErr)
		}
		body["assignee_type"] = aType
		body["assignee_id"] = aID
	}
	if cmd.Flags().Changed("parent") {
		v, _ := cmd.Flags().GetString("parent")
		if v == "" {
			body["parent_issue_id"] = nil
		} else {
			body["parent_issue_id"] = v
		}
	}
	if cmd.Flags().Changed("cycle") {
		v, _ := cmd.Flags().GetString("cycle")
		if v == "" {
			body["cycle_id"] = nil
		} else {
			body["cycle_id"] = v
		}
	}
	if cmd.Flags().Changed("milestone") {
		v, _ := cmd.Flags().GetString("milestone")
		if v == "" {
			body["milestone_id"] = nil
		} else {
			body["milestone_id"] = v
		}
	}
	if cmd.Flags().Changed("estimate") {
		v, _ := cmd.Flags().GetInt("estimate")
		if v == 0 {
			body["estimate"] = nil
		} else {
			body["estimate"] = v
		}
	}
	if cmd.Flags().Changed("start-date") {
		v, _ := cmd.Flags().GetString("start-date")
		if v == "" {
			body["start_date"] = nil
		} else {
			body["start_date"] = v
		}
	}

	labels, _ := cmd.Flags().GetStringSlice("label")
	hasLabels := cmd.Flags().Changed("label")

	if len(body) == 0 && !hasLabels {
		return fmt.Errorf("no fields to update; use flags like --title, --status, --priority, --assignee, --estimate, --cycle, --label, etc.")
	}

	var result map[string]any
	if len(body) > 0 {
		if err := client.PutJSON(ctx, "/api/issues/"+args[0], body, &result); err != nil {
			return fmt.Errorf("update issue: %w", err)
		}
	}

	// Apply labels if specified.
	if hasLabels {
		labelIDs, resolveErr := resolveLabels(ctx, client, labels)
		if resolveErr != nil {
			return fmt.Errorf("resolve labels: %w", resolveErr)
		}
		labelBody := map[string]any{"label_ids": labelIDs}
		var labelResult any
		if err := client.PutJSON(ctx, "/api/issues/"+args[0]+"/labels", labelBody, &labelResult); err != nil {
			return fmt.Errorf("set labels: %w", err)
		}
		// Re-fetch the issue to get updated labels in output.
		if err := client.GetJSON(ctx, "/api/issues/"+args[0], &result); err != nil {
			return fmt.Errorf("get updated issue: %w", err)
		}
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "TITLE", "STATUS", "PRIORITY"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "title"),
			strVal(result, "status"),
			strVal(result, "priority"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runIssueAssign(cmd *cobra.Command, args []string) error {
	toName, _ := cmd.Flags().GetString("to")
	unassign, _ := cmd.Flags().GetBool("unassign")

	if toName == "" && !unassign {
		return fmt.Errorf("provide --to <name> or --unassign")
	}
	if toName != "" && unassign {
		return fmt.Errorf("--to and --unassign are mutually exclusive")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{}
	if unassign {
		body["assignee_type"] = nil
		body["assignee_id"] = nil
	} else {
		aType, aID, resolveErr := resolveAssignee(ctx, client, toName)
		if resolveErr != nil {
			return fmt.Errorf("resolve assignee: %w", resolveErr)
		}
		body["assignee_type"] = aType
		body["assignee_id"] = aID
	}

	var result map[string]any
	if err := client.PutJSON(ctx, "/api/issues/"+args[0], body, &result); err != nil {
		return fmt.Errorf("assign issue: %w", err)
	}

	if unassign {
		fmt.Fprintf(os.Stderr, "Issue %s unassigned.\n", truncateID(args[0]))
	} else {
		fmt.Fprintf(os.Stderr, "Issue %s assigned to %s.\n", truncateID(args[0]), toName)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}

func runIssueStatus(cmd *cobra.Command, args []string) error {
	id := args[0]
	status := args[1]

	valid := false
	for _, s := range validIssueStatuses {
		if s == status {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("invalid status %q; valid values: %s", status, strings.Join(validIssueStatuses, ", "))
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{"status": status}
	var result map[string]any
	if err := client.PutJSON(ctx, "/api/issues/"+id, body, &result); err != nil {
		return fmt.Errorf("update status: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Issue %s status changed to %s.\n", truncateID(id), status)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, result)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Comment commands
// ---------------------------------------------------------------------------

func runIssueCommentList(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	params := url.Values{}
	if v, _ := cmd.Flags().GetInt("limit"); v > 0 {
		params.Set("limit", fmt.Sprintf("%d", v))
	}
	if v, _ := cmd.Flags().GetInt("offset"); v > 0 {
		params.Set("offset", fmt.Sprintf("%d", v))
	}
	if v, _ := cmd.Flags().GetString("since"); v != "" {
		params.Set("since", v)
	}

	path := "/api/issues/" + args[0] + "/comments"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	var comments []map[string]any
	isPaginated := len(params) > 0
	if isPaginated {
		headers, getErr := client.GetJSONWithHeaders(ctx, path, &comments)
		if getErr != nil {
			return fmt.Errorf("list comments: %w", getErr)
		}
		if total := headers.Get("X-Total-Count"); total != "" {
			fmt.Fprintf(os.Stderr, "Showing %d of %s comments.\n", len(comments), total)
		}
	} else {
		if err := client.GetJSON(ctx, path, &comments); err != nil {
			return fmt.Errorf("list comments: %w", err)
		}
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, comments)
	}

	headers := []string{"ID", "PARENT", "AUTHOR", "TYPE", "CONTENT", "CREATED"}
	rows := make([][]string, 0, len(comments))
	for _, c := range comments {
		content := strVal(c, "content")
		if utf8.RuneCountInString(content) > 80 {
			runes := []rune(content)
			content = string(runes[:77]) + "..."
		}
		created := strVal(c, "created_at")
		if len(created) >= 16 {
			created = created[:16]
		}
		parentID := strVal(c, "parent_id")
		if parentID == "" {
			parentID = "—"
		}
		rows = append(rows, []string{
			strVal(c, "id"),
			parentID,
			strVal(c, "author_type") + ":" + truncateID(strVal(c, "author_id")),
			strVal(c, "type"),
			content,
			created,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runIssueCommentAdd(cmd *cobra.Command, args []string) error {
	content, _ := cmd.Flags().GetString("content")
	useStdin, _ := cmd.Flags().GetBool("content-stdin")

	if content != "" && useStdin {
		return fmt.Errorf("--content and --content-stdin are mutually exclusive")
	}

	if useStdin {
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return fmt.Errorf("read stdin: %w", err)
		}
		content = strings.TrimSuffix(string(data), "\n")
		if content == "" {
			return fmt.Errorf("stdin content is empty")
		}
	}

	if content == "" {
		return fmt.Errorf("--content or --content-stdin is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	issueID := args[0]

	// Use a longer timeout when attachments are present (file uploads can be slow).
	timeout := 15 * time.Second
	attachments, _ := cmd.Flags().GetStringSlice("attachment")
	if len(attachments) > 0 {
		timeout = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// Upload attachments and collect their IDs.
	var attachmentIDs []string
	for _, filePath := range attachments {
		data, readErr := os.ReadFile(filePath)
		if readErr != nil {
			return fmt.Errorf("read attachment %s: %w", filePath, readErr)
		}
		id, uploadErr := client.UploadFile(ctx, data, filePath, issueID)
		if uploadErr != nil {
			return fmt.Errorf("upload attachment %s: %w", filePath, uploadErr)
		}
		attachmentIDs = append(attachmentIDs, id)
		fmt.Fprintf(os.Stderr, "Uploaded %s\n", filePath)
	}

	body := map[string]any{"content": content}
	if parentID, _ := cmd.Flags().GetString("parent"); parentID != "" {
		body["parent_id"] = parentID
	}
	if len(attachmentIDs) > 0 {
		body["attachment_ids"] = attachmentIDs
	}
	var result map[string]any
	if err := client.PostJSON(ctx, "/api/issues/"+issueID+"/comments", body, &result); err != nil {
		return fmt.Errorf("add comment: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Comment added to issue %s.\n", truncateID(issueID))

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}

func runIssueCommentDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.DeleteJSON(ctx, "/api/comments/"+args[0]); err != nil {
		return fmt.Errorf("delete comment: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Comment %s deleted.\n", truncateID(args[0]))
	return nil
}

// ---------------------------------------------------------------------------
// Execution history commands
// ---------------------------------------------------------------------------

func runIssueRuns(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var runs []map[string]any
	if err := client.GetJSON(ctx, "/api/issues/"+args[0]+"/task-runs", &runs); err != nil {
		return fmt.Errorf("list runs: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, runs)
	}

	headers := []string{"ID", "AGENT", "STATUS", "STARTED", "COMPLETED", "ERROR"}
	rows := make([][]string, 0, len(runs))
	for _, r := range runs {
		started := strVal(r, "started_at")
		if len(started) >= 16 {
			started = started[:16]
		}
		completed := strVal(r, "completed_at")
		if len(completed) >= 16 {
			completed = completed[:16]
		}
		errMsg := strVal(r, "error")
		if utf8.RuneCountInString(errMsg) > 50 {
			runes := []rune(errMsg)
			errMsg = string(runes[:47]) + "..."
		}
		rows = append(rows, []string{
			truncateID(strVal(r, "id")),
			truncateID(strVal(r, "agent_id")),
			strVal(r, "status"),
			started,
			completed,
			errMsg,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runIssueRunMessages(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	path := "/api/daemon/tasks/" + args[0] + "/messages"
	if since, _ := cmd.Flags().GetInt("since"); since > 0 {
		path += fmt.Sprintf("?since=%d", since)
	}

	var messages []map[string]any
	if err := client.GetJSON(ctx, path, &messages); err != nil {
		return fmt.Errorf("list run messages: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, messages)
	}

	headers := []string{"SEQ", "TYPE", "TOOL", "CONTENT"}
	rows := make([][]string, 0, len(messages))
	for _, m := range messages {
		content := strVal(m, "content")
		if content == "" {
			content = strVal(m, "output")
		}
		if utf8.RuneCountInString(content) > 80 {
			runes := []rune(content)
			content = string(runes[:77]) + "..."
		}
		seq := ""
		if v, ok := m["seq"]; ok {
			seq = fmt.Sprintf("%v", v)
		}
		rows = append(rows, []string{
			seq,
			strVal(m, "type"),
			strVal(m, "tool"),
			content,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

// ---------------------------------------------------------------------------
// Search command
// ---------------------------------------------------------------------------

func runIssueRerun(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var task map[string]any
	if err := client.PostJSON(ctx, "/api/issues/"+args[0]+"/rerun", map[string]any{}, &task); err != nil {
		return fmt.Errorf("rerun issue: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, task)
	}
	fmt.Fprintf(os.Stdout, "Re-enqueued task %s on agent %s\n", strVal(task, "id"), strVal(task, "agent_id"))
	return nil
}

func runIssueSearch(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	params := url.Values{}
	params.Set("q", args[0])
	if v, _ := cmd.Flags().GetInt("limit"); v > 0 {
		params.Set("limit", fmt.Sprintf("%d", v))
	}
	if v, _ := cmd.Flags().GetBool("include-closed"); v {
		params.Set("include_closed", "true")
	}

	path := "/api/issues/search?" + params.Encode()

	var result map[string]any
	if err := client.GetJSON(ctx, path, &result); err != nil {
		return fmt.Errorf("search issues: %w", err)
	}

	issuesRaw, _ := result["issues"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, result)
	}

	headers := []string{"ID", "IDENTIFIER", "TITLE", "STATUS", "MATCH"}
	rows := make([][]string, 0, len(issuesRaw))
	for _, raw := range issuesRaw {
		issue, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		matchInfo := strVal(issue, "match_source")
		if snippet := strVal(issue, "matched_snippet"); snippet != "" {
			if utf8.RuneCountInString(snippet) > 50 {
				runes := []rune(snippet)
				snippet = string(runes[:47]) + "..."
			}
			matchInfo += ": " + snippet
		}
		rows = append(rows, []string{
			truncateID(strVal(issue, "id")),
			strVal(issue, "identifier"),
			strVal(issue, "title"),
			strVal(issue, "status"),
			matchInfo,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

// ---------------------------------------------------------------------------
// Subscriber commands
// ---------------------------------------------------------------------------

func runIssueSubscriberList(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var subscribers []map[string]any
	if err := client.GetJSON(ctx, "/api/issues/"+args[0]+"/subscribers", &subscribers); err != nil {
		return fmt.Errorf("list subscribers: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, subscribers)
	}

	headers := []string{"USER_TYPE", "USER_ID", "REASON", "CREATED"}
	rows := make([][]string, 0, len(subscribers))
	for _, s := range subscribers {
		created := strVal(s, "created_at")
		if len(created) >= 16 {
			created = created[:16]
		}
		rows = append(rows, []string{
			strVal(s, "user_type"),
			truncateID(strVal(s, "user_id")),
			strVal(s, "reason"),
			created,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runIssueSubscriberAdd(cmd *cobra.Command, args []string) error {
	return runIssueSubscriberMutation(cmd, args[0], "subscribe")
}

func runIssueSubscriberRemove(cmd *cobra.Command, args []string) error {
	return runIssueSubscriberMutation(cmd, args[0], "unsubscribe")
}

// runIssueSubscriberMutation shares subscribe/unsubscribe logic — both endpoints
// take the same request body and only differ in the path.
func runIssueSubscriberMutation(cmd *cobra.Command, issueID, action string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{}
	userName, _ := cmd.Flags().GetString("user")
	if userName != "" {
		uType, uID, resolveErr := resolveAssignee(ctx, client, userName)
		if resolveErr != nil {
			return fmt.Errorf("resolve user: %w", resolveErr)
		}
		body["user_type"] = uType
		body["user_id"] = uID
	}

	var result map[string]any
	path := "/api/issues/" + issueID + "/" + action
	if err := client.PostJSON(ctx, path, body, &result); err != nil {
		return fmt.Errorf("%s issue: %w", action, err)
	}

	target := "caller"
	if userName != "" {
		target = userName
	}
	if action == "subscribe" {
		fmt.Fprintf(os.Stderr, "Subscribed %s to issue %s.\n", target, truncateID(issueID))
	} else {
		fmt.Fprintf(os.Stderr, "Unsubscribed %s from issue %s.\n", target, truncateID(issueID))
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type assigneeMatch struct {
	Type string // "member" or "agent"
	ID   string // user_id for members, agent id for agents
	Name string
}

func resolveAssignee(ctx context.Context, client *cli.APIClient, name string) (string, string, error) {
	if client.WorkspaceID == "" {
		return "", "", fmt.Errorf("workspace ID is required to resolve assignees; use --workspace-id or set MULTICA_WORKSPACE_ID")
	}

	input := strings.TrimSpace(name)
	if input == "" {
		return "", "", fmt.Errorf("no member or agent found matching %q", name)
	}
	inputLower := strings.ToLower(input)

	// Matches are collected into three priority buckets. Higher-priority buckets
	// short-circuit lower-priority matching so that, e.g., an exact name match
	// always wins over a substring collision with another candidate.
	//   1. idMatches        — full UUID or 8-char ShortID (as shown by `truncateID`).
	//   2. exactMatches     — case-insensitive full name equality.
	//   3. substringMatches — preserves the existing partial-name UX.
	var idMatches, exactMatches, substringMatches []assigneeMatch
	var errs []error

	classify := func(entityType, id, displayName string) {
		match := assigneeMatch{Type: entityType, ID: id, Name: displayName}
		if id != "" && (strings.EqualFold(id, input) || strings.EqualFold(truncateID(id), input)) {
			idMatches = append(idMatches, match)
			return
		}
		if strings.EqualFold(displayName, input) {
			exactMatches = append(exactMatches, match)
			return
		}
		if strings.Contains(strings.ToLower(displayName), inputLower) {
			substringMatches = append(substringMatches, match)
		}
	}

	// Search members.
	var members []map[string]any
	if err := client.GetJSON(ctx, "/api/workspaces/"+client.WorkspaceID+"/members", &members); err != nil {
		errs = append(errs, fmt.Errorf("fetch members: %w", err))
	} else {
		for _, m := range members {
			classify("member", strVal(m, "user_id"), strVal(m, "name"))
		}
	}

	// Search agents.
	var agents []map[string]any
	agentPath := "/api/agents?" + url.Values{"workspace_id": {client.WorkspaceID}}.Encode()
	if err := client.GetJSON(ctx, agentPath, &agents); err != nil {
		errs = append(errs, fmt.Errorf("fetch agents: %w", err))
	} else {
		for _, a := range agents {
			classify("agent", strVal(a, "id"), strVal(a, "name"))
		}
	}

	// If both fetches failed, report the errors instead of a misleading "not found".
	if len(errs) == 2 {
		return "", "", fmt.Errorf("failed to resolve assignee: %v; %v", errs[0], errs[1])
	}

	for _, bucket := range [][]assigneeMatch{idMatches, exactMatches, substringMatches} {
		switch len(bucket) {
		case 0:
			continue
		case 1:
			return bucket[0].Type, bucket[0].ID, nil
		default:
			return "", "", ambiguousAssigneeError(input, bucket)
		}
	}
	return "", "", fmt.Errorf("no member or agent found matching %q", input)
}

func ambiguousAssigneeError(input string, matches []assigneeMatch) error {
	parts := make([]string, 0, len(matches))
	for _, m := range matches {
		parts = append(parts, fmt.Sprintf("  %s %q (%s)", m.Type, m.Name, truncateID(m.ID)))
	}
	return fmt.Errorf("ambiguous assignee %q; matches:\n%s", input, strings.Join(parts, "\n"))
}

// resolveTeam resolves a team by ID, identifier, or name (substring match).
func resolveTeam(ctx context.Context, client *cli.APIClient, input string) (string, error) {
	var teams []map[string]any
	if err := client.GetJSON(ctx, "/api/teams", &teams); err != nil {
		return "", fmt.Errorf("fetch teams: %w", err)
	}

	inputLower := strings.ToLower(strings.TrimSpace(input))
	var idMatches, exactMatches, substringMatches []map[string]any

	for _, t := range teams {
		tid := strVal(t, "id")
		name := strVal(t, "name")
		identifier := strVal(t, "identifier")

		if strings.EqualFold(tid, input) || strings.EqualFold(truncateID(tid), input) {
			idMatches = append(idMatches, t)
			continue
		}
		if strings.EqualFold(identifier, input) || strings.EqualFold(name, input) {
			exactMatches = append(exactMatches, t)
			continue
		}
		if strings.Contains(strings.ToLower(name), inputLower) || strings.Contains(strings.ToLower(identifier), inputLower) {
			substringMatches = append(substringMatches, t)
		}
	}

	for _, bucket := range [][]map[string]any{idMatches, exactMatches, substringMatches} {
		switch len(bucket) {
		case 0:
			continue
		case 1:
			return strVal(bucket[0], "id"), nil
		default:
			names := make([]string, len(bucket))
			for i, t := range bucket {
				names[i] = fmt.Sprintf("  %q (%s)", strVal(t, "name"), strVal(t, "identifier"))
			}
			return "", fmt.Errorf("ambiguous team %q; matches:\n%s", input, strings.Join(names, "\n"))
		}
	}
	return "", fmt.Errorf("no team found matching %q", input)
}

// resolveLabels resolves label names to IDs.
func resolveLabels(ctx context.Context, client *cli.APIClient, names []string) ([]string, error) {
	var resp map[string]any
	if err := client.GetJSON(ctx, "/api/labels", &resp); err != nil {
		return nil, fmt.Errorf("fetch labels: %w", err)
	}

	labelsRaw, _ := resp["labels"].([]any)
	labelMap := make(map[string]string) // lowercase name -> id
	for _, raw := range labelsRaw {
		l, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		labelMap[strings.ToLower(strVal(l, "name"))] = strVal(l, "id")
	}

	var ids []string
	for _, name := range names {
		id, ok := labelMap[strings.ToLower(strings.TrimSpace(name))]
		if !ok {
			return nil, fmt.Errorf("label %q not found", name)
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func formatAssignee(issue map[string]any) string {
	aType := strVal(issue, "assignee_type")
	aID := strVal(issue, "assignee_id")
	if aType == "" || aID == "" {
		return ""
	}
	return aType + ":" + truncateID(aID)
}

func truncateID(id string) string {
	if utf8.RuneCountInString(id) > 8 {
		runes := []rune(id)
		return string(runes[:8])
	}
	return id
}
