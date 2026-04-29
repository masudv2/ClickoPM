import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { slaPolicyListOptions, useCreateSLAPolicy, useUpdateSLAPolicy, useDeleteSLAPolicy } from "@multica/core/tickets";
import type { SLAPolicy, CreateSLAPolicyRequest } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@multica/ui/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";

const PRIORITIES = ["critical", "high", "normal", "low"] as const;
type Priority = (typeof PRIORITIES)[number];

const COLUMNS = [
  { key: "first_response", label: "First Response" },
  { key: "update_interval", label: "Update Interval" },
  { key: "resolution", label: "Resolution" },
] as const;

type FormData = {
  name: string;
  support_hours: string;
  times: Record<Priority, Record<string, string>>;
};

function emptyFormData(): FormData {
  const times = {} as FormData["times"];
  for (const p of PRIORITIES) {
    times[p] = { first_response: "", update_interval: "", resolution: "" };
  }
  return { name: "", support_hours: "24/7", times };
}

function policyToFormData(policy: SLAPolicy): FormData {
  const times = {} as FormData["times"];
  for (const p of PRIORITIES) {
    times[p] = {
      first_response: minutesToHoursStr(policy[`${p}_first_response` as keyof SLAPolicy] as number | null),
      update_interval: minutesToHoursStr(policy[`${p}_update_interval` as keyof SLAPolicy] as number | null),
      resolution: minutesToHoursStr(policy[`${p}_resolution` as keyof SLAPolicy] as number | null),
    };
  }
  return { name: policy.name, support_hours: policy.support_hours, times };
}

function formDataToRequest(form: FormData): CreateSLAPolicyRequest {
  const req: CreateSLAPolicyRequest = {
    name: form.name,
    support_hours: form.support_hours,
  };
  for (const p of PRIORITIES) {
    for (const col of COLUMNS) {
      const val = form.times[p]![col.key] ?? "";
      const minutes = hoursStrToMinutes(val);
      if (minutes !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any)[`${p}_${col.key}`] = minutes;
      }
    }
  }
  return req;
}

function minutesToHoursStr(minutes: number | null): string {
  if (minutes == null) return "";
  return String(minutes / 60);
}

function hoursStrToMinutes(val: string): number | undefined {
  if (!val.trim()) return undefined;
  const n = parseFloat(val);
  if (isNaN(n) || n < 0) return undefined;
  return Math.round(n * 60);
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return "-";
  const h = minutes / 60;
  return h === 1 ? "1 hr" : `${h} hrs`;
}

function PolicyForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial: FormData;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<FormData>(initial);

  function setTime(priority: Priority, col: string, value: string) {
    setForm((prev) => ({
      ...prev,
      times: {
        ...prev.times,
        [priority]: { ...prev.times[priority], [col]: value },
      },
    }));
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sla-name">Policy Name</Label>
            <Input
              id="sla-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Enterprise SLA"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-hours">Support Hours</Label>
            <Input
              id="sla-hours"
              value={form.support_hours}
              onChange={(e) => setForm((f) => ({ ...f, support_hours: e.target.value }))}
              placeholder="e.g. 24/7 or business_hours"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-4 text-left font-medium">Priority</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="px-2 py-2 text-left font-medium">
                    {col.label} (hrs)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PRIORITIES.map((p) => (
                <tr key={p} className="border-b border-border/50">
                  <td className="py-2 pr-4 capitalize font-medium">{p}</td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="h-8 w-24"
                        value={form.times[p][col.key]}
                        onChange={(e) => setTime(p, col.key, e.target.value)}
                        placeholder="-"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            size="sm"
            disabled={!form.name.trim() || isPending}
            onClick={() => onSubmit(form)}
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PolicyCard({
  policy,
  onEdit,
  onDelete,
  isDeleting,
}: {
  policy: SLAPolicy;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-medium">{policy.name}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Support hours: {policy.support_hours}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1.5 pr-4 text-left font-medium">Priority</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-2 py-1.5 text-left font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((p) => (
              <tr key={p} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-4 capitalize font-medium">{p}</td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-2 py-1.5 text-muted-foreground">
                    {formatHours(policy[`${p}_${col.key}` as keyof SLAPolicy] as number | null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function SLAPoliciesTab() {
  const wsId = useWorkspaceId();
  const { data: policies = [] } = useQuery(slaPolicyListOptions(wsId));
  const createMutation = useCreateSLAPolicy();
  const updateMutation = useUpdateSLAPolicy();
  const deleteMutation = useDeleteSLAPolicy();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleCreate(form: FormData) {
    createMutation.mutate(formDataToRequest(form), {
      onSuccess: () => setShowCreate(false),
    });
  }

  function handleUpdate(id: string, form: FormData) {
    updateMutation.mutate(
      { id, ...formDataToRequest(form) },
      { onSuccess: () => setEditingId(null) },
    );
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">SLA Policies</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define response and resolution time targets by priority level.
          </p>
        </div>
        {!showCreate && (
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Policy
          </Button>
        )}
      </div>

      {showCreate && (
        <PolicyForm
          initial={emptyFormData()}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          isPending={createMutation.isPending}
        />
      )}

      {policies.length === 0 && !showCreate && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No SLA policies yet. Create one to set response time targets.
        </p>
      )}

      <div className="space-y-3">
        {policies.map((policy) =>
          editingId === policy.id ? (
            <PolicyForm
              key={policy.id}
              initial={policyToFormData(policy)}
              onSubmit={(form) => handleUpdate(policy.id, form)}
              onCancel={() => setEditingId(null)}
              isPending={updateMutation.isPending}
            />
          ) : (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onEdit={() => setEditingId(policy.id)}
              onDelete={() => handleDelete(policy.id)}
              isDeleting={deleteMutation.isPending}
            />
          ),
        )}
      </div>
    </div>
  );
}
