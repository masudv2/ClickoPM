"use client";

import { useState } from "react";
import { useInviteTeammate } from "@multica/core/tickets";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@multica/ui/components/ui/dialog";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { UserPlus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PortalInviteDialog({ open, onOpenChange }: Props) {
  const invite = useInviteTeammate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    invite.mutate(trimmed, {
      onSuccess: () => {
        setSent(true);
        setTimeout(() => {
          setEmail("");
          setSent(false);
          onOpenChange(false);
        }, 1500);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            Invite Teammate
          </DialogTitle>
          <DialogDescription>
            Invite a colleague to your company's support portal. They'll be able to create and view
            tickets for the same projects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            {sent ? (
              <span className="text-sm text-green-400">Invitation sent!</span>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!email.trim() || invite.isPending}
              >
                {invite.isPending ? "Sending..." : "Send Invite"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
