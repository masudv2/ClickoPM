import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
  issueKeys,
  ISSUE_PAGE_SIZE,
  type MyIssuesFilter,
} from "./queries";
import { cycleKeys } from "../cycles/queries";
import { dashboardKeys } from "../dashboard/queries";
import {
  addIssueToBuckets,
  findIssueLocation,
  getBucket,
  patchIssueInBuckets,
  removeIssueFromBuckets,
  setBucket,
} from "./cache-helpers";
import { useWorkspaceId } from "../hooks";
import { useRecentIssuesStore } from "./stores";
import type { Issue, IssueReaction, IssueStatus } from "../types";
import type {
  CreateIssueRequest,
  UpdateIssueRequest,
  ListIssuesCache,
} from "../types";
import type { TimelineEntry, IssueSubscriber, Reaction } from "../types";

// ---------------------------------------------------------------------------
// Shared mutation variable types — used by both mutation hooks and
// useMutationState consumers to keep the type assertion in sync.
// ---------------------------------------------------------------------------

export type ToggleCommentReactionVars = {
  commentId: string;
  emoji: string;
  existing: Reaction | undefined;
};

export type ToggleIssueReactionVars = {
  emoji: string;
  existing: IssueReaction | undefined;
};

// ---------------------------------------------------------------------------
// Per-status pagination
// ---------------------------------------------------------------------------

/**
 * Paginate one status column into the cache. Works for both the workspace
 * issue list and per-scope My Issues lists (pass `myIssues` to target the
 * latter).
 */
export function useLoadMoreByStatus(
  status: IssueStatus,
  myIssues?: { scope: string; filter: MyIssuesFilter },
  teamId?: string,
) {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  const [isLoading, setIsLoading] = useState(false);

  const queryKey = myIssues
    ? issueKeys.myList(wsId, myIssues.scope, myIssues.filter)
    : teamId
      ? [...issueKeys.list(wsId), "team", teamId]
      : issueKeys.list(wsId);
  const cache = qc.getQueryData<ListIssuesCache>(queryKey);
  const bucket = cache?.byStatus[status];
  const loaded = bucket?.issues.length ?? 0;
  const total = bucket?.total ?? 0;
  const hasMore = loaded < total;

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    try {
      const res = await api.listIssues({
        status,
        limit: ISSUE_PAGE_SIZE,
        offset: loaded,
        ...myIssues?.filter,
        ...(teamId ? { team_id: teamId } : {}),
      });
      qc.setQueryData<ListIssuesCache>(queryKey, (old) => {
        if (!old) return old;
        const prev = getBucket(old, status);
        const existingIds = new Set(prev.issues.map((i) => i.id));
        const appended = res.issues.filter((i) => !existingIds.has(i.id));
        return setBucket(old, status, {
          issues: [...prev.issues, ...appended],
          total: res.total,
        });
      });
    } finally {
      setIsLoading(false);
    }
  }, [qc, queryKey, status, loaded, hasMore, isLoading, myIssues?.filter, teamId]);

  return { loadMore, hasMore, isLoading, total };
}

// ---------------------------------------------------------------------------
// Issue CRUD
// ---------------------------------------------------------------------------

