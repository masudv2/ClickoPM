"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronRight, Plus, GripVertical } from "lucide-react";
import { Accordion } from "@base-ui/react/accordion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { Button } from "@multica/ui/components/ui/button";
import type { Issue, IssueStatus } from "@multica/core/types";
import { useLoadMoreByStatus } from "@multica/core/issues/mutations";
import type { MyIssuesFilter } from "@multica/core/issues/queries";
import { STATUS_CONFIG } from "@multica/core/issues/config";
import { useModalStore } from "@multica/core/modals";
import { useViewStore } from "@multica/core/issues/stores/view-store-context";
import { useIssueSelectionStore } from "@multica/core/issues/stores/selection-store";
import { sortIssues } from "../utils/sort";
import { StatusIcon } from "./status-icon";
import { ListRow, type ChildProgress } from "./list-row";
import { InfiniteScrollSentinel } from "./infinite-scroll-sentinel";

const EMPTY_PROGRESS_MAP = new Map<string, ChildProgress>();

function computePosition(issues: Issue[], activeIdx: number): number {
  if (issues.length === 1) return issues[0]!.position;
  if (activeIdx === 0) return issues[1]!.position - 1;
  if (activeIdx === issues.length - 1) return issues[activeIdx - 1]!.position + 1;
  return (issues[activeIdx - 1]!.position + issues[activeIdx + 1]!.position) / 2;
}

