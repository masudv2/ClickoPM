"use client";

import { useState } from "react";
import { Button } from "@multica/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@multica/ui/components/ui/dialog";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { useCreateMilestone, useUpdateMilestone } from "@multica/core/milestones";
import { toast } from "sonner";
import type { Milestone } from "@multica/core/types";

export function MilestoneFormDialog({
  open,
  onOpenChange,
  projectId,
  milestone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  milestone?: Milestone;
}) {
  const [name, setName] = useState(milestone?.name ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [startDate, setStartDate] = useState(milestone?.start_date ?? "");
  const [targetDate, setTargetDate] = useState(milestone?.target_date ?? "");

  const createMutation = useCreateMilestone(projectId);
  const updateMutation = useUpdateMilestone();
  const isEdit = !!milestone;
  const pending = createMutation.isPending || updateMutation.isPending;

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: milestone.id,
          name: name.trim(),
          description: description || null,
          start_date: startDate || null,
          target_date: targetDate || null,
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description || null,
          start_date: startDate || null,
          target_date: targetDate || null,
        });
      }
      onOpenChange(false);
    } catch {
      toast.error("Failed to save milestone");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit milestone" : "New milestone"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ms-name">Name</Label>
            <Input
              id="ms-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Discovery & Technical Research"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="ms-desc">Description</Label>
            <Textarea
              id="ms-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ms-start">Start date</Label>
              <Input id="ms-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ms-target">Target date</Label>
              <Input id="ms-target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
