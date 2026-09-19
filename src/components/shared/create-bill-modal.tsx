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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tag, MapPin, User, ArrowRight, ReceiptText, Coins, Folder, Users } from "lucide-react";
import { CurrencyDropdown } from "@/components/shared/currency-dropdown";
import { useGroupStore } from "@/store/useGroupStore";
import { useAppSettingsStore } from "@/store/useAppSettingsStore";
import { Checkbox } from "@/components/ui/checkbox";
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
              <Label htmlFor="bill-host" className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Host / Payer (Optional)
              </Label>
              <Input
                id="bill-host"
                placeholder="e.g. Alex"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                className="h-9 bg-foreground/[0.03] border-border focus-visible:ring-1 focus-visible:ring-foreground/20 rounded-xl font-medium text-xs"
              />
              <p className="text-[10px] text-muted-foreground/70 pl-1">
                Creates the first participant and sets them as the primary payer.
              </p>
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
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 pt-1">
                  {groupMembers.map((m) => {
                    const isSelected = selectedMemberIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none text-xs ${
                          isSelected
                            ? 'bg-primary/5 border-primary/30 text-foreground'
                            : 'bg-muted/10 border-border/50 text-muted-foreground hover:bg-muted/20'
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {
                            setSelectedMemberIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.id)) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            });
                          }}
                          className="rounded-md"
                        />
                        <span className="font-semibold text-foreground truncate">{m.name}</span>
                        {m.email && (
                          <span className="text-[10px] text-muted-foreground truncate">({m.email})</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
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
