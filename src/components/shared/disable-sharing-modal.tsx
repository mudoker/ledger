'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Trash2, ShieldCheck } from 'lucide-react';

interface DisableSharingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  isRevoking?: boolean;
}

export function DisableSharingModal({
  open,
  onOpenChange,
  onConfirm,
  isRevoking = false,
}: DisableSharingModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 rounded-2xl sm:rounded-3xl bg-card border-border shadow-2xl">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center mb-1">
            <Trash2 className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground">
            Disable Cloud Sharing?
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            This will delete the cloud copy and revoke access for all shared links.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-1 px-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>Your local bill and items remain safely saved on this device.</span>
        </div>

        <DialogFooter className="pt-2 gap-2 flex-row justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isRevoking}
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isRevoking}
            onClick={onConfirm}
            className="rounded-xl font-bold text-xs gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{isRevoking ? 'Revoking...' : 'Disable Sharing'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
