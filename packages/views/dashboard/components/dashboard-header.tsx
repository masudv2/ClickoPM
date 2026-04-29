"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";

interface DashboardHeaderProps {
  userName: string;
  cycleCount: number;
  onCycleCountChange: (count: number) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({ userName, cycleCount, onCycleCountChange }: DashboardHeaderProps) {
  const firstName = userName.split(" ")[0];

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>
      <Select value={String(cycleCount)} onValueChange={(v) => onCycleCountChange(Number(v))}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="3">Last 3 cycles</SelectItem>
          <SelectItem value="6">Last 6 cycles</SelectItem>
          <SelectItem value="12">Last 12 cycles</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
