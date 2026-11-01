'use client';

import { Button } from '@/components/ui/button';
import { AppLogo } from '@/components/shared/app-logo';
import { ShieldAlert, ArrowLeft, Home, Lock } from 'lucide-react';

interface UnavailableBillPageProps {
  onGoHome: () => void;
  message?: string;
}

export function UnavailableBillPage({ onGoHome, message }: UnavailableBillPageProps) {
  return (
    <div className="flex-1 min-h-[90vh] flex flex-col items-center justify-center p-4 bg-background text-foreground text-center">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Top Icon */}
        <div className="mx-auto w-16 h-16 rounded-3xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shadow-lg shadow-destructive/10">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
            Shared Bill Unavailable
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {message || 'This shared bill is no longer accessible. It may have been revoked by the owner, switched to private local-only mode, or permanently deleted.'}
          </p>
        </div>

        {/* Security / Privacy Guarantee Banner */}
        <div className="p-3.5 bg-muted/40 border border-border/80 rounded-2xl flex items-center gap-3 text-left">
          <Lock className="w-4 h-4 text-primary shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-normal">
            Ledger enforces strict document-level access revocation. Revoked or private resources cannot be inspected or retrieved.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <Button
            onClick={onGoHome}
            className="w-full h-11 rounded-2xl bg-foreground text-background hover:bg-foreground/90 font-bold text-xs sm:text-sm gap-2 shadow-sm"
          >
            <Home className="w-4 h-4" />
            Return to Ledger
          </Button>
        </div>
      </div>
    </div>
  );
}
