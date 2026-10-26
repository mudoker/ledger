'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Folder,
  Receipt,
  Tag,
  ChevronRight,
  Sparkles,
  X,
  Command,
  ArrowUpDown,
  CornerDownLeft,
  SlidersHorizontal
} from "lucide-react";
import Fuse from 'fuse.js';
import { formatCurrency } from '@/lib/format';
import { useBillStore } from '@/store/useBillStore';
import { useGroupStore } from '@/store/useGroupStore';
import type { SearchResults } from '@/../db/types';

interface FuzzySearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectBill: (billId: string) => void;
  onSelectGroup: (groupId: string) => void;
}

type FilterCategory = 'all' | 'groups' | 'bills' | 'items';

export function FuzzySearchModal({
  open,
  onOpenChange,
  onSelectBill,
  onSelectGroup,
}: FuzzySearchModalProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FilterCategory>('all');
  const [apiResults, setApiResults] = useState<SearchResults | null>(null);
  const [isApiLoading, setIsApiLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { billHistory } = useBillStore();
  const { groups } = useGroupStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when opened/closed
  useEffect(() => {
    if (!open) {
      setQuery('');
      setCategory('all');
      setApiResults(null);
      setSelectedIndex(0);
    } else {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Client-side Fuse instances for instant local fuzzy matching
  const fuseBills = useMemo(() => {
    return new Fuse(billHistory, {
      keys: ['name', 'location'],
      threshold: 0.45,
      ignoreLocation: true,
    });
  }, [billHistory]);

  const fuseGroups = useMemo(() => {
    return new Fuse(groups, {
      keys: ['name', 'description'],
      threshold: 0.45,
      ignoreLocation: true,
    });
  }, [groups]);

  // Query server API for deep item-level searches across all bills
  useEffect(() => {
    if (!query || query.trim().length === 0) {
      setApiResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsApiLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setApiResults(data.results);
        }
      } catch (e) {
        console.error('Search API error:', e);
      } finally {
        setIsApiLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  // Local instant fuzzy matches
  const localMatchedGroups = useMemo(() => {
    if (!query.trim()) return groups.slice(0, 5);
    return fuseGroups.search(query).map((r) => r.item);
  }, [query, groups, fuseGroups]);

  const localMatchedBills = useMemo(() => {
    if (!query.trim()) return billHistory.slice(0, 6);
    return fuseBills.search(query).map((r) => r.item);
  }, [query, billHistory, fuseBills]);

  // Items from API search results
  const matchedItems = apiResults?.items || [];

  // Filter based on selected category tab
  const displayedGroups = category === 'all' || category === 'groups' ? localMatchedGroups : [];
  const displayedBills = category === 'all' || category === 'bills' ? localMatchedBills : [];
  const displayedItems = category === 'all' || category === 'items' ? matchedItems : [];

  // Flattened results array for keyboard navigation
  const flattenedResults = useMemo(() => {
    const list: Array<{ type: 'group' | 'bill' | 'item'; id: string; billId?: string }> = [];

    displayedGroups.forEach((g) => list.push({ type: 'group', id: g.id }));
    displayedBills.forEach((b) => list.push({ type: 'bill', id: b.id }));
    displayedItems.forEach((i) => list.push({ type: 'item', id: i.id, billId: i.bill_id }));

    return list;
  }, [displayedGroups, displayedBills, displayedItems]);

  // Handle Enter selection from keyboard
  const handleSelectCurrent = useCallback(() => {
    const current = flattenedResults[selectedIndex];
    if (!current) return;

    onOpenChange(false);
    if (current.type === 'group') {
      onSelectGroup(current.id);
    } else if (current.type === 'bill') {
      onSelectBill(current.id);
    } else if (current.type === 'item' && current.billId) {
      onSelectBill(current.billId);
    }
  }, [flattenedResults, selectedIndex, onOpenChange, onSelectBill, onSelectGroup]);

  // Keyboard navigation listener
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, flattenedResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flattenedResults.length) % Math.max(1, flattenedResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelectCurrent();
    }
  };

  const hasAnyResults =
    displayedGroups.length > 0 ||
    displayedBills.length > 0 ||
    displayedItems.length > 0;

  let runningIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={handleKeyDown}
        className="w-[calc(100vw-24px)] sm:w-full max-w-xl max-h-[85vh] max-h-[85dvh] flex flex-col p-0 text-foreground shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 bg-card"
      >
        {/* Top Search Bar */}
        <div className="p-3.5 sm:p-4 border-b border-border/60 flex items-center gap-3 shrink-0 bg-muted/20">
          <Search className="w-4 h-4 text-primary shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search bills, groups & items with fuzzy match..."
            className="h-9 border-none bg-transparent shadow-none focus-visible:ring-0 text-sm font-medium px-0 placeholder:text-muted-foreground/50"
            autoFocus
          />
          {isApiLoading ? (
            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
          ) : query ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
              }}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground bg-muted rounded border border-border/60">
              ESC
            </kbd>
          )}
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 border-b border-border/30 bg-muted/10 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setCategory('all');
              setSelectedIndex(0);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
              category === 'all'
                ? 'bg-foreground text-background shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setCategory('groups');
              setSelectedIndex(0);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              category === 'groups'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Folder className="w-3 h-3" /> Groups ({localMatchedGroups.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setCategory('bills');
              setSelectedIndex(0);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              category === 'bills'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Receipt className="w-3 h-3" /> Bills ({localMatchedBills.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setCategory('items');
              setSelectedIndex(0);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              category === 'items'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Tag className="w-3 h-3" /> Items ({matchedItems.length})
          </button>
        </div>

        {/* Results Scroll Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
          {!hasAnyResults ? (
            <div className="py-12 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto text-muted-foreground">
                <Search className="w-5 h-5 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-foreground font-bold">
                No matching results found
              </p>
              <p className="text-[11px] text-muted-foreground/70 max-w-xs mx-auto">
                Typo tolerance is active. Try searching for partial words, item names, or locations.
              </p>
            </div>
          ) : (
            <>
              {/* Groups Section */}
              {displayedGroups.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Folder className="w-3 h-3 text-primary" /> Bill Groups
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">
                      {displayedGroups.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {displayedGroups.map((g) => {
                      const thisIndex = runningIndex++;
                      const isSelected = selectedIndex === thisIndex;

                      return (
                        <div
                          key={g.id}
                          onClick={() => {
                            onOpenChange(false);
                            onSelectGroup(g.id);
                          }}
                          onMouseEnter={() => setSelectedIndex(thisIndex)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 border-primary/40 shadow-xs'
                              : 'border-border/50 hover:border-foreground/20 hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                              <Folder className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs truncate text-foreground">
                                {g.name}
                              </h4>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {g.total_bills} bill{g.total_bills === 1 ? '' : 's'} • {formatCurrency(g.total_amount)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {isSelected && (
                              <CornerDownLeft className="w-3.5 h-3.5 text-primary" />
                            )}
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bills Section */}
              {displayedBills.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Receipt className="w-3 h-3 text-blue-500" /> Bills
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">
                      {displayedBills.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {displayedBills.map((b) => {
                      const thisIndex = runningIndex++;
                      const isSelected = selectedIndex === thisIndex;

                      return (
                        <div
                          key={b.id}
                          onClick={() => {
                            onOpenChange(false);
                            onSelectBill(b.id);
                          }}
                          onMouseEnter={() => setSelectedIndex(thisIndex)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-500/10 border-blue-500/40 shadow-xs'
                              : 'border-border/50 hover:border-foreground/20 hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
                              <Receipt className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-bold text-xs truncate text-foreground">
                                  {b.name || `Bill ${b.id.slice(0, 8)}`}
                                </h4>
                                {b.group_name && (
                                  <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded shrink-0">
                                    📁 {b.group_name}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {b.location ? `${b.location} • ` : ''}
                                {b.totalAmount !== undefined ? formatCurrency(b.totalAmount) : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {isSelected && (
                              <CornerDownLeft className="w-3.5 h-3.5 text-blue-500" />
                            )}
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items Section */}
              {displayedItems.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-emerald-500" /> Line Items
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">
                      {displayedItems.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {displayedItems.map((item) => {
                      const thisIndex = runningIndex++;
                      const isSelected = selectedIndex === thisIndex;

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            onOpenChange(false);
                            onSelectBill(item.bill_id);
                          }}
                          onMouseEnter={() => setSelectedIndex(thisIndex)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500/40 shadow-xs'
                              : 'border-border/50 hover:border-foreground/20 hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                              <Tag className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs truncate text-foreground">
                                {item.name}
                              </h4>
                              <p className="text-[10px] text-muted-foreground truncate">
                                in &ldquo;{item.bill_name}&rdquo; • {formatCurrency(item.price)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[10px] text-primary font-bold">
                              Jump to Bill ↗
                            </span>
                            {isSelected && (
                              <CornerDownLeft className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="p-2.5 sm:p-3 border-t border-border/40 bg-muted/15 flex items-center justify-between text-[10px] text-muted-foreground px-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-semibold text-primary">
              <Sparkles className="w-3 h-3" /> Typo tolerance enabled
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3 font-mono text-[9px]">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60">↵</kbd> open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60">esc</kbd> close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
