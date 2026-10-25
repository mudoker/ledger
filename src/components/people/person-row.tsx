'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Check, X, Heart, Pencil, Banknote, User, Crown, Plus } from "lucide-react";
import { useBillStore, type Person } from "@/store/useBillStore";
import { formatCurrency } from "@/lib/format";
import { CurrencyInput } from "@/components/shared/currency-input";
import { cn } from "@/lib/utils";
import { getAvatarColor, getInitials } from "@/constants/colors";

interface PersonRowProps {
    person: Person;
    index: number;
    baselineCost?: number;
    onUpdate: (id: string, data: Partial<Person>) => void;
    onRemove: (id: string) => void;
}

export function PersonRow({ person, index, baselineCost = 0, onUpdate, onRemove }: PersonRowProps) {
    const { isReadOnly, hostId } = useBillStore();
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(person.name);
    const [editEmail, setEditEmail] = useState(person.email || '');
    const [editSponsor, setEditSponsor] = useState(person.sponsorAmount);
    const [editPaid, setEditPaid] = useState(person.paidAmount || 0);

    const avatarGradient = getAvatarColor(person.name);
    const initials = getInitials(person.name);
    const isAppMember = Boolean(person.userId || person.email);
    const isHost = person.id === hostId;

    const handleStartEdit = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (isReadOnly) return;
        setEditName(person.name);
        setEditEmail(person.email || '');
        setEditSponsor(person.sponsorAmount);
        setEditPaid(person.paidAmount || 0);
        setIsEditing(true);
    };

    const handleSave = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        onUpdate(person.id, {
            name: editName.trim() || person.name,
            email: editEmail.trim() || null,
            sponsorAmount: editSponsor,
            paidAmount: editPaid
        });
        setIsEditing(false);
    };

    const handleCancel = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setEditName(person.name);
        setEditEmail(person.email || '');
        setEditSponsor(person.sponsorAmount);
        setEditPaid(person.paidAmount || 0);
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="border border-border/80 bg-card/90 backdrop-blur-md rounded-2xl p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-200 shadow-md">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5 text-primary" /> Edit Participant
                    </span>
                    <div className="flex items-center gap-1.5">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                            onClick={handleCancel}
                        >
                            <X className="w-3.5 h-3.5 mr-1" /> Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="h-7 px-3 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                            onClick={handleSave}
                        >
                            <Check className="w-3.5 h-3.5 mr-1" /> Save
                        </Button>
                    </div>
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground pl-1">Name</Label>
                    <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-9 bg-background/80 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40 font-semibold text-xs"
                        placeholder="Participant name..."
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground pl-1">
                        Email <span className="font-normal text-muted-foreground/60">(Optional)</span>
                    </Label>
                    <Input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="h-9 bg-background/80 border-border/80 rounded-xl text-xs font-medium"
                        placeholder="friend@example.com"
                    />
                </div>

                <div className="person-edit-grid">
                    <div className="space-y-1 min-w-0">
                        <Label className="text-[11px] font-semibold text-primary pl-1 flex items-center gap-1.5">
                            <Banknote className="w-3.5 h-3.5" /> Amount Paid
                        </Label>
                        <CurrencyInput
                            value={editPaid}
                            onChange={(val) => setEditPaid(val)}
                            className="h-9 bg-background/80 border-border/80 rounded-xl text-xs font-mono font-bold"
                            showCurrencySymbol={true}
                        />
                    </div>
                    <div className="space-y-1 min-w-0">
                        <Label className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 pl-1 flex items-center gap-1.5">
                            <Heart className="w-3.5 h-3.5" /> Sponsor Amount
                        </Label>
                        <CurrencyInput
                            value={editSponsor}
                            onChange={(val) => setEditSponsor(val)}
                            className={cn(
                                "h-9 bg-background/80 border-border/80 rounded-xl text-xs font-mono font-bold",
                                editSponsor > 0 && baselineCost > 0 && editSponsor < baselineCost && "border-amber-500/60 focus-visible:ring-amber-500/40 text-amber-600 dark:text-amber-400"
                            )}
                            showCurrencySymbol={true}
                        />
                        {editSponsor > 0 && baselineCost > 0 && editSponsor < baselineCost && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pl-1 leading-tight">
                                Min required: {formatCurrency(baselineCost)} (covers own meal)
                            </p>
                        )}
                        {editSponsor >= baselineCost && editSponsor > 0 && baselineCost > 0 && (
                            <p className="text-[10px] text-primary font-medium pl-1 leading-tight">
                                Subsidizes {formatCurrency(editSponsor - baselineCost)} to table
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={() => !isReadOnly && handleStartEdit()}
            className={cn(
                "group relative flex items-center justify-between gap-3 p-3 bg-card/70 backdrop-blur-xs border border-border/60 rounded-2xl hover:bg-card hover:border-foreground/20 hover:shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-bottom-2",
                !isReadOnly && "cursor-pointer"
            )}
            style={{ animationDelay: `${index * 40}ms` }}
        >
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Modern Gradient Avatar with Crown for Host */}
                <div className="relative shrink-0">
                    <div className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-xs shadow-2xs border border-white/20 select-none",
                        avatarGradient
                    )}>
                        {initials}
                    </div>
                    {isHost && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs border border-background">
                            <Crown className="w-2.5 h-2.5" />
                        </div>
                    )}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm tracking-tight text-foreground truncate" title={person.name}>
                            {person.name}
                        </span>

                        {/* Host Badge */}
                        {isHost && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px] font-semibold shrink-0">
                                Host
                            </span>
                        )}

                        {/* Registered Member Badge (Only if app user) */}
                        {isAppMember && !isHost && (
                            <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 text-[10px] font-medium shrink-0"
                                title={person.email ? `Registered user: ${person.email}` : "App User"}
                            >
                                <User className="w-2.5 h-2.5" /> Member
                            </span>
                        )}
                    </div>

                    {/* Email subtitle if present */}
                    {person.email && (
                        <span className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                            {person.email}
                        </span>
                    )}

                    {/* Financial Status Indicators */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {isHost && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-foreground/[0.04] rounded-full border border-foreground/[0.08] text-[10px] font-medium text-muted-foreground">
                                <span>Pays remaining</span>
                            </div>
                        )}

                        {!isHost && person.paidAmount > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full border border-primary/20 text-[10px] font-semibold text-primary tabular-nums">
                                <Banknote className="w-3 h-3 shrink-0" />
                                <span>{formatCurrency(person.paidAmount)} paid</span>
                            </div>
                        )}

                        {person.sponsorAmount > 0 && (
                            <div
                                className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold tabular-nums",
                                    baselineCost > 0 && person.sponsorAmount < baselineCost
                                        ? "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400"
                                        : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                                )}
                                title={baselineCost > 0 && person.sponsorAmount < baselineCost ? `Must be at least ${formatCurrency(baselineCost)} to sponsor others` : `Sponsor pledge of ${formatCurrency(person.sponsorAmount)}`}
                            >
                                <Heart className={cn("w-3 h-3 shrink-0", baselineCost > 0 && person.sponsorAmount < baselineCost ? "text-amber-500" : "fill-rose-500/30 text-rose-500")} />
                                <span>{formatCurrency(person.sponsorAmount)} {baselineCost > 0 && person.sponsorAmount < baselineCost ? "(< min)" : "spon."}</span>
                            </div>
                        )}

                        {!(person.paidAmount > 0) && !(person.sponsorAmount > 0) && !isReadOnly && !isHost && (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 hover:bg-muted text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border/40 transition-colors touch-manipulation active:scale-95"
                                onClick={handleStartEdit}
                            >
                                <Plus className="w-2.5 h-2.5" /> Add sponsor / paid
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            {!isReadOnly && (
                <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl touch-manipulation active:scale-95 transition-colors"
                        onClick={handleStartEdit}
                        title="Edit participant"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl touch-manipulation active:scale-95 transition-colors"
                        onClick={() => onRemove(person.id)}
                        title="Remove participant"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            )}
        </div>
    );
}
