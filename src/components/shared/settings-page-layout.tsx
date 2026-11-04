'use client';

import React from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Check,
  CloudUpload,
  Shield,
  UserCheck,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsAdminProps {
  isReadOnly?: boolean;
  roleBadgeText?: string;
  adminTitle?: string;
  adminDescription?: string;
  onTransferClick?: () => void;
  onDeleteClick?: () => void;
  transferButtonText?: string;
  deleteButtonText?: string;
}

export interface SettingsPageLayoutProps {
  title: string;
  subtitle: string;
  icon?: React.ComponentType<{ className?: string }>;
  saving?: boolean;
  saved?: boolean;
  isLocal?: boolean;
  admin?: SettingsAdminProps;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Common headless layout wrapper for all Settings pages (Bill Settings & Group Settings).
 * Guarantees 100% design parity, identical typography, borders, shadows, and sync status pills.
 */
export function SettingsPageLayout({
  title,
  subtitle,
  icon: Icon = Settings,
  saving = false,
  saved = false,
  isLocal = false,
  admin,
  children,
  className,
  contentClassName,
}: SettingsPageLayoutProps) {
  return (
    <Card className={cn(
      "w-full h-full flex flex-col min-h-0 border-0 md:border md:border-border/50 bg-transparent md:bg-card/30 overflow-hidden shadow-none rounded-none md:rounded-2xl",
      className
    )}>
      {/* Header */}
      <CardHeader className="pb-2.5 pt-0 px-2 sm:px-4 md:px-5 md:pt-4 shrink-0 border-b border-border/40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] flex items-center justify-center text-foreground shrink-0 shadow-2xs">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate">
                {title}
              </h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Sync status pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/[0.04] border border-foreground/[0.08] text-[10px] font-semibold text-muted-foreground shrink-0">
            {saving ? (
              <>
                <div className="w-2.5 h-2.5 border-[1.5px] border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
                <span>Saving</span>
              </>
            ) : saved ? (
              <>
                <Check className="w-3 h-3 text-primary" />
                <span className="text-foreground">Saved</span>
              </>
            ) : isLocal ? (
              <>
                <Shield className="w-3 h-3 text-muted-foreground/70" />
                <span>Local</span>
              </>
            ) : (
              <>
                <CloudUpload className="w-3 h-3 text-muted-foreground/70" />
                <span>Synced</span>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Main Scrollable Content */}
      <CardContent className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 min-h-0 h-full px-2 sm:px-4 md:px-5">
          <div className={cn("py-3 sm:py-4 space-y-4 max-w-3xl pb-10", contentClassName)}>
            {children}

            {/* Optional Unified Administration & Danger Zone Card */}
            {admin && (
              <div className="p-3.5 sm:p-4 rounded-2xl border border-border/70 bg-card/60 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                    <p className="text-xs font-bold text-foreground">
                      {admin.adminTitle || (admin.isReadOnly ? 'Read-Only Access' : 'Administration')}
                    </p>
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                      admin.isReadOnly
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary border border-primary/20"
                    )}>
                      {admin.roleBadgeText || (admin.isReadOnly ? 'Viewer' : 'Owner')}
                    </span>
                  </div>
                  {admin.adminDescription && (
                    <p className="text-[11px] text-muted-foreground">
                      {admin.adminDescription}
                    </p>
                  )}
                </div>

                {!admin.isReadOnly && (admin.onTransferClick || admin.onDeleteClick) && (
                  <div className="flex items-center gap-2 shrink-0">
                    {admin.onTransferClick && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={admin.onTransferClick}
                        className="h-8 rounded-xl font-semibold text-xs gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                        <span>{admin.transferButtonText || 'Transfer'}</span>
                      </Button>
                    )}
                    {admin.onDeleteClick && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={admin.onDeleteClick}
                        className="h-8 rounded-xl font-semibold text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{admin.deleteButtonText || 'Delete'}</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
