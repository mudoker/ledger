'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CloudUpload, ShieldCheck, Users, Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BillVisibility } from '@/lib/local-db/types';

interface EnableSharingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (visibility: BillVisibility) => Promise<void> | void;
  participantCount?: number;
}

export function EnableSharingModal({
  open,
  onOpenChange,
  onConfirm,
  participantCount = 0,
}: EnableSharingModalProps) {
  const [selectedVisibility, setSelectedVisibility] = useState<BillVisibility>('restricted');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setSelectedVisibility('restricted');
    }
    onOpenChange(val);
  };

  const handleFinalConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(selectedVisibility);
      handleOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-5 rounded-2xl sm:rounded-3xl bg-card border-border shadow-2xl">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mb-1">
            <CloudUpload className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground">
            Enable Cloud Sharing
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Upload to cloud to generate a shareable link.
          </DialogDescription>
        </DialogHeader>

        {/* Visibility Options */}
        <div className="space-y-2 py-1">
          {/* Option: Restricted */}
          <button
            type="button"
            onClick={() => setSelectedVisibility('restricted')}
            className={cn(
              'w-full p-3 rounded-2xl border text-left transition-all flex items-start gap-3',
              selectedVisibility === 'restricted'
                ? 'bg-primary/10 border-primary/50 shadow-sm ring-1 ring-primary/30'
                : 'bg-card border-border/70 hover:bg-muted/40'
            )}
          >
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
              <Users className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Participants Only</span>
                {selectedVisibility === 'restricted' && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Only people on this bill can view ({participantCount} participant{participantCount === 1 ? '' : 's'}).
              </p>
            </div>
          </button>

          {/* Option: Public Link */}
          <button
            type="button"
            onClick={() => setSelectedVisibility('public')}
            className={cn(
              'w-full p-3 rounded-2xl border text-left transition-all flex items-start gap-3',
              selectedVisibility === 'public'
                ? 'bg-primary/10 border-primary/50 shadow-sm ring-1 ring-primary/30'
                : 'bg-card border-border/70 hover:bg-muted/40'
            )}
          >
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0 mt-0.5">
              <Globe className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Public Link</span>
                {selectedVisibility === 'public' && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Anyone with the link can view (read-only).
              </p>
            </div>
          </button>
        </div>

        {/* Subtle Privacy Reassurance */}
        <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>Local copy stays safe. You can revoke access anytime.</span>
        </div>

        <DialogFooter className="pt-2 gap-2 flex-row justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            className="rounded-xl font-bold text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSubmitting}
            onClick={handleFinalConfirm}
            className="rounded-xl font-bold text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <span>{isSubmitting ? 'Uploading...' : 'Confirm & Share'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
