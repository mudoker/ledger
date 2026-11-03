import { useState, useEffect, useRef, useMemo } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tag,
  MapPin,
  ArrowRight,
  ReceiptText,
  Coins,
  Folder,
  Users,
  Check,
  Crown,
  Plus,
  ChevronsUpDown,
  UtensilsCrossed,
  Coffee,
  ShoppingBag,
  Car,
  Sparkles,
} from "lucide-react";
import { CurrencyDropdown } from "@/components/shared/currency-dropdown";
import { useGroupStore } from "@/store/useGroupStore";
import { useAppSettingsStore } from "@/store/useAppSettingsStore";
import { getInitials } from "@/constants/colors";
import { cn } from "@/lib/utils";
import type { PersonData } from "@/../db/types";

export interface CreateBillFormData {
  name: string;
  location: string;
  hostName?: string;
  currency?: string;
  groupId?: string | null;
  selectedMembers?: PersonData[];
}

interface CreateBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateBillFormData) => void;
  defaultGroupId?: string | null;
  initialGroupId?: string | null;
}

const QUICK_BILL_TEMPLATES = [
  { label: 'Dinner', icon: UtensilsCrossed },
  { label: 'Coffee & Drinks', icon: Coffee },
  { label: 'Groceries', icon: ShoppingBag },
  { label: 'Transport', icon: Car },
];

