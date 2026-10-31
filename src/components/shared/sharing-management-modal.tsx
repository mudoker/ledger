'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  Users,
  Globe,
  Trash2,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BillVisibility, LocalPerson } from '@/lib/local-db/types';

interface SharingManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibility: BillVisibility;
  shareUrl: string;
  people: LocalPerson[];
  onToggleVisibility: (newVisibility: BillVisibility) => Promise<void> | void;
  onRequestDisableSharing: () => void;
  isUpdatingVisibility?: boolean;
}

export function SharingManagementModal({
  open,
  onOpenChange,
  visibility,
  shareUrl,
  people,
  onToggleVisibility,
  onRequestDisableSharing,
  isUpdatingVisibility = false,
}: SharingManagementModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 rounded-2xl sm:rounded-3xl bg-card border-border shadow-2xl space-y-4">
        <DialogHeader className="space-y-1 text-left pb-2 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <span
              className={cn(
                'text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border',
                visibility === 'public'
                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                  : 'bg-primary/10 text-primary border-primary/20'
              )}
            >
              {visibility === 'public' ? 'Public Link Access' : 'Restricted to Participants'}
            </span>
          </div>
          <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground pt-1">
            Sharing & Permissions
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Manage who can view this shared bill and control public access.
          </DialogDescription>
        </DialogHeader>

        {/* Copy Link Section */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Button
              onClick={handleCopy}
              className={cn(
                'flex-1 h-10 rounded-xl font-bold text-xs gap-2 transition-all',
                copied
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-foreground text-background hover:bg-foreground/90'
              )}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" /> Link Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copy Share Link
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.open(shareUrl, '_blank')}
              className="h-10 w-10 rounded-xl border-border hover:bg-muted"
              title="Open preview in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {visibility === 'public'
              ? 'Anyone with this link can view the bill read-only.'
              : 'Only listed participants can view when logged in.'}
          </p>
        </div>

        {/* Visibility Mode Switcher */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Access Mode
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isUpdatingVisibility}
              onClick={() => onToggleVisibility('restricted')}
              className={cn(
                'p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1',
                visibility === 'restricted'
                  ? 'bg-primary/15 border-primary/50 text-foreground ring-1 ring-primary/30'
                  : 'bg-muted/30 border-border/60 hover:bg-muted text-muted-foreground'
              )}
            >
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold">Restricted</span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">Participants only</span>
            </button>

            <button
              type="button"
              disabled={isUpdatingVisibility}
              onClick={() => onToggleVisibility('public')}
              className={cn(
                'p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1',
                visibility === 'public'
                  ? 'bg-blue-500/15 border-blue-500/50 text-foreground ring-1 ring-blue-500/30'
                  : 'bg-muted/30 border-border/60 hover:bg-muted text-muted-foreground'
              )}
            >
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-bold">Public Link</span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">Anyone with link</span>
            </button>
          </div>
        </div>

        {/* Authorized Participants List */}
        {visibility === 'restricted' && (
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Lock className="w-3 h-3 text-primary" /> Whitelisted Participants ({people.length})
            </span>
            <div className="max-h-32 overflow-y-auto space-y-1 p-2 rounded-xl bg-muted/30 border border-border/50">
              {people.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs py-1 px-1.5">
                  <span className="font-bold text-foreground">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">{p.email || 'Local Participant'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disable Sharing Destructive Action */}
        <div className="pt-3 border-t border-border/60 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-destructive">Revoke Access</span>
            <p className="text-[10px] text-muted-foreground">Delete cloud copy & keep local records</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={onRequestDisableSharing}
            className="rounded-xl font-bold text-xs gap-1.5 h-8 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Disable Sharing</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
