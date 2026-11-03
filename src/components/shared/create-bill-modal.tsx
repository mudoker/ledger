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
import { Tag, MapPin, User, ArrowRight, ReceiptText, Coins, Folder, Users, Check, Crown, Plus, ChevronsUpDown } from "lucide-react";
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
      <DialogContent showClose={false} className="w-[calc(100vw-28px)] sm:w-full max-w-md max-h-[86vh] max-h-[86dvh] flex flex-col p-4 sm:p-6 text-foreground shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card">
        <DialogHeader className="space-y-1 text-left pb-3 border-b border-border/60 shrink-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-foreground/5 border border-border flex items-center justify-center text-foreground mb-0.5">
            <ReceiptText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight">
            Create New Bill
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Set up bill details and currency to get started.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-3.5 py-3 pr-0.5">
            <div className="space-y-1 sm:space-y-1.5">
              <Label htmlFor="bill-name" className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" /> Bill Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bill-name"
                placeholder="e.g. Friday BBQ, Team Lunch"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                className="h-9 bg-foreground/[0.03] border-border focus-visible:ring-1 focus-visible:ring-foreground/20 rounded-xl font-medium text-xs"
              />
              {error && (
                <p className="text-[11px] font-bold text-destructive pl-1">{error}</p>
              )}
            </div>

            <div className="space-y-1 sm:space-y-1.5">
              <Label htmlFor="bill-location" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Venue / Location (Optional)
              </Label>
              <Input
                id="bill-location"
                placeholder="e.g. Gyu-Kaku, District 1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-9 bg-foreground/[0.03] border-border focus-visible:ring-1 focus-visible:ring-foreground/20 rounded-xl font-medium text-xs"
              />
            </div>

            <div className="space-y-1 sm:space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" /> Currency
              </Label>
              <CurrencyDropdown
                value={currency}
                onChange={(c) => setCurrency(c)}
                variant="default"
              />
            </div>

            <div className="space-y-1 sm:space-y-1.5">
              <Label htmlFor="bill-group" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-primary" /> Link to Group (Optional)
              </Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger id="bill-group" className="h-9 bg-foreground/[0.03] border-border rounded-xl font-medium text-xs">
                  <SelectValue placeholder="No Group (Standalone Bill)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Group (Standalone Bill)</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{g.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground/70 pl-1">
                Adds this bill into a group overview. Can also be updated later in Settings.
              </p>
            </div>

            {groupMembers.length > 0 && (
              <div className="space-y-2 p-3 rounded-2xl bg-muted/20 border border-border/60">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span>Include Group Members ({selectedMemberIds.size}/{groupMembers.length})</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedMemberIds.size === groupMembers.length) {
                        setSelectedMemberIds(new Set());
                      } else {
                        setSelectedMemberIds(new Set(groupMembers.map((m) => m.id)));
                      }
                    }}
                    className="h-6 text-[11px] font-semibold text-primary hover:bg-primary/10 px-2 rounded-lg"
                  >
                    {selectedMemberIds.size === groupMembers.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="max-h-36 overflow-y-auto overscroll-contain space-y-1 pr-1 pt-1">
                  {groupMembers.map((m) => {
                    const isSelected = selectedMemberIds.has(m.id);
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
                          "w-full flex items-center gap-2.5 p-2 rounded-xl border transition-colors cursor-pointer select-none text-xs text-left",
                          isSelected
                            ? "bg-primary/5 border-primary/30 text-foreground"
                            : "bg-muted/10 border-border/50 text-muted-foreground hover:bg-muted/20"
                        )}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-primary/50 bg-background"
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="font-semibold text-foreground truncate">{m.name}</span>
                        {m.email && (
                          <span className="text-[10px] text-muted-foreground truncate">({m.email})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1 sm:space-y-1.5" ref={hostCmdRef}>
              <Label htmlFor="bill-host" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-500" /> Host / Payer (Optional)
              </Label>
              <div className="relative">
                <Input
                  id="bill-host"
                  placeholder={
                    isGroupLinked
                      ? "Search group members or type new host..."
                      : "e.g. Alex"
                  }
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
                    "h-9 bg-foreground/[0.03] border-border focus-visible:ring-1 focus-visible:ring-foreground/20 rounded-xl font-medium text-xs",
                    isGroupLinked && "pr-8"
                  )}
                />
                {isGroupLinked && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setIsHostCmdOpen((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </button>
                )}

                {isGroupLinked && isHostCmdOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-1.5 z-30 bg-popover border border-border rounded-2xl shadow-2xl p-1.5 max-h-48 overflow-y-auto overscroll-contain space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Select Payer from Group</span>
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
                            "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs text-left transition-colors cursor-pointer",
                            isCurrentHost
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold"
                              : "hover:bg-muted/70 text-foreground font-medium"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                              {getInitials(m.name)}
                            </span>
                            <div className="min-w-0">
                              <span className="block truncate">{m.name}</span>
                              {m.email && (
                                <span className="block text-[10px] text-muted-foreground truncate">{m.email}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isIncluded && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                + Include
                              </span>
                            )}
                            {isCurrentHost && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                          </div>
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
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left font-semibold text-primary hover:bg-primary/10 border-t border-border/50 mt-1 pt-2 transition-colors cursor-pointer"
                      >
                        <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                          <Plus className="w-3 h-3" />
                        </span>
                        <span className="truncate">
                          Create new host: <strong className="text-foreground">"{hostName.trim()}"</strong>
                        </span>
                      </button>
                    )}

                    {filteredHostCandidates.length === 0 && !hostName.trim() && (
                      <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
                        No group members selected above. Type a name to create a new host.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/70 pl-1">
                {isGroupLinked
                  ? "Pick an inherited group member or type a new name to create the primary payer."
                  : "Creates the first participant and sets them as the primary payer."}
              </p>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/60 shrink-0 gap-2 flex-col-reverse sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl font-semibold w-full sm:w-auto h-9 text-xs touch-manipulation active:scale-95"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              className="rounded-xl font-semibold gap-2 px-5 bg-foreground text-background hover:bg-foreground/90 shadow-md w-full sm:w-auto h-9 text-xs touch-manipulation active:scale-95"
            >
              Continue to Bill <ArrowRight className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
