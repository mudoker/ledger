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
import { UserCheck, Search, AlertTriangle, ShieldCheck, Check, User } from "lucide-react";

interface UserOption {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

interface TransferOwnershipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: 'group' | 'bill';
  targetId: string;
  targetName: string;
  onSuccess?: () => void;
}

export function TransferOwnershipModal({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetName,
  onSuccess,
}: TransferOwnershipModalProps) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setUsers([]);
      setSelectedUser(null);
      setError('');
      setConfirmed(false);
    }
  }, [open]);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setUsers([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch (e) {
        console.error('Failed to search users:', e);
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  const handleTransfer = async () => {
    if (!selectedUser) {
      setError('Please search and select a user to receive ownership');
      return;
    }
    if (!confirmed) {
      setError('Please check the confirmation box below');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const endpoint = targetType === 'group'
        ? `/api/groups/${targetId}/transfer`
        : `/api/bills/${targetId}/transfer`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: selectedUser.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to transfer ownership');
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="w-[calc(100vw-28px)] sm:w-full max-w-md max-h-[88vh] max-h-[88dvh] flex flex-col p-4 sm:p-6 text-foreground shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 bg-card">
        <DialogHeader className="space-y-1.5 text-left pb-3.5 border-b border-border/60 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-1">
            <UserCheck className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight">
            Transfer Ownership
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Reassign primary administrative ownership of &ldquo;{targetName}&rdquo; to another user.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-3.5 pr-0.5">
          {/* Warning Banner */}
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>Important Security Notice</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
              Only the owner can edit settings or transfer ownership. Once transferred, you will become a regular participant with read-only view access.
            </p>
          </div>

          {/* User Search Input */}
          <div className="space-y-1.5">
            <Label htmlFor="search-user" className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-primary" /> Find User by Email or Name
            </Label>
            <div className="relative">
              <Input
                id="search-user"
                placeholder="Type at least 2 characters (e.g. alex@gmail.com)"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (error) setError('');
                }}
                className="h-10 pl-8 bg-foreground/[0.03] border-border focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl font-medium text-xs"
                autoFocus
              />
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            </div>
          </div>

          {/* User Results List */}
          <div className="space-y-2">
            {isSearching ? (
              <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span>Searching registered users...</span>
              </div>
            ) : query.trim().length >= 2 && users.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground italic rounded-xl border border-dashed border-border/60">
                No registered user found matching &ldquo;{query}&rdquo;
              </div>
            ) : users.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {users.map((u) => {
                  const isSelected = selectedUser?.id === u.id;
                  const initials = (u.name || u.email).slice(0, 2).toUpperCase();

                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        setSelectedUser(u);
                        setError('');
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary/10 border-primary shadow-xs'
                          : 'border-border/60 hover:bg-muted/40 hover:border-foreground/20'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt={u.name || u.email}
                            className="w-7 h-7 rounded-full shrink-0 object-cover border border-border"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary/30 to-blue-500/30 text-foreground font-black text-[10px] flex items-center justify-center shrink-0 border border-primary/20">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate text-foreground">
                            {u.name || u.email.split('@')[0]}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate font-mono">
                            {u.email}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 ml-2">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-border/80" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Selected User Summary Badge */}
          {selectedUser && (
            <div className="p-3 rounded-xl bg-card border border-primary/30 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">
                  Transfer to: <strong>{selectedUser.name || selectedUser.email}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-[11px] font-bold text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              >
                Change
              </button>
            </div>
          )}

          {/* Confirmation Checkbox */}
          {selectedUser && (
            <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  if (error) setError('');
                }}
                className="mt-0.5 rounded border-border text-primary focus:ring-primary w-4 h-4"
              />
              <span className="text-[11px] text-muted-foreground select-none leading-tight">
                I understand that I am permanently transferring ownership of this {targetType} and will no longer have admin rights.
              </span>
            </label>
          )}

          {error && (
            <p className="text-xs font-bold text-destructive pl-1">{error}</p>
          )}
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
            type="button"
            onClick={handleTransfer}
            disabled={!selectedUser || !confirmed || isSubmitting}
            className="gap-1.5 text-xs font-bold rounded-xl h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
          >
            <span>{isSubmitting ? 'Transferring...' : 'Confirm Transfer'}</span>
            <UserCheck className="w-3.5 h-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
