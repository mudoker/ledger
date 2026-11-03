'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Tag, AlignLeft, ArrowRight, Coins, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGroupStore } from "@/store/useGroupStore";
import { CurrencyDropdown } from "@/components/shared/currency-dropdown";
import type { BillGroupDetail } from '@/../db/types';

interface EditGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: BillGroupDetail;
  onSuccess?: () => void;
}

export function EditGroupModal({ open, onOpenChange, group, onSuccess }: EditGroupModalProps) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [currency, setCurrency] = useState(group.currency || 'VND');
  const [visibility, setVisibility] = useState<'public' | 'restricted'>(group.visibility || 'public');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateGroup } = useGroupStore();

  useEffect(() => {
    if (open) {
      setName(group.name);
      setDescription(group.description || '');
      setCurrency(group.currency || 'VND');
      setVisibility(group.visibility || 'public');
      setError('');
    }
  }, [open, group]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      setError('Group name cannot be empty');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await updateGroup(group.id, {
        name: name.trim(),
        description: description.trim() || null,
        currency,
        visibility,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update group';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="w-[calc(100vw-24px)] sm:w-full max-w-md max-h-[88vh] max-h-[88dvh] flex flex-col p-4 sm:p-5 text-foreground shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 bg-card">
        <DialogHeader className="pb-3 border-b border-border/60 shrink-0 text-left">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Settings2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold tracking-tight">
                Edit Group Details
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground truncate">
                Update title, description, currency and visibility
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-3.5 py-3.5 pr-0.5">
            {/* Group Name Input */}
            <div className="space-y-1">
              <Label htmlFor="edit-group-name" className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-primary" /> Group Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-group-name"
                value={name}
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                className="h-9 bg-background/60 border-border/80 focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-semibold text-xs"
              />
              {error && (
                <p className="text-[11px] font-bold text-destructive pl-1">{error}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label htmlFor="edit-group-desc" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlignLeft className="w-3 h-3" /> Description <span className="font-normal text-[10px] opacity-70">(Opt)</span>
              </Label>
              <Input
                id="edit-group-desc"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-10 bg-background/60 border-border/80 focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-medium text-xs"
              />
            </div>

            {/* Currency */}
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="w-3 h-3 text-primary" /> Group Currency
              </Label>
              <CurrencyDropdown
                value={currency}
                onChange={(c) => setCurrency(c)}
                variant="default"
                className="h-10 w-full"
              />
            </div>

            {/* Visibility Selector */}
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-primary" /> Group Visibility &amp; Access
              </Label>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={cn(
                    "flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer active:scale-98",
                    visibility === 'public'
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-2xs"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Globe className={cn("w-3.5 h-3.5", visibility === 'public' ? "text-primary" : "text-muted-foreground")} />
                    <span>Public Link</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                    Anyone with link can view group &amp; bills
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('restricted')}
                  className={cn(
                    "flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer active:scale-98",
                    visibility === 'restricted'
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-2xs"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Lock className={cn("w-3.5 h-3.5", visibility === 'restricted' ? "text-primary" : "text-muted-foreground")} />
                    <span>Members Only</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                    Only registered participants can access
                  </span>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/60 gap-2 shrink-0 flex-row justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl font-semibold h-9 text-xs px-3 touch-manipulation active:scale-95"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="rounded-xl font-semibold gap-1.5 px-4 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm h-9 text-xs touch-manipulation active:scale-95"
            >
              <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
