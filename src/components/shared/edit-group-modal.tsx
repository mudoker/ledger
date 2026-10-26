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
import { Settings2, Tag, AlignLeft, ArrowRight, Coins } from "lucide-react";
import { useGroupStore } from "@/store/useGroupStore";
import type { BillGroupDetail } from '@/../db/types';

interface EditGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: BillGroupDetail;
  onSuccess?: () => void;
}

const CURRENCIES = ['VND', 'USD', 'EUR', 'SGD', 'JPY'];

export function EditGroupModal({ open, onOpenChange, group, onSuccess }: EditGroupModalProps) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [currency, setCurrency] = useState(group.currency || 'VND');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateGroup } = useGroupStore();

  useEffect(() => {
    if (open) {
      setName(group.name);
      setDescription(group.description || '');
      setCurrency(group.currency || 'VND');
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
      <DialogContent showClose={false} className="w-[calc(100vw-28px)] sm:w-full max-w-md max-h-[86vh] max-h-[86dvh] flex flex-col p-4 sm:p-6 text-foreground shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 bg-card">
        <DialogHeader className="space-y-1.5 text-left pb-3.5 border-b border-border/60 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-foreground/5 border border-border flex items-center justify-center text-foreground mb-1">
            <Settings2 className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight">
            Edit Group Details
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Only the group owner can update this group&apos;s title, description, and currency.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 py-3.5 pr-0.5">
            {/* Group Name Input */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-group-name" className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-primary" /> Group Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-group-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                className="h-10 bg-foreground/[0.03] border-border focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-medium text-xs"
                autoFocus
              />
              {error && (
                <p className="text-[11px] font-bold text-destructive pl-1">{error}</p>
              )}
            </div>

            {/* Description Input */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-group-desc" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlignLeft className="w-3.5 h-3.5" /> Description
              </Label>
              <Input
                id="edit-group-desc"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-10 bg-foreground/[0.03] border-border focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-medium text-xs"
              />
            </div>

            {/* Currency Selector Chips */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" /> Group Currency
              </Label>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {CURRENCIES.map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setCurrency(curr)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      currency === curr
                        ? 'bg-foreground text-background border-foreground shadow-xs'
                        : 'border-border/70 hover:border-foreground/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/60 gap-2 shrink-0 flex-row justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-xs font-bold rounded-xl h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="gap-1.5 text-xs font-bold rounded-xl h-9 px-4 bg-foreground text-background hover:bg-foreground/90 shadow-sm"
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
