package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var dashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Get dashboard summary",
	RunE:  runDashboard,
}

var workloadCmd = &cobra.Command{
	Use:   "workload",
	Short: "Get workload data",
	RunE:  runWorkload,
}

var inboxCmd = &cobra.Command{
	Use:   "inbox",
	Short: "Work with inbox",
}

var inboxListCmd = &cobra.Command{
	Use:   "list",
	Short: "List inbox items",
	RunE:  runInboxList,
}

var inboxUnreadCmd = &cobra.Command{
	Use:   "unread",
	Short: "Get unread inbox count",
	RunE:  runInboxUnread,
}

var inboxReadCmd = &cobra.Command{
	Use:   "read <id>",
	Short: "Mark inbox item as read",
	Args:  exactArgs(1),
	RunE:  runInboxRead,
}

var inboxArchiveCmd = &cobra.Command{
	Use:   "archive <id>",
	Short: "Archive inbox item",
	Args:  exactArgs(1),
	RunE:  runInboxArchive,
}

func init() {
	inboxCmd.AddCommand(inboxListCmd)
	inboxCmd.AddCommand(inboxUnreadCmd)
	inboxCmd.AddCommand(inboxReadCmd)
	inboxCmd.AddCommand(inboxArchiveCmd)

	// dashboard
	dashboardCmd.Flags().String("output", "json", "Output format: json")

	// workload
	workloadCmd.Flags().String("output", "json", "Output format: json")

	// inbox list
	inboxListCmd.Flags().String("output", "table", "Output format: table or json")

	// inbox unread
	inboxUnreadCmd.Flags().String("output", "json", "Output format: json")
}

// ---------------------------------------------------------------------------
// Dashboard / Workload commands
// ---------------------------------------------------------------------------

func runDashboard(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/dashboard", &result); err != nil {
		return fmt.Errorf("get dashboard: %w", err)
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runWorkload(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/workload", &result); err != nil {
		return fmt.Errorf("get workload: %w", err)
	}

	return cli.PrintJSON(os.Stdout, result)
}

// ---------------------------------------------------------------------------
// Inbox commands
// ---------------------------------------------------------------------------

func runInboxList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/inbox", &result); err != nil {
		return fmt.Errorf("list inbox: %w", err)
	}

	itemsRaw, _ := result["items"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, itemsRaw)
	}

	headers := []string{"ID", "TYPE", "TITLE", "READ", "CREATED"}
	rows := make([][]string, 0, len(itemsRaw))
	for _, raw := range itemsRaw {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		read := "no"
		if v, ok := item["read"].(bool); ok && v {
			read = "yes"
		}
		created := strVal(item, "created_at")
		if len(created) >= 10 {
			created = created[:10]
		}
		rows = append(rows, []string{
			truncateID(strVal(item, "id")),
			strVal(item, "type"),
			strVal(item, "title"),
			read,
			created,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runInboxUnread(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/inbox/unread-count", &result); err != nil {
		return fmt.Errorf("get unread count: %w", err)
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runInboxRead(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/inbox/"+args[0]+"/read", nil, &result); err != nil {
		return fmt.Errorf("mark as read: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Inbox item %s marked as read.\n", truncateID(args[0]))
	return nil
}

func runInboxArchive(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/inbox/"+args[0]+"/archive", nil, &result); err != nil {
		return fmt.Errorf("archive inbox item: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Inbox item %s archived.\n", truncateID(args[0]))
	return nil
}