export function useCreateIssue() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateIssueRequest) => api.createIssue(data),
    onSuccess: (newIssue) => {
      // Add to ALL matching list caches (workspace + team-filtered).
      const listCaches = qc.getQueriesData<ListIssuesCache>({ queryKey: issueKeys.list(wsId) });
      for (const [key, cache] of listCaches) {
        if (!cache) continue;
        qc.setQueryData<ListIssuesCache>(key, addIssueToBuckets(cache, newIssue));
      }
      // Push into the cycle's issues cache when assigned to one.
      if (newIssue.cycle_id) {
        qc.setQueryData<Issue[]>(cycleKeys.issues(wsId, newIssue.cycle_id), (old) => {
          if (!old) return old;
          if (old.some((i) => i.id === newIssue.id)) return old;
          return [...old, newIssue];
        });
      }
      // Surface the just-created issue in cmd+k's Recent list without
      // requiring the user to open it first.
      useRecentIssuesStore.getState().recordVisit(newIssue.id);
      // Invalidate parent's children query so sub-issues list updates immediately
      if (newIssue.parent_issue_id) {
        qc.invalidateQueries({ queryKey: issueKeys.children(wsId, newIssue.parent_issue_id) });
        qc.invalidateQueries({ queryKey: issueKeys.childProgress(wsId) });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: dashboardKeys.all(wsId) });
    },
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateIssueRequest) =>
      api.updateIssue(id, data),
    onMutate: ({ id, ...data }) => {
      // Fire-and-forget cancelQueries — keeps onMutate synchronous so the
      // cache update happens in the same tick as mutate(). Awaiting would
      // yield to the event loop, letting @dnd-kit reset its visual state
      // before the optimistic update lands.
      // Cancel and patch ALL issue list caches (workspace-wide + team-filtered).
      qc.cancelQueries({ queryKey: issueKeys.list(wsId) });
      qc.cancelQueries({ queryKey: cycleKeys.issuesAll(wsId) });
      const prevList = qc.getQueryData<ListIssuesCache>(issueKeys.list(wsId));
      const prevDetail = qc.getQueryData<Issue>(issueKeys.detail(wsId, id));

      // Resolve parent_issue_id from the freshest source so we can keep the
      // parent's children cache in sync (used by the parent issue's
      // sub-issues list).
      const parentId =
        prevDetail?.parent_issue_id ??
        (prevList ? findIssueLocation(prevList, id)?.issue.parent_issue_id : null) ??
        null;
      const prevChildren = parentId
        ? qc.getQueryData<Issue[]>(issueKeys.children(wsId, parentId))
        : undefined;

      // Optimistically update ALL matching list caches (workspace + team-filtered).
      const listCaches = qc.getQueriesData<ListIssuesCache>({ queryKey: issueKeys.list(wsId) });
      const prevLists = new Map<string, ListIssuesCache>();
      for (const [key, cache] of listCaches) {
        if (!cache) continue;
        const keyStr = JSON.stringify(key);
        prevLists.set(keyStr, cache);
        qc.setQueryData<ListIssuesCache>(key, patchIssueInBuckets(cache, id, data));
      }

      // Patch every active cycle issues cache that contains this issue.
      const cycleIssueCaches = qc.getQueriesData<Issue[]>({ queryKey: cycleKeys.issuesAll(wsId) });
      const prevCycleIssues = new Map<string, Issue[]>();
      for (const [key, cache] of cycleIssueCaches) {
        if (!cache) continue;
        const keyStr = JSON.stringify(key);
        prevCycleIssues.set(keyStr, cache);
        qc.setQueryData<Issue[]>(key, cache.map((i) => (i.id === id ? { ...i, ...data } : i)));
      }

      qc.setQueryData<Issue>(issueKeys.detail(wsId, id), (old) =>
        old ? { ...old, ...data } : old,
      );
      if (parentId) {
        qc.setQueryData<Issue[]>(
          issueKeys.children(wsId, parentId),
          (old) =>
            old?.map((c) => (c.id === id ? { ...c, ...data } : c)),
        );
      }
      return { prevLists, prevCycleIssues, prevDetail, prevChildren, parentId, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevLists) {
        for (const [keyStr, cache] of ctx.prevLists) {
          qc.setQueryData(JSON.parse(keyStr), cache);
        }
      }
      if (ctx?.prevCycleIssues) {
        for (const [keyStr, cache] of ctx.prevCycleIssues) {
          qc.setQueryData(JSON.parse(keyStr), cache);
        }
      }
      if (ctx?.prevDetail)
        qc.setQueryData(issueKeys.detail(wsId, ctx.id), ctx.prevDetail);
      if (ctx?.parentId && ctx.prevChildren !== undefined) {
        qc.setQueryData(
          issueKeys.children(wsId, ctx.parentId),
          ctx.prevChildren,
        );
      }
    },
    onSettled: (_data, _err, vars, ctx) => {
      qc.invalidateQueries({ queryKey: issueKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: dashboardKeys.all(wsId) });
      // Invalidate old parent's children cache
      if (ctx?.parentId) {
        qc.invalidateQueries({
          queryKey: issueKeys.children(wsId, ctx.parentId),
        });
        qc.invalidateQueries({ queryKey: issueKeys.childProgress(wsId) });
      }
      // Invalidate new parent's children cache when parent_issue_id changed
      const newParentId = vars.parent_issue_id;
      if (newParentId && newParentId !== ctx?.parentId) {
        qc.invalidateQueries({
          queryKey: issueKeys.children(wsId, newParentId),
        });
        qc.invalidateQueries({ queryKey: issueKeys.childProgress(wsId) });
      }
    },
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteIssue(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: issueKeys.list(wsId) });
      await qc.cancelQueries({ queryKey: cycleKeys.issuesAll(wsId) });
      const listCaches = qc.getQueriesData<ListIssuesCache>({ queryKey: issueKeys.list(wsId) });
      const prevLists = new Map<string, ListIssuesCache>();
      let parentIssueId: string | undefined;
      for (const [key, cache] of listCaches) {
        if (!cache) continue;
        const keyStr = JSON.stringify(key);
        prevLists.set(keyStr, cache);
        if (!parentIssueId) {
          parentIssueId = findIssueLocation(cache, id)?.issue.parent_issue_id ?? undefined;
        }
        qc.setQueryData<ListIssuesCache>(key, removeIssueFromBuckets(cache, id));
      }
      const cycleIssueCaches = qc.getQueriesData<Issue[]>({ queryKey: cycleKeys.issuesAll(wsId) });
      const prevCycleIssues = new Map<string, Issue[]>();
      for (const [key, cache] of cycleIssueCaches) {
        if (!cache) continue;
        prevCycleIssues.set(JSON.stringify(key), cache);
        qc.setQueryData<Issue[]>(key, cache.filter((i) => i.id !== id));
      }
      qc.removeQueries({ queryKey: issueKeys.detail(wsId, id) });
      return { prevLists, prevCycleIssues, parentIssueId };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevLists) {
        for (const [keyStr, cache] of ctx.prevLists) {
          qc.setQueryData(JSON.parse(keyStr), cache);
        }
      }
      if (ctx?.prevCycleIssues) {
        for (const [keyStr, cache] of ctx.prevCycleIssues) {
          qc.setQueryData(JSON.parse(keyStr), cache);
        }
      }
    },
    onSettled: (_data, _err, _id, ctx) => {
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: dashboardKeys.all(wsId) });
      if (ctx?.parentIssueId) {
        qc.invalidateQueries({ queryKey: issueKeys.children(wsId, ctx.parentIssueId) });
        qc.invalidateQueries({ queryKey: issueKeys.childProgress(wsId) });
      }
    },
  });
}

