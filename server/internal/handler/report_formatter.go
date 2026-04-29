package handler

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/multica-ai/multica/server/internal/service"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

func headerBlock(text string) service.SlackBlock {
	return service.SlackBlock{
		"type": "header",
		"text": service.SlackBlock{"type": "plain_text", "text": text},
	}
}

func contextBlock(elements ...string) service.SlackBlock {
	els := make([]service.SlackBlock, len(elements))
	for i, e := range elements {
		els[i] = service.SlackBlock{"type": "mrkdwn", "text": e}
	}
	return service.SlackBlock{"type": "context", "elements": els}
}

func sectionBlock(text string) service.SlackBlock {
	return service.SlackBlock{
		"type": "section",
		"text": service.SlackBlock{"type": "mrkdwn", "text": text},
	}
}

func dividerBlock() service.SlackBlock {
	return service.SlackBlock{"type": "divider"}
}

func assigneeName(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return "Unassigned"
}

func groupByMember(members []string, issues []struct{ name, title string }) map[string][]string {
	grouped := map[string][]string{}
	for _, m := range members {
		grouped[m] = nil
	}
	for _, i := range issues {
		grouped[i.name] = append(grouped[i.name], i.title)
	}
	return grouped
}

// MorningReportData holds data for the morning standup report.
type MorningReportData struct {
	TeamName   string
	Members    []string
	CycleName  string
	CycleScope int
	CycleDone  int
	Blockers   []db.GetTeamBlockersRow
	InProgress []db.GetTeamInProgressIssuesRow
	TodoIssues []db.GetTeamTodoIssuesRow
}

