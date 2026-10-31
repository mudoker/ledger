import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Clock, MapPin, Folder, Crown, Sparkles, Shield, Globe, Users, AlertTriangle, Trash2 } from "lucide-react";
import { formatCurrency, formatConciseRelativeTime } from '@/lib/format';
import type { BillSharingStatus, BillVisibility } from '@/lib/local-db/types';

export interface RoleBadgeProps {
    role?: 'owner' | 'participant' | 'draft' | string | null;
    isOwner?: boolean;
}

export function RoleBadge({ role, isOwner }: RoleBadgeProps) {
    const effectiveRole = isOwner ? 'owner' : role;
    if (!effectiveRole) return null;

    if (effectiveRole === 'owner') {
        return (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 shrink-0 shadow-2xs">
                <Crown className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 shrink-0" />
                <span>Owner</span>
            </span>
        );
    }

    if (effectiveRole === 'draft') {
        return (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 shadow-2xs">
                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                <span>Draft</span>
            </span>
        );
    }

    if (effectiveRole === 'participant') {
        return (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60 shrink-0 shadow-2xs">
                <span>Participant</span>
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60 shrink-0 shadow-2xs">
            <span>{effectiveRole}</span>
        </span>
    );
}

export interface LandingCardProps {
    id: string;
    title: string;
    amount?: number;
    description?: string | null;
    icon: React.ReactNode;
    iconVariant?: 'primary' | 'muted' | 'amber';
    role?: 'owner' | 'participant' | 'draft' | string | null;
    isOwner?: boolean;
    sharingStatus?: BillSharingStatus;
    visibility?: BillVisibility;
    groupName?: string | null;
    timestamp?: string | Date;
    location?: string | null;
    extraMetadata?: React.ReactNode;
    isDraft?: boolean;
    onClick: () => void;
    onDelete?: () => void;
}

export function LandingCard({
    title,
    amount,
    description,
    icon,
    iconVariant = 'muted',
    role,
    isOwner,
    sharingStatus,
    visibility,
    groupName,
    timestamp,
    location,
    extraMetadata,
    isDraft = false,
    onClick,
    onDelete,
}: LandingCardProps) {
    const iconContainerClass = (() => {
        if (iconVariant === 'primary') {
            return 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground';
        }
        if (iconVariant === 'amber') {
            return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500 group-hover:text-white';
        }
        return 'bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background';
    })();

    const chevronHoverClass = (() => {
        if (isDraft) {
            return 'group-hover:bg-amber-500 group-hover:text-white';
        }
        if (iconVariant === 'primary') {
            return 'group-hover:bg-primary group-hover:text-primary-foreground';
        }
        return 'group-hover:bg-foreground group-hover:text-background';
    })();

    const titleHoverClass = (() => {
        if (isDraft) {
            return 'group-hover:text-amber-600 dark:group-hover:text-amber-400';
        }
        if (iconVariant === 'primary') {
            return 'group-hover:text-primary';
        }
        return '';
    })();

    return (
        <Card
            className={`group overflow-hidden transition-all duration-300 cursor-pointer rounded-2xl touch-manipulation active:scale-[0.99] ${
                isDraft
                    ? 'border border-amber-500/40 bg-amber-500/[0.04] hover:border-amber-500/70 hover:shadow-2xl hover:shadow-black/5'
                    : 'border border-border/50 hover:border-foreground/20 hover:shadow-2xl hover:shadow-black/5 bg-card'
            }`}
            onClick={onClick}
        >
            <CardContent className="p-0">
                <div className="flex items-center gap-3 sm:gap-4 p-3.5 sm:p-5">
                    {/* Left Icon Container - Uniform sizing across Bills & Groups */}
                    <div className={`p-2.5 sm:p-3 rounded-xl transition-colors shrink-0 flex items-center justify-center ${iconContainerClass}`}>
                        {icon}
                    </div>

                    {/* Middle Content */}
                    <div className="flex-1 min-w-0">
                        {/* Row 1: Title & Total Amount */}
                        <div className="flex items-center justify-between gap-2">
                            <h3 className={`font-bold text-base sm:text-lg truncate text-foreground transition-colors flex-1 min-w-0 ${titleHoverClass}`}>
                                {title}
                            </h3>
                            {amount !== undefined && (
                                <span className="text-foreground font-black tabular-nums text-sm sm:text-base shrink-0 ml-2">
                                    {formatCurrency(amount)}
                                </span>
                            )}
                        </div>

                        {/* Optional Description (e.g. for group) */}
                        {description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {description}
                            </p>
                        )}

                        {/* Row 2: Badges & Metadata */}
                        <div className="flex items-center gap-2 sm:gap-3 mt-1.5 text-[10px] text-muted-foreground font-medium flex-wrap">
                            {/* Group Tag */}
                            {groupName && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0 inline-flex items-center gap-1 shadow-2xs">
                                    <Folder className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate max-w-[120px]">{groupName}</span>
                                </span>
                            )}

                            {/* Role Badge (Owner, Participant, Draft) */}
                            <RoleBadge role={role} isOwner={isOwner} />

                            {/* Sharing Status Badge */}
                            {sharingStatus === 'local' && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0 inline-flex items-center gap-1 shadow-2xs">
                                    <Shield className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                    <span>Local</span>
                                </span>
                            )}
                            {sharingStatus === 'shared' && visibility === 'public' && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0 inline-flex items-center gap-1 shadow-2xs">
                                    <Globe className="w-2.5 h-2.5 text-blue-500" />
                                    <span>Shared (Public)</span>
                                </span>
                            )}
                            {sharingStatus === 'shared' && visibility === 'restricted' && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 inline-flex items-center gap-1 shadow-2xs">
                                    <Users className="w-2.5 h-2.5 text-emerald-500" />
                                    <span>Shared (Participants)</span>
                                </span>
                            )}
                            {sharingStatus === 'revocation_pending' && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0 inline-flex items-center gap-1 shadow-2xs">
                                    <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                                    <span>Revocation Pending</span>
                                </span>
                            )}

                            {/* Timestamp */}
                            {timestamp && (
                                <div className={`flex items-center gap-1 shrink-0 ${isDraft ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}`}>
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span className="whitespace-nowrap">
                                        {formatConciseRelativeTime(timestamp)}
                                    </span>
                                </div>
                            )}

                            {/* Location */}
                            {location && (
                                <div className="flex items-center gap-1 truncate max-w-[140px] sm:max-w-none shrink-0">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{location}</span>
                                </div>
                            )}

                            {/* Extra metadata (e.g. line items or members count for draft) */}
                            {extraMetadata}
                        </div>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        {onDelete && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-xl text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all active:scale-95"
                                title="Delete"
                                aria-label="Delete"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <div className={`h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center rounded-full bg-muted transition-all duration-300 ${chevronHoverClass}`}>
                            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function LandingCardSkeleton({ hint }: { hint?: string }) {
    return (
        <Card className="rounded-2xl sm:rounded-3xl border border-border/50 shadow-xs bg-card/60 select-none pointer-events-none">
            <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-3 sm:gap-4">
                    {/* Left Icon Placeholder */}
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-muted/70 animate-pulse shrink-0" />

                    {/* Middle Info Placeholders */}
                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-4 w-32 sm:w-48 bg-muted/80 rounded-md animate-pulse" />
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-14 sm:w-18 bg-muted/50 rounded-full animate-pulse" />
                            <div className="h-3 w-20 sm:w-24 bg-muted/40 rounded-full animate-pulse" />
                            {hint && (
                                <span className="text-[10px] text-muted-foreground/60 italic animate-pulse">
                                    {hint}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right Amount Placeholder */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="h-4 sm:h-5 w-16 sm:w-20 bg-muted/70 rounded-md animate-pulse" />
                        <div className="w-4 h-4 rounded bg-muted/30 animate-pulse" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