export function CreateBillModal({ open, onOpenChange, onSubmit, defaultGroupId, initialGroupId }: CreateBillModalProps) {
  const defaultCurrency = useAppSettingsStore((state) => state.defaultCurrency) || 'VND';
  const effectiveGroupId = defaultGroupId || initialGroupId || 'none';
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [hostName, setHostName] = useState('');
  const [currency, setCurrency] = useState<string>(defaultCurrency);
  const [groupId, setGroupId] = useState<string>(effectiveGroupId);
  const [error, setError] = useState('');
  const { groups, fetchGroups } = useGroupStore();
  const currentGroup = useGroupStore((state) => state.currentGroup);
  const [groupMembers, setGroupMembers] = useState<PersonData[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [isHostCmdOpen, setIsHostCmdOpen] = useState(false);
  const hostCmdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hostCmdRef.current && !hostCmdRef.current.contains(e.target as Node)) {
        setIsHostCmdOpen(false);
      }
    };
    if (isHostCmdOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHostCmdOpen]);

  const isGroupLinked = groupId !== 'none' && groupMembers.length > 0;

  const selectedGroupMembers = useMemo(
    () => groupMembers.filter((m) => selectedMemberIds.has(m.id)),
    [groupMembers, selectedMemberIds]
  );

  const filteredHostCandidates = useMemo(() => {
    const q = hostName.trim().toLowerCase();
    if (!q) return selectedGroupMembers;
    return groupMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q))
    );
  }, [hostName, selectedGroupMembers, groupMembers]);

  const hasExactHostMatch = useMemo(() => {
    const q = hostName.trim().toLowerCase();
    if (!q) return false;
    return groupMembers.some((m) => m.name.trim().toLowerCase() === q);
  }, [hostName, groupMembers]);

  useEffect(() => {
    if (groupId && groupId !== 'none') {
      const selected = groups.find((g) => g.id === groupId);
      let members: PersonData[] = (selected as any)?.participants || [];
      if ((!members || members.length === 0) && currentGroup?.id === groupId) {
        members = currentGroup.participants || [];
      }

      if (!members || members.length === 0) {
        useGroupStore.getState().fetchGroup(groupId).then((g) => {
          if (g && (g as any).participants?.length) {
            setGroupMembers((g as any).participants);
            setSelectedMemberIds(new Set((g as any).participants.map((p: any) => p.id)));
          }
        }).catch(() => {});
      } else {
        setGroupMembers(members);
        setSelectedMemberIds(new Set(members.map((p) => p.id)));
      }
    } else {
      setGroupMembers([]);
      setSelectedMemberIds(new Set());
    }
  }, [groupId, groups, currentGroup]);

  useEffect(() => {
    if (open) {
      setCurrency(defaultCurrency);
      fetchGroups();
      const initial = defaultGroupId || initialGroupId;
      if (initial && initial !== 'none') {
        setGroupId(initial);
      } else {
        setGroupId('none');
      }
    }
  }, [open, defaultGroupId, initialGroupId, fetchGroups, defaultCurrency]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      setError('Please enter a bill name');
      return;
    }
    setError('');
    onSubmit({
      name: name.trim(),
      location: location.trim(),
      hostName: hostName.trim() || undefined,
      currency,
      groupId: groupId === 'none' ? null : groupId,
      selectedMembers: groupId !== 'none'
        ? groupMembers.filter((m) => selectedMemberIds.has(m.id))
        : undefined,
    });
    setName('');
    setLocation('');
    setHostName('');
    setGroupId('none');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="w-[min(calc(100vw-20px),460px)] max-h-[90vh] max-h-[90dvh] flex flex-col p-4 sm:p-6 text-foreground shadow-2xl overflow-hidden rounded-3xl border border-border/80 bg-card">
        {/* Mobile Header with Touch-Friendly Dismiss */}
        <DialogHeader className="pb-3 border-b border-border/60 shrink-0 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-xs">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold tracking-tight">
                Create New Bill
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate">
                Set up details, currency &amp; participants
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Mobile-First Form Flow (Single-column layout with comfortable touch targets) */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 py-4 pr-1">
            {/* Bill Name + Quick Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="bill-name" className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-primary" /> Bill Name <span className="text-destructive">*</span>
                </Label>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                  <Sparkles className="w-3 h-3 text-primary" /> Quick pick
                </span>
              </div>
              <Input
                id="bill-name"
                placeholder="e.g. Friday BBQ, Team Lunch..."
                value={name}
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                className="h-11 px-3.5 bg-foreground/[0.03] border-border/80 focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-semibold text-sm"
              />
              {error && (
                <p className="text-xs font-bold text-destructive pl-1">{error}</p>
              )}
              {/* Tap-Friendly Suggestions */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {QUICK_BILL_TEMPLATES.map((tpl) => {
                  const Icon = tpl.icon;
                  const isActive = name === tpl.label;
                  return (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => {
                        setName(tpl.label);
                        setError('');
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all cursor-pointer touch-manipulation active:scale-95",
                        isActive
                          ? "bg-primary/15 border-primary/40 text-primary shadow-xs"
                          : "bg-muted/40 hover:bg-muted border-border/60 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{tpl.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Currency Selector (Full-Width for comfortable flag & symbol display) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-primary" /> Currency
              </Label>
              <CurrencyDropdown
                value={currency}
                onChange={(c) => setCurrency(c)}
                variant="default"
                className="h-11"
              />
            </div>

            {/* Location (Full Width) */}
            <div className="space-y-1.5">
              <Label htmlFor="bill-location" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Venue / Location <span className="font-normal text-[11px] opacity-70">(Optional)</span>
              </Label>
              <Input
                id="bill-location"
                placeholder="e.g. Gyu-Kaku, District 1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-11 px-3.5 bg-foreground/[0.03] border-border/80 focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-medium text-xs sm:text-sm"
              />
            </div>

            {/* Group Assignment (Full Width) */}
            <div className="space-y-1.5">
              <Label htmlFor="bill-group" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-primary" /> Link to Group <span className="font-normal text-[11px] opacity-70">(Optional)</span>
              </Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger id="bill-group" className="h-11 px-3.5 bg-foreground/[0.03] border-border/80 rounded-xl font-medium text-xs sm:text-sm">
                  <SelectValue placeholder="Standalone Bill (No Group)" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl max-h-56">
                  <SelectItem value="none" className="text-xs font-medium py-2">
                    Standalone Bill (No Group)
                  </SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id} className="text-xs font-medium py-2">
                      <div className="flex items-center gap-2">
                        <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate">{g.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Host / Primary Payer (Full Width) */}
            <div className="space-y-1.5" ref={hostCmdRef}>
              <Label htmlFor="bill-host" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-500" /> Host / Primary Payer <span className="font-normal text-[11px] opacity-70">(Optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="bill-host"
                  placeholder={isGroupLinked ? "Pick member or type custom..." : "Default: You (Me)"}
                  value={hostName}
                  autoComplete="off"
                  onFocus={() => {
                    if (isGroupLinked) setIsHostCmdOpen(true);
                  }}
                  onChange={(e) => {
                    setHostName(e.target.value);
                    if (isGroupLinked) setIsHostCmdOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsHostCmdOpen(false);
                    } else if (e.key === 'Enter' && isHostCmdOpen && isGroupLinked) {
                      e.preventDefault();
                      if (filteredHostCandidates.length > 0 && !hasExactHostMatch) {
                        const first = filteredHostCandidates[0];
                        setHostName(first.name);
                        setSelectedMemberIds((prev) => new Set(prev).add(first.id));
                      }
                      setIsHostCmdOpen(false);
                    }
                  }}
                  className={cn(
                    "h-11 px-3.5 bg-foreground/[0.03] border-border/80 focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-medium text-xs sm:text-sm",
                    isGroupLinked && "pr-8"
                  )}
                />
                {isGroupLinked && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setIsHostCmdOpen((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronsUpDown className="w-4 h-4" />
                  </button>
                )}

                {isGroupLinked && isHostCmdOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 z-30 bg-popover border border-border rounded-2xl shadow-2xl p-1.5 max-h-48 overflow-y-auto overscroll-contain space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Group Members</span>
                      <span>{filteredHostCandidates.length}</span>
                    </div>

                    {filteredHostCandidates.map((m) => {
                      const isCurrentHost = hostName.trim().toLowerCase() === m.name.trim().toLowerCase();
                      const isIncluded = selectedMemberIds.has(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setHostName(m.name);
                            if (!isIncluded) {
                              setSelectedMemberIds((prev) => new Set(prev).add(m.id));
                            }
                            setIsHostCmdOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer",
                            isCurrentHost
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold"
                              : "hover:bg-muted/70 text-foreground font-medium"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                              {getInitials(m.name)}
                            </span>
                            <span className="truncate">{m.name}</span>
                          </div>
                          {isCurrentHost && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        </button>
                      );
                    })}

                    {hostName.trim().length > 0 && !hasExactHostMatch && (
                      <button
                        type="button"
                        onClick={() => {
                          setHostName(hostName.trim());
                          setIsHostCmdOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-left font-semibold text-primary hover:bg-primary/10 border-t border-border/50 mt-1 pt-2 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <span className="truncate">Set custom host: &ldquo;{hostName.trim()}&rdquo;</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Group Members Tray */}
            {groupMembers.length > 0 && (
              <div className="space-y-2.5 p-3 rounded-2xl bg-muted/20 border border-border/60">
                <div className="flex items-center justify-between text-xs px-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span>Include Members ({selectedMemberIds.size}/{groupMembers.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedMemberIds.size === groupMembers.length) {
                        setSelectedMemberIds(new Set());
                      } else {
                        setSelectedMemberIds(new Set(groupMembers.map((m) => m.id)));
                      }
                    }}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    {selectedMemberIds.size === groupMembers.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto overscroll-contain pt-0.5">
                  {groupMembers.map((m) => {
                    const isSelected = selectedMemberIds.has(m.id);
                    const isHostMatch = hostName.trim().toLowerCase() === m.name.trim().toLowerCase() && Boolean(hostName.trim());
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMemberIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 touch-manipulation",
                          isSelected
                            ? "bg-primary/15 border-primary/40 text-foreground shadow-2xs"
                            : "bg-background/80 border-border/60 text-muted-foreground opacity-60 hover:opacity-100"
                        )}
                      >
                        <span
                          className={cn(
                            "w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 transition-colors",
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isSelected ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : getInitials(m.name)}
                        </span>
                        <span className="truncate max-w-[120px]">{m.name}</span>
                        {isHostMatch && <Crown className="w-3 h-3 text-amber-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Touch-Friendly Footer */}
          <DialogFooter className="pt-3 border-t border-border/60 shrink-0 gap-2 flex-col sm:flex-row justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl font-semibold h-10 text-xs w-full sm:w-auto touch-manipulation active:scale-95 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              className="rounded-xl font-bold gap-2 px-5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md h-11 text-xs sm:text-sm w-full sm:w-auto touch-manipulation active:scale-95 order-1 sm:order-2"
            >
              <span>Continue to Bill</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