// FormatMorningReport builds Slack blocks for the morning standup.
func FormatMorningReport(d MorningReportData, now time.Time) []service.SlackBlock {
	dayName := now.Format("Monday")
	date := now.Format("January 2")
	pct := 0
	if d.CycleScope > 0 {
		pct = d.CycleDone * 100 / d.CycleScope
	}

	blocks := []service.SlackBlock{
		headerBlock(fmt.Sprintf("Morning Standup — %s", d.TeamName)),
	}

	cycleCtx := fmt.Sprintf("%s, %s", dayName, date)
	if d.CycleName != "" {
		cycleCtx += fmt.Sprintf(" · %s · %d/%d done (%d%%)", d.CycleName, d.CycleDone, d.CycleScope, pct)
	}
	blocks = append(blocks, contextBlock(cycleCtx))
	blocks = append(blocks, dividerBlock())

	if len(d.Blockers) > 0 {
		lines := []string{fmt.Sprintf("*:red_circle: Blockers (%d)*", len(d.Blockers))}
		for _, b := range d.Blockers {
			line := fmt.Sprintf("• %s — %s", b.IssueTitle, assigneeName(b.AssigneeName))
			if b.DaysBlocked > 0 {
				line += fmt.Sprintf(" (%d days)", b.DaysBlocked)
			}
			lines = append(lines, line)
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	{
		var items []struct{ name, title string }
		for _, ip := range d.InProgress {
			items = append(items, struct{ name, title string }{assigneeName(ip.AssigneeName), ip.IssueTitle})
		}
		grouped := groupByMember(d.Members, items)

		lines := []string{fmt.Sprintf("*:wrench: In Progress (%d)*", len(d.InProgress))}
		for _, name := range d.Members {
			issues := grouped[name]
			if len(issues) > 0 {
				lines = append(lines, fmt.Sprintf("  *%s* (%d)", name, len(issues)))
				for _, title := range issues {
					lines = append(lines, fmt.Sprintf("    • %s", title))
				}
			} else {
				lines = append(lines, fmt.Sprintf("  *%s* — _no tasks in progress_", name))
			}
		}
		if unassigned := grouped["Unassigned"]; len(unassigned) > 0 {
			lines = append(lines, fmt.Sprintf("  *Unassigned* (%d)", len(unassigned)))
			for _, title := range unassigned {
				lines = append(lines, fmt.Sprintf("    • %s", title))
			}
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	{
		var items []struct{ name, title string }
		for _, td := range d.TodoIssues {
			items = append(items, struct{ name, title string }{assigneeName(td.AssigneeName), td.IssueTitle})
		}
		grouped := groupByMember(d.Members, items)

		lines := []string{fmt.Sprintf("*:clipboard: To Do (%d)*", len(d.TodoIssues))}
		for _, name := range d.Members {
			issues := grouped[name]
			if len(issues) > 0 {
				lines = append(lines, fmt.Sprintf("  *%s* (%d)", name, len(issues)))
				for _, title := range issues {
					lines = append(lines, fmt.Sprintf("    • %s", title))
				}
			} else {
				lines = append(lines, fmt.Sprintf("  *%s* — _no todo items_", name))
			}
		}
		if unassigned := grouped["Unassigned"]; len(unassigned) > 0 {
			lines = append(lines, fmt.Sprintf("  *Unassigned* (%d)", len(unassigned)))
			for _, title := range unassigned {
				lines = append(lines, fmt.Sprintf("    • %s", title))
			}
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	return blocks
}

// EveningReportData holds data for the evening recap report.
type EveningReportData struct {
	TeamName      string
	Members       []string
	Completed     []db.GetTeamCompletedTodayRow
	StatusChanges []db.GetTeamDailySummaryRow
	NewIssues     []db.GetTeamNewIssuesCreatedTodayRow
	CycleName     string
	CyclePctStart int
	CyclePctEnd   int
	CycleDelta    int
}

// FormatEveningReport builds Slack blocks for the evening recap.
func FormatEveningReport(d EveningReportData, now time.Time) []service.SlackBlock {
	dayName := now.Format("Monday")
	date := now.Format("January 2")

	blocks := []service.SlackBlock{
		headerBlock(fmt.Sprintf("End of Day — %s", d.TeamName)),
		contextBlock(fmt.Sprintf("%s, %s", dayName, date)),
		dividerBlock(),
	}

	{
		completedByMember := map[string][]string{}
		for _, m := range d.Members {
			completedByMember[m] = nil
		}
		for _, c := range d.Completed {
			name := assigneeName(c.AssigneeName)
			completedByMember[name] = append(completedByMember[name], c.IssueTitle)
		}

		lines := []string{fmt.Sprintf("*:white_check_mark: Completed Today (%d)*", len(d.Completed))}
		for _, name := range d.Members {
			issues := completedByMember[name]
			if len(issues) > 0 {
				lines = append(lines, fmt.Sprintf("  *%s* (%d)", name, len(issues)))
				for _, title := range issues {
					lines = append(lines, fmt.Sprintf("    • %s", title))
				}
			} else {
				lines = append(lines, fmt.Sprintf("  *%s* — _no completions_", name))
			}
		}
		if unassigned := completedByMember["Unassigned"]; len(unassigned) > 0 {
			lines = append(lines, fmt.Sprintf("  *Unassigned* (%d)", len(unassigned)))
			for _, title := range unassigned {
				lines = append(lines, fmt.Sprintf("    • %s", title))
			}
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	var statusOnly []db.GetTeamDailySummaryRow
	for _, s := range d.StatusChanges {
		if s.Action == "status_changed" {
			details := parseReportDetails(s.Details)
			to := details["to"]
			if to != "done" && to != "cancelled" {
				statusOnly = append(statusOnly, s)
			}
		}
	}
	if len(statusOnly) > 0 {
		lines := []string{fmt.Sprintf("*:arrows_counterclockwise: Status Changes (%d)*", len(statusOnly))}
		for _, s := range statusOnly {
			details := parseReportDetails(s.Details)
			lines = append(lines, fmt.Sprintf("• %s → %s — %s", s.IssueTitle, formatStatusName(details["to"]), assigneeName(s.AssigneeName)))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	if len(d.NewIssues) > 0 {
		lines := []string{fmt.Sprintf("*:new: New Issues (%d)*", len(d.NewIssues))}
		for _, n := range d.NewIssues {
			lines = append(lines, fmt.Sprintf("• %s — %s", n.IssueTitle, assigneeName(n.AssigneeName)))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	if d.CycleName != "" {
		blocks = append(blocks, dividerBlock())
		emoji := ":chart_with_upwards_trend:"
		if d.CycleDelta == 0 {
			emoji = ":heavy_minus_sign:"
		}
		blocks = append(blocks, sectionBlock(fmt.Sprintf("*%s Cycle Progress*\n%s: %d%% → %d%% (+%d done today)", emoji, d.CycleName, d.CyclePctStart, d.CyclePctEnd, d.CycleDelta)))
	}

	return blocks
}

// WeeklyReportData holds data for the weekly report.
type WeeklyReportData struct {
	TeamName       string
	Members        []string
	DateRange      string
	CompletedItems []db.GetTeamWeeklyCompletedWithTitlesRow
	InProgress     []db.GetTeamInProgressIssuesRow
	TodoIssues     []db.GetTeamTodoIssuesRow
	CycleName      string
	CycleRemaining int
	CycleEndsAt    string
	CycleCapacity  int
	CycleTotalPts  int
	CycleDonePts   int
	Velocity       float64
	Blockers       []db.GetTeamBlockersRow
}

// FormatWeeklyReport builds Slack blocks for the weekly report.
func FormatWeeklyReport(d WeeklyReportData) []service.SlackBlock {
	blocks := []service.SlackBlock{
		headerBlock(fmt.Sprintf("Weekly Report — %s", d.TeamName)),
		contextBlock(d.DateRange),
		dividerBlock(),
	}

	// Points & velocity summary
	totalCompleted := len(d.CompletedItems)
	totalPoints := 0
	for _, c := range d.CompletedItems {
		totalPoints += int(c.Points)
	}
	{
		lines := []string{"*:chart_with_upwards_trend: Performance*"}
		lines = append(lines, fmt.Sprintf("  *%d issues* completed · *%d points* delivered", totalCompleted, totalPoints))
		if d.Velocity > 0 {
			lines = append(lines, fmt.Sprintf("  Avg velocity: %.0f pts/cycle", d.Velocity))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// Per-member detail: completed tasks with names, in-progress, todo counts
	{
		completedByMember := map[string][]db.GetTeamWeeklyCompletedWithTitlesRow{}
		memberPoints := map[string]int{}
		for _, m := range d.Members {
			completedByMember[m] = nil
		}
		for _, c := range d.CompletedItems {
			name := assigneeName(c.AssigneeName)
			completedByMember[name] = append(completedByMember[name], c)
			memberPoints[name] += int(c.Points)
		}
		ipMap := map[string]int{}
		for _, ip := range d.InProgress {
			ipMap[assigneeName(ip.AssigneeName)]++
		}
		tdMap := map[string]int{}
		for _, td := range d.TodoIssues {
			tdMap[assigneeName(td.AssigneeName)]++
		}

		lines := []string{"*:busts_in_silhouette: Team Breakdown*"}
		for _, name := range d.Members {
			items := completedByMember[name]
			pts := memberPoints[name]
			ip := ipMap[name]
			td := tdMap[name]
			lines = append(lines, fmt.Sprintf("  *%s* — %d done (%d pts) · %d in progress · %d todo", name, len(items), pts, ip, td))
			for _, item := range items {
				ptStr := ""
				if item.Points > 0 {
					ptStr = fmt.Sprintf(" (%dp)", item.Points)
				}
				lines = append(lines, fmt.Sprintf("    :white_check_mark: %s%s", item.IssueTitle, ptStr))
			}
			if len(items) == 0 {
				lines = append(lines, "    _no completions this week_")
			}
		}
		if unassigned := completedByMember["Unassigned"]; len(unassigned) > 0 {
			pts := memberPoints["Unassigned"]
			lines = append(lines, fmt.Sprintf("  *Unassigned* — %d done (%d pts)", len(unassigned), pts))
			for _, item := range unassigned {
				ptStr := ""
				if item.Points > 0 {
					ptStr = fmt.Sprintf(" (%dp)", item.Points)
				}
				lines = append(lines, fmt.Sprintf("    :white_check_mark: %s%s", item.IssueTitle, ptStr))
			}
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// Cycle health
	if d.CycleName != "" {
		blocks = append(blocks, dividerBlock())
		statusEmoji := ":white_check_mark:"
		statusText := "On track"
		if d.CycleCapacity > 120 {
			statusEmoji = ":warning:"
			statusText = "Over capacity — consider descoping"
		} else if d.CycleCapacity > 100 {
			statusEmoji = ":large_yellow_circle:"
			statusText = "Near capacity"
		}
		lines := []string{
			"*:bar_chart: Cycle Health*",
			fmt.Sprintf("*%s*", d.CycleName),
			fmt.Sprintf("%d remaining · ends %s · %d%% capacity", d.CycleRemaining, d.CycleEndsAt, d.CycleCapacity),
			fmt.Sprintf("%d/%d pts completed", d.CycleDonePts, d.CycleTotalPts),
			fmt.Sprintf("%s %s", statusEmoji, statusText),
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// Blockers
	if len(d.Blockers) > 0 {
		blocks = append(blocks, dividerBlock())
		lines := []string{fmt.Sprintf("*:red_circle: Blockers (%d)*", len(d.Blockers))}
		for _, b := range d.Blockers {
			line := fmt.Sprintf("• %s — %s", b.IssueTitle, assigneeName(b.AssigneeName))
			if b.DaysBlocked > 0 {
				line += fmt.Sprintf(" (%d days old)", b.DaysBlocked)
			}
			lines = append(lines, line)
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	return blocks
}

// SprintPlanningData holds data for the sprint planning report.
type SprintPlanningData struct {
	TeamName       string
	Members        []string
	CycleName      string
	CycleEndsAt    string
	CycleTotalCnt  int
	CycleDoneCnt   int
	CycleTotalPts  int
	CycleDonePts   int
	CycleCapacity  int
	Velocity       float64
	InProgress     []db.GetTeamInProgressIssuesRow
	TodoIssues     []db.GetTeamTodoIssuesRow
	BacklogIssues  []db.GetTeamBacklogIssuesRow
	Blockers       []db.GetTeamBlockersRow
}

// FormatSprintPlanningReport builds Slack blocks for the sprint planning report.
func FormatSprintPlanningReport(d SprintPlanningData) []service.SlackBlock {
	blocks := []service.SlackBlock{
		headerBlock(fmt.Sprintf("Sprint Planning — %s", d.TeamName)),
	}

	if d.CycleName != "" {
		pct := 0
		if d.CycleTotalCnt > 0 {
			pct = d.CycleDoneCnt * 100 / d.CycleTotalCnt
		}
		blocks = append(blocks, contextBlock(fmt.Sprintf("%s · %d%% complete · ends %s", d.CycleName, pct, d.CycleEndsAt)))
	}
	blocks = append(blocks, dividerBlock())

	// Cycle snapshot
	if d.CycleName != "" {
		lines := []string{"*:bar_chart: Cycle Status*"}
		lines = append(lines, fmt.Sprintf("  Issues: %d/%d done · Points: %d/%d done", d.CycleDoneCnt, d.CycleTotalCnt, d.CycleDonePts, d.CycleTotalPts))
		if d.Velocity > 0 {
			lines = append(lines, fmt.Sprintf("  Velocity: %.0f pts/cycle · Capacity: %d%%", d.Velocity, d.CycleCapacity))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// Per-member workload: in-progress + todo with task names
	{
		var ipItems []struct{ name, title string }
		for _, ip := range d.InProgress {
			ipItems = append(ipItems, struct{ name, title string }{assigneeName(ip.AssigneeName), ip.IssueTitle})
		}
		ipGrouped := groupByMember(d.Members, ipItems)

		var tdItems []struct{ name, title string }
		for _, td := range d.TodoIssues {
			tdItems = append(tdItems, struct{ name, title string }{assigneeName(td.AssigneeName), td.IssueTitle})
		}
		tdGrouped := groupByMember(d.Members, tdItems)

		lines := []string{fmt.Sprintf("*:busts_in_silhouette: Workload (%d in progress · %d todo)*", len(d.InProgress), len(d.TodoIssues))}
		for _, name := range d.Members {
			ip := ipGrouped[name]
			td := tdGrouped[name]
			lines = append(lines, fmt.Sprintf("  *%s* (%d in progress · %d todo)", name, len(ip), len(td)))
			for _, title := range ip {
				lines = append(lines, fmt.Sprintf("    :wrench: %s", title))
			}
			for _, title := range td {
				lines = append(lines, fmt.Sprintf("    :clipboard: %s", title))
			}
			if len(ip) == 0 && len(td) == 0 {
				lines = append(lines, "    _no assigned work_")
			}
		}
		if uIP := ipGrouped["Unassigned"]; len(uIP) > 0 {
			lines = append(lines, fmt.Sprintf("  *Unassigned* (%d in progress)", len(uIP)))
			for _, title := range uIP {
				lines = append(lines, fmt.Sprintf("    :wrench: %s", title))
			}
		}
		if uTD := tdGrouped["Unassigned"]; len(uTD) > 0 {
			if len(ipGrouped["Unassigned"]) == 0 {
				lines = append(lines, fmt.Sprintf("  *Unassigned* (%d todo)", len(uTD)))
			}
			for _, title := range uTD {
				lines = append(lines, fmt.Sprintf("    :clipboard: %s", title))
			}
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// Backlog items needing attention
	if len(d.BacklogIssues) > 0 {
		blocks = append(blocks, dividerBlock())
		lines := []string{fmt.Sprintf("*:inbox_tray: Backlog (%d items)*", len(d.BacklogIssues))}
		for _, b := range d.BacklogIssues {
			priority := ""
			if b.Priority == "urgent" || b.Priority == "high" {
				priority = fmt.Sprintf(" :small_red_triangle: %s", b.Priority)
			}
			ptStr := ""
			if b.Points > 0 {
				ptStr = fmt.Sprintf(" (%dp)", b.Points)
			}
			lines = append(lines, fmt.Sprintf("• %s%s%s — %s", b.IssueTitle, ptStr, priority, assigneeName(b.AssigneeName)))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// Blockers
	if len(d.Blockers) > 0 {
		blocks = append(blocks, dividerBlock())
		lines := []string{fmt.Sprintf("*:red_circle: Blockers (%d)*", len(d.Blockers))}
		for _, b := range d.Blockers {
			line := fmt.Sprintf("• %s — %s", b.IssueTitle, assigneeName(b.AssigneeName))
			if b.DaysBlocked > 0 {
				line += fmt.Sprintf(" (%d days)", b.DaysBlocked)
			}
			lines = append(lines, line)
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	return blocks
}

func parseReportDetails(raw []byte) map[string]string {
	var m map[string]string
	_ = json.Unmarshal(raw, &m)
	if m == nil {
		m = map[string]string{}
	}
	return m
}

func formatStatusName(status string) string {
	switch status {
	case "backlog":
		return "Backlog"
	case "todo":
		return "To Do"
	case "in_progress":
		return "In Progress"
	case "in_review":
		return "In Review"
	case "done":
		return "Done"
	case "cancelled":
		return "Cancelled"
	case "blocked":
		return "Blocked"
	default:
		return status
	}
}
