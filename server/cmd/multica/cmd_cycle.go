package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var cycleCmd = &cobra.Command{
	Use:   "cycle",
	Short: "Work with cycles",
}

var cycleListCmd = &cobra.Command{
	Use:   "list",
	Short: "List cycles for a team",
	RunE:  runCycleList,
}

var cycleGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "Get cycle details",
	Args:  exactArgs(1),
	RunE:  runCycleGet,
}

var cycleCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new cycle",
	RunE:  runCycleCreate,
}

var cycleUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update a cycle",
	Args:  exactArgs(1),
	RunE:  runCycleUpdate,
}

var cycleDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a cycle",
	Args:  exactArgs(1),
	RunE:  runCycleDelete,
}

var cycleStartCmd = &cobra.Command{
	Use:   "start <id>",
	Short: "Start a cycle",
	Args:  exactArgs(1),
	RunE:  runCycleStart,
}

var cycleCompleteCmd = &cobra.Command{
	Use:   "complete <id>",
	Short: "Complete a cycle",
	Args:  exactArgs(1),
	RunE:  runCycleComplete,
}

func init() {
	cycleCmd.AddCommand(cycleListCmd)
	cycleCmd.AddCommand(cycleGetCmd)
	cycleCmd.AddCommand(cycleCreateCmd)
	cycleCmd.AddCommand(cycleUpdateCmd)
	cycleCmd.AddCommand(cycleDeleteCmd)
	cycleCmd.AddCommand(cycleStartCmd)
	cycleCmd.AddCommand(cycleCompleteCmd)

	// cycle list
	cycleListCmd.Flags().String("team", "", "Team ID (required)")
	cycleListCmd.Flags().String("output", "table", "Output format: table or json")

	// cycle get
	cycleGetCmd.Flags().String("output", "json", "Output format: table or json")

	// cycle create
	cycleCreateCmd.Flags().String("team", "", "Team ID (required)")
	cycleCreateCmd.Flags().String("title", "", "Cycle title (required)")
	cycleCreateCmd.Flags().String("start-date", "", "Start date YYYY-MM-DD (required)")
	cycleCreateCmd.Flags().String("end-date", "", "End date YYYY-MM-DD (required)")
	cycleCreateCmd.Flags().String("output", "json", "Output format: table or json")

	// cycle update
	cycleUpdateCmd.Flags().String("title", "", "New title")
	cycleUpdateCmd.Flags().String("start-date", "", "New start date YYYY-MM-DD")
	cycleUpdateCmd.Flags().String("end-date", "", "New end date YYYY-MM-DD")
	cycleUpdateCmd.Flags().String("output", "json", "Output format: table or json")

	// cycle delete
	cycleDeleteCmd.Flags().String("output", "json", "Output format: table or json")

	// cycle start
	cycleStartCmd.Flags().String("output", "json", "Output format: table or json")

	// cycle complete
	cycleCompleteCmd.Flags().String("output", "json", "Output format: table or json")
}

// ---------------------------------------------------------------------------
// Cycle commands
// ---------------------------------------------------------------------------

func runCycleList(cmd *cobra.Command, _ []string) error {
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

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/teams/"+teamID+"/cycles", &result); err != nil {
		return fmt.Errorf("list cycles: %w", err)
	}

	cyclesRaw, _ := result["cycles"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, cyclesRaw)
	}

	headers := []string{"ID", "TITLE", "STATUS", "START", "END", "ISSUES"}
	rows := make([][]string, 0, len(cyclesRaw))
	for _, raw := range cyclesRaw {
		c, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		startDate := strVal(c, "start_date")
		if len(startDate) >= 10 {
			startDate = startDate[:10]
		}
		endDate := strVal(c, "end_date")
		if len(endDate) >= 10 {
			endDate = endDate[:10]
		}
		issues := strVal(c, "total_issues")
		rows = append(rows, []string{
			truncateID(strVal(c, "id")),
			strVal(c, "title"),
			strVal(c, "status"),
			startDate,
			endDate,
			issues,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runCycleGet(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var cycle map[string]any
	if err := client.GetJSON(ctx, "/api/cycles/"+args[0], &cycle); err != nil {
		return fmt.Errorf("get cycle: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		startDate := strVal(cycle, "start_date")
		if len(startDate) >= 10 {
			startDate = startDate[:10]
		}
		endDate := strVal(cycle, "end_date")
		if len(endDate) >= 10 {
			endDate = endDate[:10]
		}
		headers := []string{"ID", "TITLE", "STATUS", "START", "END", "TOTAL_ISSUES", "DONE_ISSUES"}
		rows := [][]string{{
			truncateID(strVal(cycle, "id")),
			strVal(cycle, "title"),
			strVal(cycle, "status"),
			startDate,
			endDate,
			strVal(cycle, "total_issues"),
			strVal(cycle, "done_issues"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, cycle)
}

func runCycleCreate(cmd *cobra.Command, _ []string) error {
	teamID, _ := cmd.Flags().GetString("team")
	if teamID == "" {
		return fmt.Errorf("--team is required")
	}
	title, _ := cmd.Flags().GetString("title")
	if title == "" {
		return fmt.Errorf("--title is required")
	}
	startDate, _ := cmd.Flags().GetString("start-date")
	if startDate == "" {
		return fmt.Errorf("--start-date is required")
	}
	endDate, _ := cmd.Flags().GetString("end-date")
	if endDate == "" {
		return fmt.Errorf("--end-date is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{
		"title":      title,
		"start_date": startDate,
		"end_date":   endDate,
	}

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/teams/"+teamID+"/cycles", body, &result); err != nil {
		return fmt.Errorf("create cycle: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "TITLE", "STATUS"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "title"),
			strVal(result, "status"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runCycleUpdate(cmd *cobra.Command, args []string) error {
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
	if cmd.Flags().Changed("start-date") {
		v, _ := cmd.Flags().GetString("start-date")
		body["start_date"] = v
	}
	if cmd.Flags().Changed("end-date") {
		v, _ := cmd.Flags().GetString("end-date")
		body["end_date"] = v
	}

	if len(body) == 0 {
		return fmt.Errorf("no fields to update; use flags like --title, --start-date, --end-date")
	}

	var result map[string]any
	if err := client.PutJSON(ctx, "/api/cycles/"+args[0], body, &result); err != nil {
		return fmt.Errorf("update cycle: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "TITLE", "STATUS"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "title"),
			strVal(result, "status"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runCycleDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.DeleteJSON(ctx, "/api/cycles/"+args[0]); err != nil {
		return fmt.Errorf("delete cycle: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Cycle %s deleted.\n", truncateID(args[0]))
	return nil
}

func runCycleStart(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/cycles/"+args[0]+"/start", nil, &result); err != nil {
		return fmt.Errorf("start cycle: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Cycle %s started.\n", truncateID(args[0]))

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, result)
	}
	return nil
}

func runCycleComplete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/cycles/"+args[0]+"/complete", nil, &result); err != nil {
		return fmt.Errorf("complete cycle: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Cycle %s completed.\n", truncateID(args[0]))

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, result)
	}
	return nil
}
