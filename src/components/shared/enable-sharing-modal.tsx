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
import { CloudUpload, ShieldCheck, Users, Globe, Lock, ArrowRight, Check } from 'lucide-react';
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
  const [step, setStep] = useState<'consent' | 'visibility'>('consent');
  const [selectedVisibility, setSelectedVisibility] = useState<BillVisibility>('restricted');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setStep('consent');
      setSelectedVisibility('restricted');
    }
    onOpenChange(val);
  };

  const handleContinueToVisibility = () => {
    setStep('visibility');
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
        {step === 'consent' ? (
          <>
            <DialogHeader className="space-y-2 text-left">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mb-1">
                <CloudUpload className="w-5 h-5" />
              </div>
              <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground">
                Enable Cloud Sharing
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                By default, this bill is stored only on this device. Enabling sharing uploads it to Ledger&apos;s cloud backend.
              </DialogDescription>
            </DialogHeader>

            {/* Explanatory Points */}
            <div className="space-y-2.5 py-2">
              <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/70 space-y-2 text-xs">
                <div className="flex items-start gap-2.5 text-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>The bill items, split allocations, and participant details will be uploaded to Ledger cloud.</span>
                </div>
                <div className="flex items-start gap-2.5 text-foreground">
                  <Lock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <span>The bill becomes accessible only according to your selected visibility settings.</span>
                </div>
                <div className="flex items-start gap-2.5 text-foreground">
                  <Users className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>You can disable sharing at any time to delete the cloud copy and revoke all external links.</span>
                </div>
              </div>
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
                onClick={handleContinueToVisibility}
                className="rounded-xl font-bold text-xs gap-1.5 bg-foreground text-background hover:bg-foreground/90 shadow-sm"
              >
                <span>Continue to Permissions</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground">
                Choose Access Visibility
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                Select who can view this bill once uploaded.
              </DialogDescription>
            </DialogHeader>

            {/* Visibility Options */}
            <div className="space-y-2.5 py-2">
              {/* Option B: Restricted */}
              <button
                type="button"
                onClick={() => setSelectedVisibility('restricted')}
                className={cn(
                  'w-full p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3',
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
                    <span className="text-xs font-bold text-foreground">Restricted (Participants Only)</span>
                    {selectedVisibility === 'restricted' && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Only authorized participants on this bill can view it ({participantCount} participant{participantCount === 1 ? '' : 's'}). Anyone else with the link is denied.
                  </p>
                </div>
              </button>

              {/* Option C: Public Link */}
              <button
                type="button"
                onClick={() => setSelectedVisibility('public')}
                className={cn(
                  'w-full p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3',
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
                    <span className="text-xs font-bold text-foreground">Public Link (Read-Only)</span>
                    {selectedVisibility === 'public' && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Anyone possessing the link can view the bill without logging in. Editing is strictly disabled.
                  </p>
                </div>
              </button>
            </div>

            <DialogFooter className="pt-2 gap-2 flex-row justify-between sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('consent')}
                disabled={isSubmitting}
                className="rounded-xl font-bold text-xs"
              >
                Back
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
