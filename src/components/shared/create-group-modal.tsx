'use client';

import { useState } from 'react';
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
import { FolderPlus, Tag, AlignLeft, ArrowRight, Coins, Sparkles, Palmtree, UtensilsCrossed, Home, Plane, PartyPopper } from "lucide-react";
import { useGroupStore } from "@/store/useGroupStore";
import { useAppSettingsStore } from "@/store/useAppSettingsStore";
import { CurrencyDropdown } from "@/components/shared/currency-dropdown";
import type { BillGroupDetail } from '@/../db/types';

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (group: BillGroupDetail) => void;
}

const TEMPLATE_SUGGESTIONS = [
  { name: 'Summer Vacation', icon: Palmtree },
  { name: 'Food & Dinners', icon: UtensilsCrossed },
  { name: 'Roommates / Rent', icon: Home },
  { name: 'Roadtrip 2026', icon: Plane },
  { name: 'Party Expenses', icon: PartyPopper },
];

export function CreateGroupModal({ open, onOpenChange, onCreated }: CreateGroupModalProps) {
  const defaultCurrency = useAppSettingsStore((state) => state.defaultCurrency) || 'VND';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createGroup } = useGroupStore();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      setError('Please enter a group name');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const group = await createGroup(name.trim(), description.trim() || null, currency);
      setName('');
      setDescription('');
      onOpenChange(false);
      onCreated?.(group);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create group';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="w-[calc(100vw-28px)] sm:w-full max-w-md max-h-[86vh] max-h-[86dvh] flex flex-col p-4 sm:p-6 text-foreground shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 bg-card">
        <DialogHeader className="space-y-1.5 text-left pb-3.5 border-b border-border/60 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-1">
            <FolderPlus className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight">
            Create Bill Group
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Aggregate multiple bills into an organized trip, vacation, or household overview.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 py-3.5 pr-0.5">
            {/* Quick Inspiration Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" /> Quick Suggestions
              </span>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_SUGGESTIONS.map((template) => {
                  const Icon = template.icon;
                  return (
                    <button
                      key={template.name}
                      type="button"
                      onClick={() => {
                        setName(template.name);
                        setError('');
                      }}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-all border border-border/50 cursor-pointer active:scale-95"
                    >
                      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{template.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group Name Input */}
            <div className="space-y-1 sm:space-y-1.5">
              <Label htmlFor="group-name" className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-primary" /> Group Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="group-name"
                placeholder="e.g. Da Nang Trip, Roommates Q4"
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
            <div className="space-y-1 sm:space-y-1.5">
              <Label htmlFor="group-desc" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlignLeft className="w-3.5 h-3.5" /> Description (Optional)
              </Label>
              <Input
                id="group-desc"
                placeholder="e.g. Flight, hotel & shared restaurant expenses"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-10 bg-foreground/[0.03] border-border focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-medium text-xs"
              />
            </div>

            {/* Currency Selector Dropdown */}
            <div className="space-y-1 sm:space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" /> Group Currency
              </Label>
              <CurrencyDropdown
                value={currency}
                onChange={(c) => setCurrency(c)}
                variant="default"
              />
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
              <span>{isSubmitting ? 'Creating...' : 'Create Group'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
