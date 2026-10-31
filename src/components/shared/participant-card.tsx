'use client';

import React from 'react';
import { Crown, Pencil, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getInitials } from '@/constants/colors';

export interface ParticipantCardProps {
  id?: string;
  name: string;
  email?: string | null;
  avatarInitials?: string;
  isHost?: boolean;
  isAppMember?: boolean;
  badges?: React.ReactNode;
  financialInfo?: React.ReactNode;
  actions?: React.ReactNode;
  onEdit?: () => void;
  onRemove?: () => void;
  onClick?: () => void;
  isReadOnly?: boolean;
  className?: string;
  index?: number;
}

export function ParticipantCard({
  name,
  email,
  avatarInitials,
  isHost,
  isAppMember,
  badges,
  financialInfo,
  actions,
  onEdit,
  onRemove,
  onClick,
  isReadOnly = false,
  className,
  index,
}: ParticipantCardProps) {
  const initials = avatarInitials || getInitials(name);

  return (
    <div
      onClick={!isReadOnly && onClick ? onClick : undefined}
      className={cn(
        "flex items-center justify-between p-3 rounded-2xl bg-card border border-border/70 hover:border-border transition-all",
        !isReadOnly && onClick && "cursor-pointer hover:bg-card/90 hover:border-foreground/20 hover:shadow-sm",
        className
      )}
      style={index !== undefined ? { animationDelay: `${index * 40}ms` } : undefined}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Circular Avatar */}
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 select-none">
            {initials}
          </div>
          {isHost && (
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs border border-background">
              <Crown className="w-2 h-2" />
            </div>
          )}
        </div>

        {/* Info Column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold text-foreground truncate" title={name}>
              {name}
            </p>
            {isHost && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px] font-semibold shrink-0">
                Host
              </span>
            )}
            {isAppMember && !isHost && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 text-[10px] font-medium shrink-0"
                title={email ? `Registered user: ${email}` : "App User"}
              >
                <User className="w-2.5 h-2.5" /> Member
              </span>
            )}
            {badges}
          </div>

          {email ? (
            <p className="text-[10px] text-muted-foreground truncate">{email}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground/60 italic">Local Participant</p>
          )}

          {financialInfo && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">{financialInfo}</div>
          )}
        </div>
      </div>

      {/* Right Column: Actions */}
      <div
        className="flex items-center gap-1 shrink-0 ml-2"
        onClick={(e) => e.stopPropagation()}
      >
        {actions}
        {!isReadOnly && onEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 touch-manipulation active:scale-95 transition-colors"
            title="Edit participant"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}
        {!isReadOnly && onRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 touch-manipulation active:scale-95 transition-colors"
            title="Remove participant"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
