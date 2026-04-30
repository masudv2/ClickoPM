package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var milestoneCmd = &cobra.Command{
	Use:   "milestone",
	Short: "Work with project milestones",
}

var milestoneListCmd = &cobra.Command{
	Use:   "list",
	Short: "List milestones for a project",
	RunE:  runMilestoneList,
}

var milestoneGetCmd = &cobra.Command{
	Use:   "get <milestone-id>",
	Short: "Get a single milestone",
	Args:  exactArgs(1),
	RunE:  runMilestoneGet,
}

var milestoneCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a milestone",
	RunE:  runMilestoneCreate,
}

var milestoneUpdateCmd = &cobra.Command{
	Use:   "update <milestone-id>",
	Short: "Update a milestone",
	Args:  exactArgs(1),
	RunE:  runMilestoneUpdate,
}

var milestoneDeleteCmd = &cobra.Command{
	Use:   "delete <milestone-id>",
	Short: "Delete a milestone (issues belonging to it become unassigned)",
	Args:  exactArgs(1),
	RunE:  runMilestoneDelete,
}

func init() {
	milestoneCmd.AddCommand(milestoneListCmd)
	milestoneCmd.AddCommand(milestoneGetCmd)
	milestoneCmd.AddCommand(milestoneCreateCmd)
	milestoneCmd.AddCommand(milestoneUpdateCmd)
	milestoneCmd.AddCommand(milestoneDeleteCmd)

	milestoneListCmd.Flags().String("project", "", "Project ID (required)")
	milestoneListCmd.Flags().String("output", "table", "Output format: table or json")

	milestoneGetCmd.Flags().String("output", "json", "Output format: json")

	milestoneCreateCmd.Flags().String("project", "", "Project ID (required)")
	milestoneCreateCmd.Flags().String("name", "", "Milestone name (required)")
	milestoneCreateCmd.Flags().String("description", "", "Milestone description")
	milestoneCreateCmd.Flags().String("start-date", "", "Start date (YYYY-MM-DD)")
	milestoneCreateCmd.Flags().String("target-date", "", "Target date (YYYY-MM-DD)")
	milestoneCreateCmd.Flags().String("output", "json", "Output format: json")

	milestoneUpdateCmd.Flags().String("name", "", "New name")
	milestoneUpdateCmd.Flags().String("description", "", "New description (use --description \"\" to clear)")
	milestoneUpdateCmd.Flags().String("start-date", "", "Start date (YYYY-MM-DD; \"\" to clear)")
	milestoneUpdateCmd.Flags().String("target-date", "", "Target date (YYYY-MM-DD; \"\" to clear)")
	milestoneUpdateCmd.Flags().String("output", "json", "Output format: json")
}

type milestoneRow struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	StartDate     string `json:"start_date"`
	TargetDate    string `json:"target_date"`
	TotalCount    int64  `json:"total_count"`
	DoneCount     int64  `json:"done_count"`
	Percent       int    `json:"percent"`
	DerivedStatus string `json:"derived_status"`
}

func runMilestoneList(cmd *cobra.Command, _ []string) error {
	projectID, _ := cmd.Flags().GetString("project")
	if projectID == "" {
		return fmt.Errorf("--project is required")
	}
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var resp struct {
		Milestones []map[string]any `json:"milestones"`
	}
	if err := client.GetJSON(ctx, "/api/projects/"+projectID+"/milestones", &resp); err != nil {
		return fmt.Errorf("list milestones: %w", err)
	}
	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, resp.Milestones)
	}
	headers := []string{"ID", "NAME", "STATUS", "PROGRESS", "TARGET"}
	rows := make([][]string, len(resp.Milestones))
	for i, m := range resp.Milestones {
		total, _ := m["total_count"].(float64)
		pct, _ := m["percent"].(float64)
		target, _ := m["target_date"].(string)
		rows[i] = []string{
			strVal(m, "id"),
			strVal(m, "name"),
			strVal(m, "derived_status"),
			fmt.Sprintf("%d%% of %d", int(pct), int(total)),
			target,
		}
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runMilestoneGet(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var m map[string]any
	if err := client.GetJSON(ctx, "/api/milestones/"+args[0], &m); err != nil {
		return fmt.Errorf("get milestone: %w", err)
	}
	return cli.PrintJSON(os.Stdout, m)
}

func runMilestoneCreate(cmd *cobra.Command, _ []string) error {
	projectID, _ := cmd.Flags().GetString("project")
	name, _ := cmd.Flags().GetString("name")
	if projectID == "" || name == "" {
		return fmt.Errorf("--project and --name are required")
	}
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	body := map[string]any{"name": name}
	if v, _ := cmd.Flags().GetString("description"); v != "" {
		body["description"] = v
	}
	if v, _ := cmd.Flags().GetString("start-date"); v != "" {
		body["start_date"] = v
	}
	if v, _ := cmd.Flags().GetString("target-date"); v != "" {
		body["target_date"] = v
	}
	var created map[string]any
	if err := client.PostJSON(ctx, "/api/projects/"+projectID+"/milestones", body, &created); err != nil {
		return fmt.Errorf("create milestone: %w", err)
	}
	return cli.PrintJSON(os.Stdout, created)
}

func runMilestoneUpdate(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	body := map[string]any{}
	if cmd.Flags().Changed("name") {
		v, _ := cmd.Flags().GetString("name")
		body["name"] = v
	}
	if cmd.Flags().Changed("description") {
		v, _ := cmd.Flags().GetString("description")
		if v == "" {
			body["description"] = nil
		} else {
			body["description"] = v
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
	if cmd.Flags().Changed("target-date") {
		v, _ := cmd.Flags().GetString("target-date")
		if v == "" {
			body["target_date"] = nil
		} else {
			body["target_date"] = v
		}
	}
	if len(body) == 0 {
		return fmt.Errorf("no fields to update; use --name, --description, --start-date, --target-date")
	}
	var updated map[string]any
	if err := client.PutJSON(ctx, "/api/milestones/"+args[0], body, &updated); err != nil {
		return fmt.Errorf("update milestone: %w", err)
	}
	return cli.PrintJSON(os.Stdout, updated)
}

func runMilestoneDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := client.DeleteJSON(ctx, "/api/milestones/"+args[0]); err != nil {
		return fmt.Errorf("delete milestone: %w", err)
	}
	fmt.Fprintf(os.Stderr, "Deleted milestone %s\n", args[0])
	return nil
}

// silence unused import in case milestoneRow is unused later
var _ = milestoneRow{}