export function ListView({
  issues,
  visibleStatuses,
  childProgressMap = EMPTY_PROGRESS_MAP,
  myIssuesScope,
  myIssuesFilter,
  teamId,
  onMoveIssue,
}: {
  issues: Issue[];
  visibleStatuses: IssueStatus[];
  childProgressMap?: Map<string, ChildProgress>;
  myIssuesScope?: string;
  myIssuesFilter?: MyIssuesFilter;
  teamId?: string;
  onMoveIssue?: (issueId: string, newStatus: IssueStatus, newPosition?: number) => void;
}) {
  const sortBy = useViewStore((s) => s.sortBy);
  const sortDirection = useViewStore((s) => s.sortDirection);
  const listCollapsedStatuses = useViewStore((s) => s.listCollapsedStatuses);
  const toggleListCollapsed = useViewStore((s) => s.toggleListCollapsed);

  const isDraggable = !!onMoveIssue && sortBy === "position";

  const issuesByStatus = useMemo(() => {
    const map = new Map<IssueStatus, Issue[]>();
    for (const status of visibleStatuses) {
      const filtered = issues.filter((i) => i.status === status);
      map.set(status, sortIssues(filtered, sortBy, sortDirection));
    }
    return map;
  }, [issues, visibleStatuses, sortBy, sortDirection]);

  const expandedStatuses = useMemo(
    () => visibleStatuses.filter((s) => !listCollapsedStatuses.includes(s)),
    [visibleStatuses, listCollapsedStatuses],
  );

  const myIssuesOpts = myIssuesScope
    ? { scope: myIssuesScope, filter: myIssuesFilter ?? {} }
    : undefined;

  // --- Drag state ---
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const issueMap = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues) map.set(issue.id, issue);
    return map;
  }, [issues]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveIssue(issueMap.get(event.active.id as string) ?? null);
    },
    [issueMap],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveIssue(null);
      const { active, over } = event;
      if (!over || !onMoveIssue) return;

      const activeId = active.id as string;
      const overId = over.id as string;
      if (activeId === overId) return;

      const issue = issueMap.get(activeId);
      if (!issue) return;

      const statusIssues = issuesByStatus.get(issue.status as IssueStatus);
      if (!statusIssues) return;

      const oldIndex = statusIssues.findIndex((i) => i.id === activeId);
      const newIndex = statusIssues.findIndex((i) => i.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(statusIssues, oldIndex, newIndex);
      const finalIdx = reordered.findIndex((i) => i.id === activeId);
      const newPosition = computePosition(reordered, finalIdx);

      onMoveIssue(activeId, issue.status as IssueStatus, newPosition);
    },
    [onMoveIssue, issueMap, issuesByStatus],
  );

  const content = (
    <div className="flex-1 min-h-0 overflow-y-auto p-2">
      <Accordion.Root
        multiple
        className="space-y-1"
        value={expandedStatuses}
        onValueChange={(value: string[]) => {
          for (const status of visibleStatuses) {
            const wasExpanded = expandedStatuses.includes(status);
            const isExpanded = value.includes(status);
            if (wasExpanded !== isExpanded) {
              toggleListCollapsed(status as IssueStatus);
            }
          }
        }}
      >
        {visibleStatuses.map((status) => (
          <StatusAccordionItem
            key={status}
            status={status}
            issues={issuesByStatus.get(status) ?? []}
            childProgressMap={childProgressMap}
            myIssuesOpts={myIssuesOpts}
            teamId={teamId}
            isDraggable={isDraggable}
          />
        ))}
      </Accordion.Root>
    </div>
  );

  if (!isDraggable) return content;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {content}
      <DragOverlay dropAnimation={null}>
        {activeIssue ? (
          <div className="rounded-md border bg-card px-4 py-2 shadow-lg opacity-90">
            <ListRowContent issue={activeIssue} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ListRowContent({ issue }: { issue: Issue }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{issue.identifier}</span>
      <span className="truncate">{issue.title}</span>
    </div>
  );
}

function SortableListRow({
  issue,
  childProgress,
  isChild,
  hasVisibleChildren,
  collapsed,
  onToggleCollapse,
}: {
  issue: Issue;
  childProgress?: ChildProgress;
  isChild?: boolean;
  hasVisibleChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center group/sortable">
      <button
        type="button"
        className="flex items-center justify-center w-5 shrink-0 cursor-grab text-muted-foreground/0 group-hover/sortable:text-muted-foreground/60 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <ListRow
          issue={issue}
          childProgress={childProgress}
          isChild={isChild}
          hasVisibleChildren={hasVisibleChildren}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      </div>
    </div>
  );
}

/**
 * Re-orders issues into a tree-like flat list: each parent is followed by its
 * direct children (children whose parent is also in this section). Returns the
 * sequenced list and a map from parent id → its visible children, so the
 * renderer knows which rows get a chevron and which to indent.
 *
 * Roots (no parent, or parent not in this section) keep their original order.
 */
function buildTree(issues: Issue[]) {
  const idSet = new Set(issues.map((i) => i.id));
  const childrenOf = new Map<string, Issue[]>();
  const roots: Issue[] = [];
  for (const issue of issues) {
    const pid = issue.parent_issue_id;
    if (pid && idSet.has(pid)) {
      const arr = childrenOf.get(pid) ?? [];
      arr.push(issue);
      childrenOf.set(pid, arr);
    } else {
      roots.push(issue);
    }
  }
  const sequenced: Array<{ issue: Issue; isChild: boolean }> = [];
  for (const root of roots) {
    sequenced.push({ issue: root, isChild: false });
    const kids = childrenOf.get(root.id);
    if (kids) {
      for (const k of kids) sequenced.push({ issue: k, isChild: true });
    }
  }
  return { sequenced, childrenOf };
}

function StatusAccordionItem({
  status,
  issues,
  childProgressMap,
  myIssuesOpts,
  teamId,
  isDraggable,
}: {
  status: IssueStatus;
  issues: Issue[];
  childProgressMap: Map<string, ChildProgress>;
  myIssuesOpts?: { scope: string; filter: MyIssuesFilter };
  teamId?: string;
  isDraggable?: boolean;
}) {
  const cfg = STATUS_CONFIG[status];
  const selectedIds = useIssueSelectionStore((s) => s.selectedIds);
  const select = useIssueSelectionStore((s) => s.select);
  const deselect = useIssueSelectionStore((s) => s.deselect);
  const { loadMore, hasMore, isLoading, total } = useLoadMoreByStatus(
    status,
    myIssuesOpts,
    teamId,
  );

  const issueIds = issues.map((i) => i.id);
  const selectedCount = issueIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = issues.length > 0 && selectedCount === issues.length;
  const someSelected = selectedCount > 0;

  const { sequenced, childrenOf } = useMemo(() => buildTree(issues), [issues]);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(() => new Set());
  const visibleRows = useMemo(
    () => sequenced.filter((r) => !r.isChild || !collapsedParents.has(r.issue.parent_issue_id ?? "")),
    [sequenced, collapsedParents],
  );

  return (
    <Accordion.Item value={status}>
      <Accordion.Header className="group/header flex h-10 items-center rounded-lg bg-muted/40 transition-colors hover:bg-accent/30">
        <div className="pl-3 flex items-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => {
              if (allSelected) {
                deselect(issueIds);
              } else {
                select(issueIds);
              }
            }}
            className="cursor-pointer accent-primary"
          />
        </div>
        <Accordion.Trigger className="group/trigger flex flex-1 items-center gap-2 px-2 h-full text-left outline-none">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-aria-expanded/trigger:rotate-90" />
          <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
            <StatusIcon status={status} className="h-3 w-3" inheritColor />
            {cfg.label}
          </span>
          <span className="text-xs text-muted-foreground">{total}</span>
        </Accordion.Trigger>
        <div className="pr-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-muted-foreground opacity-0 group-hover/header:opacity-100 transition-opacity"
                  onClick={() =>
                    useModalStore
                      .getState()
                      .open("create-issue", { status, ...(teamId ? { team_id: teamId } : {}) })
                  }
                />
              }
            >
              <Plus className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Add issue</TooltipContent>
          </Tooltip>
        </div>
      </Accordion.Header>
      <Accordion.Panel className="pt-1">
        {issues.length > 0 ? (
          <>
            {isDraggable ? (
              <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
                {visibleRows.map(({ issue, isChild }) => {
                  const hasVisibleChildren = !isChild && (childrenOf.get(issue.id)?.length ?? 0) > 0;
                  return (
                    <SortableListRow
                      key={issue.id}
                      issue={issue}
                      childProgress={childProgressMap.get(issue.id)}
                      isChild={isChild}
                      hasVisibleChildren={hasVisibleChildren}
                      collapsed={collapsedParents.has(issue.id)}
                      onToggleCollapse={hasVisibleChildren ? () => {
                        setCollapsedParents((prev) => {
                          const next = new Set(prev);
                          if (next.has(issue.id)) next.delete(issue.id);
                          else next.add(issue.id);
                          return next;
                        });
                      } : undefined}
                    />
                  );
                })}
              </SortableContext>
            ) : (
              visibleRows.map(({ issue, isChild }) => {
                const hasVisibleChildren = !isChild && (childrenOf.get(issue.id)?.length ?? 0) > 0;
                return (
                  <ListRow
                    key={issue.id}
                    issue={issue}
                    childProgress={childProgressMap.get(issue.id)}
                    isChild={isChild}
                    hasVisibleChildren={hasVisibleChildren}
                    collapsed={collapsedParents.has(issue.id)}
                    onToggleCollapse={hasVisibleChildren ? () => {
                      setCollapsedParents((prev) => {
                        const next = new Set(prev);
                        if (next.has(issue.id)) next.delete(issue.id);
                        else next.add(issue.id);
                        return next;
                      });
                    } : undefined}
                  />
                );
              })
            )}
            {hasMore && (
              <InfiniteScrollSentinel onVisible={loadMore} loading={isLoading} />
            )}
          </>
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No issues
          </p>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
}