export function useBatchUpdateIssues() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: UpdateIssueRequest;
    }) => api.batchUpdateIssues(ids, updates),
    onMutate: async ({ ids, updates }) => {
      await qc.cancelQueries({ queryKey: issueKeys.list(wsId) });
      await qc.cancelQueries({ queryKey: cycleKeys.issuesAll(wsId) });
      const prevList = qc.getQueryData<ListIssuesCache>(issueKeys.list(wsId));
      qc.setQueryData<ListIssuesCache>(issueKeys.list(wsId), (old) => {
        if (!old) return old;
        let next = old;
        for (const id of ids) next = patchIssueInBuckets(next, id, updates);
        return next;
      });
      const idSet = new Set(ids);
      const cycleIssueCaches = qc.getQueriesData<Issue[]>({ queryKey: cycleKeys.issuesAll(wsId) });
      const prevCycleIssues = new Map<string, Issue[]>();
      for (const [key, cache] of cycleIssueCaches) {
        if (!cache) continue;
        prevCycleIssues.set(JSON.stringify(key), cache);
        qc.setQueryData<Issue[]>(
          key,
          cache.map((i) => (idSet.has(i.id) ? { ...i, ...updates } : i)),
        );
      }
      return { prevList, prevCycleIssues };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevList) qc.setQueryData(issueKeys.list(wsId), ctx.prevList);
      if (ctx?.prevCycleIssues) {
        for (const [keyStr, cache] of ctx.prevCycleIssues) {
          qc.setQueryData(JSON.parse(keyStr), cache);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: dashboardKeys.all(wsId) });
    },
  });
}

