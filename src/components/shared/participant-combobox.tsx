'use client';

import React, { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User,
  ChevronsUpDown,
  Check,
  Search,
  X,
  Plus,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ParticipantOption {
  id: string;
  name: string;
  email?: string | null;
  userId?: string | null;
}

export interface ParticipantComboboxProps {
  participants: ParticipantOption[];
  value: string;
  selectedId?: string | null;
  onChange: (name: string, id: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ParticipantCombobox({
  participants,
  value,
  selectedId,
  onChange,
  placeholder = "Select participant or enter name...",
  className,
  disabled = false,
}: ParticipantComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q))
    );
  }, [participants, search]);

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return participants.find(p => p.name.trim().toLowerCase() === q);
  }, [participants, search]);

  const handleSelect = (name: string, id: string | null) => {
    onChange(name, id);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', null);
    setSearch('');
  };

  const selectedParticipant = useMemo(() => {
    if (selectedId) {
      return participants.find(p => p.id === selectedId);
    }
    if (value) {
      return participants.find(p => p.name.trim().toLowerCase() === value.trim().toLowerCase());
    }
    return null;
  }, [participants, selectedId, value]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "w-full h-10 px-3 rounded-xl border border-border/80 bg-background/80 hover:bg-muted/40 transition-all flex items-center justify-between text-xs font-medium text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
            !value && "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
            <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary text-[10px] font-bold">
              {value ? (
                value.trim()[0]?.toUpperCase()
              ) : (
                <User className="w-3 h-3 text-muted-foreground" />
              )}
            </div>
            <span className="truncate text-foreground font-semibold">
              {value || placeholder}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
            {value && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                className="p-1 rounded-md hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-60" />
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-2 rounded-2xl bg-popover border border-border shadow-2xl z-[150]"
      >
        <div className="space-y-2">
          {/* Search Input */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-muted/40 border border-border/60">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (exactMatch) {
                    handleSelect(exactMatch.name, exactMatch.id);
                  } else if (search.trim()) {
                    handleSelect(search.trim(), null);
                  }
                }
              }}
              placeholder="Search or enter name..."
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none border-none p-0 focus:ring-0"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* List of Participants */}
          <ScrollArea className="max-h-56 overflow-y-auto">
            <div className="space-y-1">
              {/* Custom name option when search has text and is not an exact match */}
              {search.trim() && !exactMatch && (
                <button
                  type="button"
                  onClick={() => handleSelect(search.trim(), null)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left hover:bg-primary/10 text-primary font-semibold transition-colors border border-dashed border-primary/30 mb-1"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Use &quot;{search.trim()}&quot; as custom name</span>
                </button>
              )}

              {filtered.length === 0 && !search.trim() ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No participants in this group
                </div>
              ) : filtered.length === 0 && search.trim() ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No matching participant
                </div>
              ) : (
                filtered.map((p) => {
                  const isSelected = value.trim().toLowerCase() === p.name.trim().toLowerCase() || selectedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(p.name, p.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs text-left transition-colors",
                        isSelected
                          ? "bg-primary/15 text-primary font-bold"
                          : "hover:bg-muted/50 text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 text-[10px] font-bold">
                          {p.name[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.name}</p>
                          {p.email && (
                            <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
