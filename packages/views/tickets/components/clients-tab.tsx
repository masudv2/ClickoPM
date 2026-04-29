"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { clientListOptions, slaPolicyListOptions, useCreateClient, useUpdateClient, useDeleteClient } from "@multica/core/tickets";
import type { Client, CreateClientRequest } from "@multica/core/types";
import { projectListOptions } from "@multica/core/projects/queries";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@multica/ui/components/ui/select";
import { Badge } from "@multica/ui/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function CreateForm({
  onSave,
  onCancel,
  saving,
  slaPolicies,
  projects,
}: {
  onSave: (data: CreateClientRequest) => void;
  onCancel: () => void;
  saving: boolean;
  slaPolicies: { id: string; name: string }[];
  projects: { id: string; title: string }[];
}) {
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [slaPolicyId, setSlaPolicyId] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const toggleProject = (id: string) => {
    setSelectedProjects((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    const data: CreateClientRequest = {
      email: email.trim(),
      project_ids: selectedProjects,
    };
    if (companyName.trim()) data.company_name = companyName.trim();
    if (slaPolicyId) data.sla_policy_id = slaPolicyId;
    onSave(data);
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label>Email *</Label>
        <Input
          type="email"
          placeholder="client@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label>Company name</Label>
        <Input
          placeholder="Acme Inc."
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>SLA Policy</Label>
        <Select value={slaPolicyId} onValueChange={(v) => { if (v) setSlaPolicyId(v); }}>
          <SelectTrigger>
            <SelectValue placeholder="None">{() => slaPolicies.find((p) => p.id === slaPolicyId)?.name ?? "None"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {slaPolicies.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {projects.length > 0 && (
        <div className="space-y-1.5">
          <Label>Project access</Label>
          <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
            {projects.map((proj) => (
              <label key={proj.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedProjects.includes(proj.id)}
                  onChange={() => toggleProject(proj.id)}
                  className="accent-primary"
                />
                {proj.title}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={!email.trim() || saving} onClick={handleSubmit}>
          {saving ? "Adding..." : "Add client"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function EditForm({
  client,
  onSave,
  onCancel,
  saving,
  slaPolicies,
}: {
  client: Client;
  onSave: (data: { id: string; company_name?: string; sla_policy_id?: string }) => void;
  onCancel: () => void;
  saving: boolean;
  slaPolicies: { id: string; name: string }[];
}) {
  const [companyName, setCompanyName] = useState(client.company_name ?? "");
  const [slaPolicyId, setSlaPolicyId] = useState(client.sla_policy_id ?? "");

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label>Company name</Label>
        <Input
          placeholder="Acme Inc."
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label>SLA Policy</Label>
        <Select value={slaPolicyId} onValueChange={(v) => { if (v) setSlaPolicyId(v); }}>
          <SelectTrigger>
            <SelectValue placeholder="None">{() => slaPolicies.find((p) => p.id === slaPolicyId)?.name ?? "None"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {slaPolicies.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => {
            onSave({
              id: client.id,
              company_name: companyName.trim() || undefined,
              sla_policy_id: slaPolicyId || undefined,
            });
          }}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ClientsTab() {
  const wsId = useWorkspaceId();
  const { data: clients = [] } = useQuery(clientListOptions(wsId));
  const { data: slaPolicies = [] } = useQuery(slaPolicyListOptions(wsId));
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Clients</h2>
          <p className="text-sm text-muted-foreground">Manage external clients who submit support tickets.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
          <Plus className="size-4 mr-1" /> Add client
        </Button>
      </div>

      {showCreate && (
        <div className="mb-4">
          <CreateForm
            saving={createClient.isPending}
            slaPolicies={slaPolicies}
            projects={projects}
            onSave={(data) => {
              createClient.mutate(data, {
                onSuccess: () => { setShowCreate(false); toast.success("Client added"); },
                onError: () => toast.error("Failed to add client"),
              });
            }}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      <div className="space-y-1">
        {clients.map((client) => {
          if (editingId === client.id) {
            return (
              <EditForm
                key={client.id}
                client={client}
                slaPolicies={slaPolicies}
                saving={updateClient.isPending}
                onSave={(data) => {
                  updateClient.mutate(data, {
                    onSuccess: () => { setEditingId(null); toast.success("Client updated"); },
                    onError: () => toast.error("Failed to update client"),
                  });
                }}
                onCancel={() => setEditingId(null)}
              />
            );
          }
          return (
            <div
              key={client.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-2.5 group hover:bg-accent/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{client.user_name}</span>
                  <span className="text-xs text-muted-foreground truncate">{client.user_email}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {client.company_name && (
                    <span className="text-xs text-muted-foreground">{client.company_name}</span>
                  )}
                  {client.company_name && client.sla_policy_name && (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                  {client.sla_policy_name && (
                    <Badge variant="secondary" className="text-xs">{client.sla_policy_name}</Badge>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(client.created_at)}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingId(client.id)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => {
                    deleteClient.mutate(client.id, {
                      onSuccess: () => toast.success("Client deleted"),
                      onError: () => toast.error("Failed to delete client"),
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {clients.length === 0 && !showCreate && (
          <p className="text-sm text-muted-foreground py-8 text-center">No clients yet. Add one to get started.</p>
        )}
      </div>
    </div>
  );
}
