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
import {
  FolderPlus,
  Tag,
  AlignLeft,
  ArrowRight,
  Coins,
  Sparkles,
  Palmtree,
  UtensilsCrossed,
  Home,
  Plane,
  PartyPopper,
  Globe,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  { name: 'Vacation', icon: Palmtree },
  { name: 'Food & Dinners', icon: UtensilsCrossed },
  { name: 'Roommates', icon: Home },
  { name: 'Roadtrip', icon: Plane },
  { name: 'Party', icon: PartyPopper },
];

export function CreateGroupModal({ open, onOpenChange, onCreated }: CreateGroupModalProps) {
  const defaultCurrency = useAppSettingsStore((state) => state.defaultCurrency) || 'VND';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [visibility, setVisibility] = useState<'public' | 'restricted'>('public');
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
      const group = await createGroup(name.trim(), description.trim() || null, currency, visibility);
      setName('');
      setDescription('');
      setVisibility('public');
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
      <DialogContent showClose={false} className="w-[calc(100vw-24px)] sm:w-full max-w-md max-h-[88vh] max-h-[88dvh] flex flex-col p-4 sm:p-5 text-foreground shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 bg-card">
        <DialogHeader className="pb-3 border-b border-border/60 shrink-0 text-left">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold tracking-tight">
                Create Bill Group
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground truncate">
                Track shared events, trips, or household expenses
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-3.5 py-3.5 pr-0.5">
            {/* Quick Inspiration Chips */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="group-name" className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-primary" /> Group Name <span className="text-destructive">*</span>
                </Label>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-primary" /> Suggestions
                </span>
              </div>
              <Input
                id="group-name"
                placeholder="e.g. Da Nang Trip, Roommates Q4..."
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
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {TEMPLATE_SUGGESTIONS.map((template) => {
                  const Icon = template.icon;
                  const isActive = name === template.name;
                  return (
                    <button
                      key={template.name}
                      type="button"
                      onClick={() => {
                        setName(template.name);
                        setError('');
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all cursor-pointer active:scale-95",
                        isActive
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-muted/40 hover:bg-muted border-border/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="w-3 h-3 text-primary shrink-0" />
                      <span>{template.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label htmlFor="group-desc" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlignLeft className="w-3 h-3" /> Description <span className="font-normal text-[10px] opacity-70">(Opt)</span>
              </Label>
              <Input
                id="group-desc"
                placeholder="e.g. Hotel & restaurants"
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
              <span>{isSubmitting ? 'Creating...' : 'Create Group'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