export function useBatchDeleteIssues() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (ids: string[]) => api.batchDeleteIssues(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: issueKeys.list(wsId) });
      await qc.cancelQueries({ queryKey: cycleKeys.issuesAll(wsId) });
      const prevList = qc.getQueryData<ListIssuesCache>(issueKeys.list(wsId));
      const parentIssueIds = new Set<string>();
      if (prevList) {
        for (const id of ids) {
          const loc = findIssueLocation(prevList, id);
          if (loc?.issue.parent_issue_id) parentIssueIds.add(loc.issue.parent_issue_id);
        }
      }
      qc.setQueryData<ListIssuesCache>(issueKeys.list(wsId), (old) => {
        if (!old) return old;
        let next = old;
        for (const id of ids) next = removeIssueFromBuckets(next, id);
        return next;
      });
      const idSet = new Set(ids);
      const cycleIssueCaches = qc.getQueriesData<Issue[]>({ queryKey: cycleKeys.issuesAll(wsId) });
      const prevCycleIssues = new Map<string, Issue[]>();
      for (const [key, cache] of cycleIssueCaches) {
        if (!cache) continue;
        prevCycleIssues.set(JSON.stringify(key), cache);
        qc.setQueryData<Issue[]>(key, cache.filter((i) => !idSet.has(i.id)));
      }
      return { prevList, prevCycleIssues, parentIssueIds };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prevList) qc.setQueryData(issueKeys.list(wsId), ctx.prevList);
      if (ctx?.prevCycleIssues) {
        for (const [keyStr, cache] of ctx.prevCycleIssues) {
          qc.setQueryData(JSON.parse(keyStr), cache);
        }
      }
    },
    onSettled: (_data, _err, _ids, ctx) => {
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: dashboardKeys.all(wsId) });
      if (ctx?.parentIssueIds && ctx.parentIssueIds.size > 0) {
        for (const parentId of ctx.parentIssueIds) {
          qc.invalidateQueries({ queryKey: issueKeys.children(wsId, parentId) });
        }
        qc.invalidateQueries({ queryKey: issueKeys.childProgress(wsId) });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Comments / Timeline
// ---------------------------------------------------------------------------

export function useCreateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      type,
      parentId,
      attachmentIds,
    }: {
      content: string;
      type?: string;
      parentId?: string;
      attachmentIds?: string[];
    }) => api.createComment(issueId, content, type, parentId, attachmentIds),
    onSuccess: (comment) => {
      qc.setQueryData<TimelineEntry[]>(
        issueKeys.timeline(issueId),
        (old) => {
          if (!old) return old;
          const entry: TimelineEntry = {
            type: "comment",
            id: comment.id,
            actor_type: comment.author_type,
            actor_id: comment.author_id,
            content: comment.content,
            parent_id: comment.parent_id,
            comment_type: comment.type,
            reactions: comment.reactions ?? [],
            attachments: comment.attachments ?? [],
            created_at: comment.created_at,
            updated_at: comment.updated_at,
          };
          if (old.some((e) => e.id === comment.id)) return old;
          return [...old, entry];
        },
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.timeline(issueId) });
    },
  });
}

