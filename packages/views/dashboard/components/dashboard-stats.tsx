"use client";

import { useState } from "react";
import type { DashboardStats, DashboardBlocker } from "@multica/core/types";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@multica/ui/components/ui/sheet";
import { Badge } from "@multica/ui/components/ui/badge";
import { AppLink } from "../../navigation";
import { useWorkspacePaths } from "@multica/core/paths";
import { CircleDot, Clock, TrendingUp, Zap } from "lucide-react";

interface DashboardStatsProps {
  stats: DashboardStats;
  blockers: DashboardBlocker[];
}

export function DashboardStatsSection({ stats, blockers }: DashboardStatsProps) {
  const [overdueOpen, setOverdueOpen] = useState(false);
  const p = useWorkspacePaths();

  const overdueBlockers = blockers.filter(
    (b) => b.due_date && new Date(b.due_date) < new Date(),
  );

  const statCards = [
    {
      label: "Open Issues",
      value: stats.open_count,
      icon: CircleDot,
      iconClass: "text-blue-500",
    },
    {
      label: "Overdue",
      value: stats.overdue_count,
      icon: Clock,
      iconClass: stats.overdue_count > 0 ? "text-destructive" : "text-muted-foreground",
      valueClass: stats.overdue_count > 0 ? "text-destructive" : "",
      clickable: true,
    },
    {
      label: "Completion Rate",
      value: `${stats.completion_rate}%`,
      icon: TrendingUp,
      iconClass: "text-emerald-500",
      valueClass: "text-emerald-500",
    },
    {
      label: "Avg Velocity",
      value: stats.avg_velocity,
      icon: Zap,
      iconClass: "text-amber-500",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.label}
              className={card.clickable ? "cursor-pointer transition-colors hover:bg-muted/50" : ""}
              onClick={card.clickable ? () => setOverdueOpen(true) : undefined}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div className={`mt-0.5 rounded-md bg-muted p-1.5 ${card.iconClass}`}>
                  <Icon className="size-3.5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-xl font-semibold tabular-nums ${card.valueClass ?? ""}`}>
                    {card.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Sheet open={overdueOpen} onOpenChange={setOverdueOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Overdue Issues ({overdueBlockers.length})</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {overdueBlockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overdue issues</p>
            ) : (
              overdueBlockers.map((b) => {
                const daysOverdue = Math.ceil(
                  (Date.now() - new Date(b.due_date!).getTime()) / (1000 * 60 * 60 * 24),
                );
                return (
                  <div key={b.id} className="flex items-start justify-between gap-2 rounded-md border p-3">
                    <div className="min-w-0 flex-1">
                      <AppLink
                        href={p.issueDetail(b.id)}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {b.identifier}
                      </AppLink>
                      <p className="truncate text-sm text-muted-foreground">{b.title}</p>
                      <p className="text-xs text-muted-foreground">{b.team_name}</p>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      {daysOverdue}d overdue
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
