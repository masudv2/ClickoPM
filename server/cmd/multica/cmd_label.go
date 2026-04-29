package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var labelCmd = &cobra.Command{
	Use:   "label",
	Short: "Work with labels",
}

var labelListCmd = &cobra.Command{
	Use:   "list",
	Short: "List labels in the workspace",
	RunE:  runLabelList,
}

var labelCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new label",
	RunE:  runLabelCreate,
}

var labelUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update a label",
	Args:  exactArgs(1),
	RunE:  runLabelUpdate,
}

var labelDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a label",
	Args:  exactArgs(1),
	RunE:  runLabelDelete,
}

func init() {
	labelCmd.AddCommand(labelListCmd)
	labelCmd.AddCommand(labelCreateCmd)
	labelCmd.AddCommand(labelUpdateCmd)
	labelCmd.AddCommand(labelDeleteCmd)

	// label list
	labelListCmd.Flags().String("output", "table", "Output format: table or json")

	// label create
	labelCreateCmd.Flags().String("name", "", "Label name (required)")
	labelCreateCmd.Flags().String("color", "", "Label color")
	labelCreateCmd.Flags().String("output", "json", "Output format: table or json")

	// label update
	labelUpdateCmd.Flags().String("name", "", "New name")
	labelUpdateCmd.Flags().String("color", "", "New color")
	labelUpdateCmd.Flags().String("output", "json", "Output format: table or json")
}

// ---------------------------------------------------------------------------
// Label commands
// ---------------------------------------------------------------------------

func runLabelList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/labels", &result); err != nil {
		return fmt.Errorf("list labels: %w", err)
	}

	labelsRaw, _ := result["labels"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, labelsRaw)
	}

	headers := []string{"ID", "NAME", "COLOR"}
	rows := make([][]string, 0, len(labelsRaw))
	for _, raw := range labelsRaw {
		l, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		rows = append(rows, []string{
			truncateID(strVal(l, "id")),
			strVal(l, "name"),
			strVal(l, "color"),
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runLabelCreate(cmd *cobra.Command, _ []string) error {
	name, _ := cmd.Flags().GetString("name")
	if name == "" {
		return fmt.Errorf("--name is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{"name": name}
	if v, _ := cmd.Flags().GetString("color"); v != "" {
		body["color"] = v
	}

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/labels", body, &result); err != nil {
		return fmt.Errorf("create label: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "NAME", "COLOR"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "name"),
			strVal(result, "color"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runLabelUpdate(cmd *cobra.Command, args []string) error {
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
	if cmd.Flags().Changed("color") {
		v, _ := cmd.Flags().GetString("color")
		body["color"] = v
	}

	if len(body) == 0 {
		return fmt.Errorf("no fields to update; use flags like --name, --color")
	}

	var result map[string]any
	if err := client.PutJSON(ctx, "/api/labels/"+args[0], body, &result); err != nil {
		return fmt.Errorf("update label: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "NAME", "COLOR"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "name"),
			strVal(result, "color"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runLabelDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.DeleteJSON(ctx, "/api/labels/"+args[0]); err != nil {
		return fmt.Errorf("delete label: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Label %s deleted.\n", truncateID(args[0]))
	return nil
}
