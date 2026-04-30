# Parent Task Chip — Design

> 2026-04-30

## Problem

In the list view and board view, sub-issues show no indication of which parent they belong to. Users have to open each issue to know its context. They want at-a-glance "what is this a child of?".

## Solution

Show a small **parent chip** in the right meta row of every issue row/card whose `parent_issue_id` is set. The chip displays the parent's **title only** (option A from brainstorm), with a `CornerDownRight` icon and a tooltip carrying the full parent identifier + title. Click navigates to the parent issue. Top-level issues (no parent) render no chip — this is the only difference from issues today.

## Backend

`IssueResponse` (`server/internal/handler/issue.go`) gets two new optional fields:

```go
ParentIdentifier *string `json:"parent_identifier,omitempty"`
ParentTitle      *string `json:"parent_title,omitempty"`
```

Populated whenever `parent_issue_id` is set. The identifier is `<team_prefix>-<number>` (same shape as `identifier`), the title is `parent.title` verbatim.

Two execution paths:

1. **List queries** (`ListIssues`, `ListIssuesByCycle`, `ListChildIssues`, `ListOpenIssues`) — extend the SQL with `LEFT JOIN issue parent ON parent.id = issue.parent_issue_id` and select `parent.title`, `parent.number`, `parent.team_id`. The team prefix is resolved against the existing `teamPrefixMap` the handler already loads.
2. **Single-issue endpoints** (`GetIssue`, `UpdateIssue` response, `CreateIssue` response) — after the row is loaded, do one `GetIssue(parentID)` lookup when `ParentIssueID.Valid`. The added cost is one query per write/read of a single issue, which is negligible.

WS `issue:updated` already returns `IssueResponse` — the parent fields ride along, no extra event work.

## Frontend type

`packages/core/types/issue.ts` `Issue` gets:

```ts
parent_identifier?: string;
parent_title?: string;
```

Optional so existing fixtures and tests keep compiling. No callers depend on absence vs empty string.

## List view

`packages/views/issues/components/list-view.tsx`. The right meta row currently renders the project chip + due date. Insert a parent chip immediately **before** the project chip when `issue.parent_issue_id` is set:

- Icon: `CornerDownRight` (lucide-react), `size-3.5`, `text-muted-foreground`
- Label: `issue.parent_title` (truncated, `max-w-[10rem]`, `truncate`)
- Tooltip (existing `Tooltip` primitive): `${issue.parent_identifier} · ${issue.parent_title}`
- Click: `navigation.push(p.issueDetail(issue.parent_identifier))` — uses the existing path helper, stops row-click propagation

If `parent_title` is missing for any reason (e.g. cached pre-migration row), fall back to `parent_identifier`. If both are missing but `parent_issue_id` is set, render nothing — this is the safest old-cache state.

## Board view

`packages/views/issues/components/board-card.tsx`. Same chip, same behavior, placed before the project chip in the card's meta row. Tighter truncation (`max-w-[7rem]`) because cards are narrower than list rows.

## Edge cases

- **Cross-team parent** — the chip shows the parent's identifier (which carries the parent's team prefix). No special styling — it's still useful context.
- **Deleted parent** — backend returns `null` for both fields after the parent row is gone (the LEFT JOIN yields null). Chip disappears the next refetch.
- **Renamed parent** — WS `issue:updated` for the parent invalidates its detail cache, but children's `parent_title` only refreshes on the next list refetch. Acceptable; users notice this only in long-open tabs.

## Out of scope

- Showing the parent's status/priority/assignee on the chip
- Indenting sub-issues under their parent in list view (this is the future "tree view")
- Any changes to the issue detail page (it already shows parent context)

## Tests

- `packages/views/issues/components/list-view.test.tsx` — render with a sub-issue, assert the chip appears with the parent title; render with a top-level issue, assert no chip.
- `packages/views/issues/components/board-card.test.tsx` — same two assertions.
- Backend handler test for `ListIssues` — assert `parent_identifier` and `parent_title` populate when present, are absent when null.
