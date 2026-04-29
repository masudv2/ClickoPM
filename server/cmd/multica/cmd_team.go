package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var teamCmd = &cobra.Command{
	Use:   "team",
	Short: "Work with teams",
}

var teamListCmd = &cobra.Command{
	Use:   "list",
	Short: "List teams in the workspace",
	RunE:  runTeamList,
}

var teamGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "Get team details",
	Args:  exactArgs(1),
	RunE:  runTeamGet,
}

var teamCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new team",
	RunE:  runTeamCreate,
}

var teamUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update a team",
	Args:  exactArgs(1),
	RunE:  runTeamUpdate,
}

var teamDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a team",
	Args:  exactArgs(1),
	RunE:  runTeamDelete,
}

var teamMembersCmd = &cobra.Command{
	Use:   "members <id>",
	Short: "List team members",
	Args:  exactArgs(1),
	RunE:  runTeamMembers,
}

func init() {
	teamCmd.AddCommand(teamListCmd)
	teamCmd.AddCommand(teamGetCmd)
	teamCmd.AddCommand(teamCreateCmd)
	teamCmd.AddCommand(teamUpdateCmd)
	teamCmd.AddCommand(teamDeleteCmd)
	teamCmd.AddCommand(teamMembersCmd)

	// team list
	teamListCmd.Flags().String("output", "table", "Output format: table or json")

	// team get
	teamGetCmd.Flags().String("output", "json", "Output format: table or json")

	// team create
	teamCreateCmd.Flags().String("name", "", "Team name (required)")
	teamCreateCmd.Flags().String("identifier", "", "Team identifier (required)")
	teamCreateCmd.Flags().String("color", "", "Team color")
	teamCreateCmd.Flags().String("icon", "", "Team icon")
	teamCreateCmd.Flags().String("output", "json", "Output format: table or json")

	// team update
	teamUpdateCmd.Flags().String("name", "", "New name")
	teamUpdateCmd.Flags().String("identifier", "", "New identifier")
	teamUpdateCmd.Flags().String("color", "", "New color")
	teamUpdateCmd.Flags().String("icon", "", "New icon")
	teamUpdateCmd.Flags().String("output", "json", "Output format: table or json")

	// team members
	teamMembersCmd.Flags().String("output", "table", "Output format: table or json")
}

// ---------------------------------------------------------------------------
// Team commands
// ---------------------------------------------------------------------------

func runTeamList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/teams", &result); err != nil {
		return fmt.Errorf("list teams: %w", err)
	}

	teamsRaw, _ := result["teams"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, teamsRaw)
	}

	headers := []string{"ID", "NAME", "IDENTIFIER", "COLOR", "MEMBERS"}
	rows := make([][]string, 0, len(teamsRaw))
	for _, raw := range teamsRaw {
		t, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		members := ""
		if v, ok := t["member_count"]; ok {
			members = fmt.Sprintf("%v", v)
		}
		rows = append(rows, []string{
			truncateID(strVal(t, "id")),
			strVal(t, "name"),
			strVal(t, "identifier"),
			strVal(t, "color"),
			members,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runTeamGet(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var team map[string]any
	if err := client.GetJSON(ctx, "/api/teams/"+args[0], &team); err != nil {
		return fmt.Errorf("get team: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "NAME", "IDENTIFIER", "COLOR"}
		rows := [][]string{{
			truncateID(strVal(team, "id")),
			strVal(team, "name"),
			strVal(team, "identifier"),
			strVal(team, "color"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, team)
}

func runTeamCreate(cmd *cobra.Command, _ []string) error {
	name, _ := cmd.Flags().GetString("name")
	if name == "" {
		return fmt.Errorf("--name is required")
	}
	identifier, _ := cmd.Flags().GetString("identifier")
	if identifier == "" {
		return fmt.Errorf("--identifier is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	body := map[string]any{
		"name":       name,
		"identifier": identifier,
	}
	if v, _ := cmd.Flags().GetString("color"); v != "" {
		body["color"] = v
	}
	if v, _ := cmd.Flags().GetString("icon"); v != "" {
		body["icon"] = v
	}

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/teams", body, &result); err != nil {
		return fmt.Errorf("create team: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "NAME", "IDENTIFIER", "COLOR"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "name"),
			strVal(result, "identifier"),
			strVal(result, "color"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runTeamUpdate(cmd *cobra.Command, args []string) error {
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
	if cmd.Flags().Changed("identifier") {
		v, _ := cmd.Flags().GetString("identifier")
		body["identifier"] = v
	}
	if cmd.Flags().Changed("color") {
		v, _ := cmd.Flags().GetString("color")
		body["color"] = v
	}
	if cmd.Flags().Changed("icon") {
		v, _ := cmd.Flags().GetString("icon")
		body["icon"] = v
	}

	if len(body) == 0 {
		return fmt.Errorf("no fields to update; use flags like --name, --identifier, --color, --icon")
	}

	var result map[string]any
	if err := client.PutJSON(ctx, "/api/teams/"+args[0], body, &result); err != nil {
		return fmt.Errorf("update team: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "NAME", "IDENTIFIER", "COLOR"}
		rows := [][]string{{
			truncateID(strVal(result, "id")),
			strVal(result, "name"),
			strVal(result, "identifier"),
			strVal(result, "color"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}

	return cli.PrintJSON(os.Stdout, result)
}

func runTeamDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.DeleteJSON(ctx, "/api/teams/"+args[0]); err != nil {
		return fmt.Errorf("delete team: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Team %s deleted.\n", truncateID(args[0]))
	return nil
}

func runTeamMembers(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.GetJSON(ctx, "/api/teams/"+args[0]+"/members", &result); err != nil {
		return fmt.Errorf("list team members: %w", err)
	}

	membersRaw, _ := result["members"].([]any)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, membersRaw)
	}

	headers := []string{"ID", "NAME", "EMAIL", "ROLE"}
	rows := make([][]string, 0, len(membersRaw))
	for _, raw := range membersRaw {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		rows = append(rows, []string{
			truncateID(strVal(m, "id")),
			strVal(m, "name"),
			strVal(m, "email"),
			strVal(m, "role"),
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}
