package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
)

var migrateCmd = &cobra.Command{
	Use:   "migrate",
	Short: "One-shot data migrations",
}

var migratePhasesCmd = &cobra.Command{
	Use:   "phases-to-milestones",
	Short: "Convert epic+phase issues to milestones for one project",
	Long: `Reads the project's epic-issue and its child phase-issues and converts:
  - each phase-issue → a milestone (name = phase title, description = phase body)
  - each task under a phase → its milestone_id set to the new milestone, parent cleared
  - the phase-issues and the epic-issue are deleted

Default is --dry-run. Pass --apply to commit changes.`,
	RunE: runMigratePhases,
}

func init() {
	migrateCmd.AddCommand(migratePhasesCmd)
	migratePhasesCmd.Flags().String("project-id", "", "UUID of the project to migrate (required)")
	migratePhasesCmd.Flags().String("epic-id", "", "UUID of the top-level epic issue (required)")
	migratePhasesCmd.Flags().Bool("apply", false, "Apply the changes (default is dry-run)")
}

type phasePlan struct {
	PhaseID       string   `json:"phase_id"`
	PhaseTitle    string   `json:"phase_title"`
	MilestoneName string   `json:"milestone_name"`
	TaskIDs       []string `json:"task_ids"`
	ExistingMID   string   `json:"existing_milestone_id,omitempty"`
}

type migrationPlan struct {
	ProjectID string      `json:"project_id"`
	EpicID    string      `json:"epic_id"`
	Phases    []phasePlan `json:"phases"`
}

func runMigratePhases(cmd *cobra.Command, _ []string) error {
	projectID, _ := cmd.Flags().GetString("project-id")
	epicID, _ := cmd.Flags().GetString("epic-id")
	apply, _ := cmd.Flags().GetBool("apply")
	if projectID == "" || epicID == "" {
		return fmt.Errorf("--project-id and --epic-id are required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// 1. List existing milestones for idempotency.
	var msResp struct {
		Milestones []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"milestones"`
	}
	if err := client.GetJSON(ctx, "/api/projects/"+projectID+"/milestones", &msResp); err != nil {
		return fmt.Errorf("list milestones: %w", err)
	}
	existing := map[string]string{}
	for _, m := range msResp.Milestones {
		existing[m.Name] = m.ID
	}

	// 2. Get epic's children (phases).
	var phasesResp struct {
		Issues []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"issues"`
	}
	if err := client.GetJSON(ctx, "/api/issues/"+epicID+"/children", &phasesResp); err != nil {
		return fmt.Errorf("list epic children: %w", err)
	}

	plan := migrationPlan{ProjectID: projectID, EpicID: epicID}
	for _, phase := range phasesResp.Issues {
		// 3. Get phase's children (tasks).
		var tasksResp struct {
			Issues []struct {
				ID string `json:"id"`
			} `json:"issues"`
		}
		if err := client.GetJSON(ctx, "/api/issues/"+phase.ID+"/children", &tasksResp); err != nil {
			return fmt.Errorf("list phase children for %s: %w", phase.ID, err)
		}
		taskIDs := make([]string, len(tasksResp.Issues))
		for i, t := range tasksResp.Issues {
			taskIDs[i] = t.ID
		}
		pp := phasePlan{
			PhaseID:       phase.ID,
			PhaseTitle:    phase.Title,
			MilestoneName: phase.Title,
			TaskIDs:       taskIDs,
		}
		if id, ok := existing[phase.Title]; ok {
			pp.ExistingMID = id
		}
		plan.Phases = append(plan.Phases, pp)
	}

	out, _ := json.MarshalIndent(plan, "", "  ")
	fmt.Println(string(out))

	if !apply {
		fmt.Fprintln(os.Stderr, "\n[dry-run] Pass --apply to commit changes.")
		return nil
	}

	// 4. Apply.
	for _, p := range plan.Phases {
		mID := p.ExistingMID
		if mID == "" {
			body := map[string]any{"name": p.MilestoneName}
			var created struct {
				ID string `json:"id"`
			}
			if err := client.PostJSON(ctx, "/api/projects/"+projectID+"/milestones", body, &created); err != nil {
				return fmt.Errorf("create milestone %q: %w", p.MilestoneName, err)
			}
			mID = created.ID
			fmt.Fprintf(os.Stderr, "Created milestone %s (%s)\n", p.MilestoneName, mID)
		} else {
			fmt.Fprintf(os.Stderr, "Reusing existing milestone %s (%s)\n", p.MilestoneName, mID)
		}
		// Re-point each task: set milestone_id, clear parent_issue_id.
		if len(p.TaskIDs) > 0 {
			body := map[string]any{
				"issue_ids": p.TaskIDs,
				"updates":   map[string]any{"milestone_id": mID, "parent_issue_id": nil},
			}
			if err := client.PostJSON(ctx, "/api/issues/batch-update", body, nil); err != nil {
				return fmt.Errorf("batch-update tasks for %s: %w", p.MilestoneName, err)
			}
			fmt.Fprintf(os.Stderr, "Re-pointed %d tasks\n", len(p.TaskIDs))
		}
		// Delete the phase issue.
		if err := client.DeleteJSON(ctx, "/api/issues/"+p.PhaseID); err != nil {
			fmt.Fprintf(os.Stderr, "WARN: failed to delete phase %s: %v\n", p.PhaseID, err)
		}
	}
	// Delete the epic.
	if err := client.DeleteJSON(ctx, "/api/issues/"+epicID); err != nil {
		fmt.Fprintf(os.Stderr, "WARN: failed to delete epic %s: %v\n", epicID, err)
	}
	fmt.Fprintln(os.Stderr, "Migration complete.")
	return nil
}
