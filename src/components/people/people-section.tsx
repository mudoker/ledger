'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, UserPlus, Sparkles, UserCheck, Plus, Folder } from "lucide-react";
import { useBillStore } from "@/store/useBillStore";
import { useGroupStore } from "@/store/useGroupStore";
import { useBillState } from "@/hooks/useBillState";
import { PersonRow } from "./person-row";
import { QuickInsights } from "../summary/quick-insights";

interface UserSuggestion {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
}

export function PeopleSection() {
    const { people, addPerson, addPeople, updatePerson, removePerson, isReadOnly, loadSeedData, hostId, groupId } = useBillStore();
    const { groups, currentGroup } = useGroupStore();
    const { calculate } = useBillState();
    const { totalCosts } = calculate();
    const [newName, setNewName] = useState("");
    const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const matchedGroup = groupId ? (groups.find(g => g.id === groupId) || (currentGroup?.id === groupId ? currentGroup : null)) : null;
    const groupMembers: Array<{ id: string; name: string; email?: string | null; userId?: string | null }> = (matchedGroup as any)?.participants || [];

    const unaddedMembers = groupMembers.filter((gm) => {
        const gmName = gm.name.trim().toLowerCase();
        const gmEmail = gm.email?.trim().toLowerCase();
        return !people.some((p) => {
            if (gmEmail && p.email && p.email.trim().toLowerCase() === gmEmail) return true;
            if (p.name && p.name.trim().toLowerCase() === gmName) return true;
            return false;
        });
    });

    useEffect(() => {
        const term = newName.trim();
        if (term.length < 2) {
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/users/search?q=${encodeURIComponent(term)}`);
                if (res.ok) {
                    const data = await res.json();
                    setSuggestions(data.users || []);
                    setShowSuggestions((data.users || []).length > 0);
                }
            } catch {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [newName]);

    const handleAdd = (email?: string, userId?: string, selectedName?: string) => {
        const participantName = (selectedName || newName).trim();
        if (participantName) {
            const isEmailFormat = participantName.includes('@');
            const resolvedEmail = email || (isEmailFormat ? participantName : null);
            const resolvedName = selectedName || (isEmailFormat ? participantName.split('@')[0] : participantName);

            addPerson(resolvedName, resolvedEmail, userId || null);
            setNewName("");
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const hostPerson = people.find((p) => p.id === hostId);

    return (
        <Card className="w-full h-full flex flex-col min-h-0 border-0 md:border md:border-border/50 bg-transparent md:bg-card/30 overflow-hidden shadow-none rounded-none md:rounded-2xl">
            {/* Clean, Modern Header */}
            <CardHeader className="pb-2.5 pt-0 px-2 sm:px-4 md:px-5 md:pt-4 shrink-0">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] flex items-center justify-center text-foreground shrink-0 shadow-2xs">
                            <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate">
                                    Participants
                                </h2>
                                {people.length > 0 && (
                                    <span className="text-[11px] font-semibold text-muted-foreground bg-foreground/[0.05] border border-foreground/[0.08] px-2 py-0.5 rounded-full">
                                        {people.length}
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] sm:text-xs text-muted-foreground truncate font-normal">
                                {hostPerson
                                    ? `${hostPerson.name} pays remaining balance`
                                    : 'Add friends to split the bill with'}
                            </p>
                        </div>
                    </div>

                    {people.length === 0 && !isReadOnly && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadSeedData}
                            className="h-8 gap-1.5 text-xs font-semibold rounded-xl border-border/80 hover:bg-foreground/5 shadow-2xs shrink-0"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                            <span>Demo sample</span>
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col container-query-pane">
                <ScrollArea className="flex-1 min-h-0 h-full px-2 sm:px-4 md:px-5">
                    <div className="space-y-3 sm:space-y-4 py-1 pr-1 sm:pr-2">
                        {/* Unified Modern Add Participant Bar */}
                        {!isReadOnly && (
                            <div className="relative group">
                                <div className="relative flex items-center">
                                    <UserPlus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-focus-within:text-foreground transition-colors" />
                                    <Input
                                        placeholder="Add friend name or email..."
                                        value={newName}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setNewName(val);
                                            if (val.trim().length < 2) {
                                                setSuggestions([]);
                                                setShowSuggestions(false);
                                            }
                                        }}
                                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                                        className="h-10 pl-10 pr-20 bg-background/80 backdrop-blur-sm border-border/80 rounded-2xl focus-visible:ring-1 focus-visible:ring-primary/40 font-medium text-xs sm:text-sm shadow-2xs hover:border-foreground/20 transition-all"
                                    />
                                    <Button
                                        onClick={() => handleAdd()}
                                        disabled={!newName.trim()}
                                        size="sm"
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1" />
                                        <span>Add</span>
                                    </Button>
                                </div>

                                {/* Autocomplete dropdown for app users */}
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="absolute z-30 left-0 right-0 mt-1.5 bg-card/98 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-1.5 max-h-48 overflow-y-auto">
                                        <div className="px-2.5 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                            Registered App Users
                                        </div>
                                        {suggestions.map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => handleAdd(s.email, s.id, s.name || s.email.split('@')[0])}
                                                className="w-full text-left px-2.5 py-2 hover:bg-muted/60 rounded-xl flex items-center justify-between text-xs transition-colors"
                                            >
                                                <div className="min-w-0 pr-2">
                                                    <span className="font-semibold text-foreground block truncate">{s.name || s.email}</span>
                                                    <span className="text-[10px] text-muted-foreground block truncate">{s.email}</span>
                                                </div>
                                                <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Quick Add Group Members */}
                        {!isReadOnly && unaddedMembers.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap p-2.5 rounded-2xl bg-primary/5 border border-primary/20 text-xs">
                                <div className="flex items-center gap-1 text-[11px] font-bold text-primary mr-1 shrink-0">
                                    <Folder className="w-3 h-3" />
                                    <span>From Group:</span>
                                </div>
                                {unaddedMembers.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => addPerson(m.name, m.email || null, m.userId || null)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-background border border-primary/30 hover:border-primary text-foreground font-semibold text-xs shadow-2xs hover:scale-105 active:scale-95 transition-all"
                                    >
                                        <Plus className="w-3 h-3 text-primary" />
                                        <span>{m.name}</span>
                                    </button>
                                ))}
                                {unaddedMembers.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => addPeople(unaddedMembers)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-2xs hover:bg-primary/90 active:scale-95 transition-all ml-auto"
                                    >
                                        <UserCheck className="w-3 h-3" />
                                        <span>Add All ({unaddedMembers.length})</span>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Participant Grid */}
                        <div className="people-grid">
                            {people.map((person, index) => (
                                <PersonRow
                                    key={person.id}
                                    person={person}
                                    index={index}
                                    baselineCost={totalCosts[person.id] || 0}
                                    onUpdate={updatePerson}
                                    onRemove={removePerson}
                                />
                            ))}
                        </div>

                        {/* Empty State */}
                        {people.length === 0 && (
                            <div
                                className={`flex flex-col items-center justify-center py-16 px-4 gap-4 rounded-3xl border border-dashed border-border/70 bg-muted/10 group ${!isReadOnly ? 'hover:border-primary/40 transition-all cursor-pointer' : ''}`}
                                onClick={() => {
                                    if (!isReadOnly) {
                                        loadSeedData();
                                    }
                                }}
                            >
                                <div className="w-14 h-14 rounded-2xl bg-foreground/[0.04] border border-foreground/[0.06] flex items-center justify-center group-hover:bg-primary/10 transition-colors shadow-2xs">
                                    <UserPlus className="w-7 h-7 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="text-sm font-semibold text-foreground">No participants added yet</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                                        Type a name above or <span className="text-primary font-medium underline underline-offset-4">load sample BBQ session</span> to get started.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Refined Quick Insights */}
                        <div className="pt-2 mt-2 pb-2 sm:pb-6 border-t border-border/40">
                            <QuickInsights />
                        </div>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
