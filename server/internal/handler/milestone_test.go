package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// createMilestoneTestProject is a small helper that creates a project for the
// milestone tests and returns its ID. The caller is responsible for cleanup.
func createMilestoneTestProject(t *testing.T, title string) string {
	t.Helper()
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/projects?workspace_id="+testWorkspaceID, map[string]any{
		"title":   title,
		"team_id": testTeamID,
	})
	testHandler.CreateProject(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateProject: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var p ProjectResponse
	json.NewDecoder(w.Body).Decode(&p)
	t.Cleanup(func() {
		dr := newRequest("DELETE", "/api/projects/"+p.ID, nil)
		dr = withURLParam(dr, "id", p.ID)
		testHandler.DeleteProject(httptest.NewRecorder(), dr)
	})
	return p.ID
}

// createMilestone is a small helper that creates a milestone for tests.
func createMilestone(t *testing.T, projectID string, body map[string]any) MilestoneResponse {
	t.Helper()
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/projects/"+projectID+"/milestones", body)
	req = withURLParam(req, "id", projectID)
	testHandler.CreateMilestone(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateMilestone: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var m MilestoneResponse
	json.NewDecoder(w.Body).Decode(&m)
	return m
}

func TestCreateMilestone(t *testing.T) {
	pID := createMilestoneTestProject(t, "T-CreateMilestone")
	m := createMilestone(t, pID, map[string]any{
		"name":        "Phase 1",
		"description": "Discovery",
		"target_date": "2026-05-01",
	})
	if m.Name != "Phase 1" {
		t.Errorf("name=%q", m.Name)
	}
	if m.TargetDate == nil || *m.TargetDate != "2026-05-01" {
		t.Errorf("target_date=%v", m.TargetDate)
	}
	if m.DerivedStatus != "planned" {
		t.Errorf("derived_status=%q", m.DerivedStatus)
	}
}

func TestListMilestonesProgress(t *testing.T) {
	pID := createMilestoneTestProject(t, "T-ListMilestonesProgress")
	m := createMilestone(t, pID, map[string]any{"name": "M1"})

	// Create 3 issues — 2 done, 1 todo — assigned to milestone
	for i, status := range []string{"done", "done", "todo"} {
		w := httptest.NewRecorder()
		req := newRequest("POST", "/api/issues?workspace_id="+testWorkspaceID, map[string]any{
			"title":        "I" + string(rune('0'+i)),
			"status":       status,
			"priority":     "medium",
			"team_id":      testTeamID,
			"project_id":   pID,
			"milestone_id": m.ID,
		})
		testHandler.CreateIssue(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("CreateIssue %d: status=%d body=%s", i, w.Code, w.Body.String())
		}
	}

	// List milestones
	w := httptest.NewRecorder()
	req := newRequest("GET", "/api/projects/"+pID+"/milestones", nil)
	req = withURLParam(req, "id", pID)
	testHandler.ListMilestones(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListMilestones: status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Milestones []MilestoneResponse `json:"milestones"`
	}
	json.NewDecoder(w.Body).Decode(&resp)
	if len(resp.Milestones) != 1 {
		t.Fatalf("got %d milestones", len(resp.Milestones))
	}
	row := resp.Milestones[0]
	if row.TotalCount != 3 || row.DoneCount != 2 {
		t.Errorf("totals total=%d done=%d", row.TotalCount, row.DoneCount)
	}
	if row.Percent != 66 {
		t.Errorf("percent=%d want 66", row.Percent)
	}
	if row.DerivedStatus != "in_progress" {
		t.Errorf("derived_status=%q", row.DerivedStatus)
	}
}

func TestDeleteMilestoneUnsetsIssues(t *testing.T) {
	pID := createMilestoneTestProject(t, "T-DeleteMilestoneUnsets")
	m := createMilestone(t, pID, map[string]any{"name": "M1"})

	// Create issue assigned to milestone
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/issues?workspace_id="+testWorkspaceID, map[string]any{
		"title":        "Task A",
		"status":       "todo",
		"priority":     "medium",
		"team_id":      testTeamID,
		"project_id":   pID,
		"milestone_id": m.ID,
	})
	testHandler.CreateIssue(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateIssue: status=%d body=%s", w.Code, w.Body.String())
	}
	var iss IssueResponse
	json.NewDecoder(w.Body).Decode(&iss)
	if iss.MilestoneID == nil || *iss.MilestoneID != m.ID {
		t.Fatalf("expected milestone_id set on created issue, got %v", iss.MilestoneID)
	}

	// Delete the milestone
	dr := newRequest("DELETE", "/api/milestones/"+m.ID, nil)
	dr = withURLParam(dr, "id", m.ID)
	dw := httptest.NewRecorder()
	testHandler.DeleteMilestone(dw, dr)
	if dw.Code != http.StatusNoContent {
		t.Fatalf("DeleteMilestone: status=%d body=%s", dw.Code, dw.Body.String())
	}

	// Issue still exists with milestone_id null
	gr := newRequest("GET", "/api/issues/"+iss.ID, nil)
	gr = withURLParam(gr, "id", iss.ID)
	gw := httptest.NewRecorder()
	testHandler.GetIssue(gw, gr)
	if gw.Code != http.StatusOK {
		t.Fatalf("GetIssue after milestone delete: status=%d body=%s", gw.Code, gw.Body.String())
	}
	var got IssueResponse
	json.NewDecoder(gw.Body).Decode(&got)
	if got.MilestoneID != nil {
		t.Errorf("milestone_id=%v want nil", got.MilestoneID)
	}
}

func TestUpdateMilestone(t *testing.T) {
	pID := createMilestoneTestProject(t, "T-UpdateMilestone")
	m := createMilestone(t, pID, map[string]any{"name": "Old"})

	w := httptest.NewRecorder()
	req := newRequest("PUT", "/api/milestones/"+m.ID, map[string]any{
		"name":        "New",
		"target_date": "2026-06-15",
	})
	req = withURLParam(req, "id", m.ID)
	testHandler.UpdateMilestone(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("UpdateMilestone: status=%d body=%s", w.Code, w.Body.String())
	}
	var got MilestoneResponse
	json.NewDecoder(w.Body).Decode(&got)
	if got.Name != "New" {
		t.Errorf("name=%q", got.Name)
	}
	if got.TargetDate == nil || *got.TargetDate != "2026-06-15" {
		t.Errorf("target_date=%v", got.TargetDate)
	}
}
