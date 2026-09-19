'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, CheckSquare, Square, UserPlus, Check } from 'lucide-react';
import type { PersonData } from '@/../db/types';
import type { Person } from '@/store/useBillStore';

interface InheritParticipantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  groupParticipants: PersonData[];
  currentPeople: Person[];
  onConfirm: (selected: PersonData[]) => void;
  onSkip: () => void;
}

export function InheritParticipantsDialog({
  open,
  onOpenChange,
  groupName,
  groupParticipants,
  currentPeople,
  onConfirm,
  onSkip,
}: InheritParticipantsDialogProps) {
  // Determine which group members are not yet on this bill
  const candidates = groupParticipants.filter((gp) => {
    const gpName = gp.name.trim().toLowerCase();
    const gpEmail = gp.email?.trim().toLowerCase();
    return !currentPeople.some((cp) => {
      if (gpEmail && cp.email && cp.email.trim().toLowerCase() === gpEmail) return true;
      if (cp.name && cp.name.trim().toLowerCase() === gpName) return true;
      return false;
    });
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Whenever candidates change or dialog opens, default to selecting all candidates
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(candidates.map((c) => c.id)));
    }
  }, [open, groupParticipants, currentPeople]);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(candidates.map((c) => c.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const isAllSelected = candidates.length > 0 && selectedIds.size === candidates.length;

  const handleConfirm = () => {
    const selected = candidates.filter((c) => selectedIds.has(c.id));
    onConfirm(selected);
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="w-[calc(100vw-28px)] sm:w-full max-w-md p-4 sm:p-6 text-foreground shadow-2xl rounded-2xl sm:rounded-3xl border border-border bg-card">
        <DialogHeader className="space-y-1.5 text-left pb-3 border-b border-border/60">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-1">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight">
            Inherit Group Participants?
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            You are linking this bill to <span className="font-semibold text-foreground">{groupName}</span>. Select group members to include on this bill:
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {/* Header controls: select count & select/deselect all */}
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground font-medium">
              {selectedIds.size} of {candidates.length} selected
            </span>
            {candidates.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={isAllSelected ? handleDeselectAll : handleSelectAll}
                className="h-7 text-xs font-semibold gap-1 text-primary hover:text-primary/90 hover:bg-primary/10 px-2 rounded-lg"
              >
                {isAllSelected ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Select All</span>
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Candidates list */}
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {candidates.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl border border-border/40">
                All group members are already in this bill.
              </div>
            ) : (
              candidates.map((member) => {
                const checked = selectedIds.has(member.id);
                return (
                  <label
                    key={member.id}
                    onClick={() => handleToggle(member.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                      checked
                        ? 'bg-primary/5 border-primary/30 text-foreground'
                        : 'bg-muted/10 border-border/60 text-muted-foreground hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => handleToggle(member.id)}
                        className="rounded-md"
                      />
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                        {member.name[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-xs sm:text-sm text-foreground block truncate">
                          {member.name}
                        </span>
                        {member.email && (
                          <span className="text-[10px] text-muted-foreground block truncate">
                            {member.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2 pt-3 border-t border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="h-8 text-xs font-semibold rounded-xl"
          >
            Skip (Keep Current)
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            className="h-8 text-xs font-bold gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Selected ({selectedIds.size})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