export function useUpdateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      api.updateComment(commentId, content),
    onMutate: async ({ commentId, content }) => {
      await qc.cancelQueries({ queryKey: issueKeys.timeline(issueId) });
      const prev = qc.getQueryData<TimelineEntry[]>(issueKeys.timeline(issueId));
      qc.setQueryData<TimelineEntry[]>(
        issueKeys.timeline(issueId),
        (old) =>
          old?.map((e) => (e.id === commentId ? { ...e, content } : e)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev)
        qc.setQueryData(issueKeys.timeline(issueId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.timeline(issueId) });
    },
  });
}

export function useDeleteComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: issueKeys.timeline(issueId) });
      const prev = qc.getQueryData<TimelineEntry[]>(issueKeys.timeline(issueId));

      // Cascade: collect all child comment IDs
      const toRemove = new Set<string>([commentId]);
      if (prev) {
        let changed = true;
        while (changed) {
          changed = false;
          for (const e of prev) {
            if (e.parent_id && toRemove.has(e.parent_id) && !toRemove.has(e.id)) {
              toRemove.add(e.id);
              changed = true;
            }
          }
        }
      }

      qc.setQueryData<TimelineEntry[]>(
        issueKeys.timeline(issueId),
        (old) => old?.filter((e) => !toRemove.has(e.id)),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev)
        qc.setQueryData(issueKeys.timeline(issueId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.timeline(issueId) });
    },
  });
}

export function useToggleCommentReaction(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["toggleCommentReaction", issueId] as const,
    mutationFn: async ({
      commentId,
      emoji,
      existing,
    }: ToggleCommentReactionVars) => {
      if (existing) {
        await api.removeReaction(commentId, emoji);
        return null;
      }
      return api.addReaction(commentId, emoji);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.timeline(issueId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Issue-level Reactions
// ---------------------------------------------------------------------------

export function useToggleIssueReaction(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["toggleIssueReaction", issueId] as const,
    mutationFn: async ({
      emoji,
      existing,
    }: ToggleIssueReactionVars) => {
      if (existing) {
        await api.removeIssueReaction(issueId, emoji);
        return null;
      }
      return api.addIssueReaction(issueId, emoji);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.reactions(issueId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Issue Subscribers
// ---------------------------------------------------------------------------

export function useToggleIssueSubscriber(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      userType,
      subscribed,
    }: {
      userId: string;
      userType: "member" | "agent";
      subscribed: boolean;
    }) => {
      if (subscribed) {
        await api.unsubscribeFromIssue(issueId, userId, userType);
      } else {
        await api.subscribeToIssue(issueId, userId, userType);
      }
    },
    onMutate: async ({ userId, userType, subscribed }) => {
      await qc.cancelQueries({ queryKey: issueKeys.subscribers(issueId) });
      const prev = qc.getQueryData<IssueSubscriber[]>(
        issueKeys.subscribers(issueId),
      );

      if (subscribed) {
        qc.setQueryData<IssueSubscriber[]>(
          issueKeys.subscribers(issueId),
          (old) =>
            old?.filter(
              (s) => !(s.user_id === userId && s.user_type === userType),
            ),
        );
      } else {
        const temp: IssueSubscriber = {
          issue_id: issueId,
          user_type: userType,
          user_id: userId,
          reason: "manual",
          created_at: new Date().toISOString(),
        };
        qc.setQueryData<IssueSubscriber[]>(
          issueKeys.subscribers(issueId),
          (old) => {
            if (
              old?.some(
                (s) => s.user_id === userId && s.user_type === userType,
              )
            )
              return old;
            return [...(old ?? []), temp];
          },
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev)
        qc.setQueryData(issueKeys.subscribers(issueId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.subscribers(issueId) });
    },
  });
}
