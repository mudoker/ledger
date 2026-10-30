'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DeleteConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: React.ReactNode;
  itemName?: string;
  itemType?: string;
  warningNotice?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function DeleteConfirmationModal({
  open,
  onOpenChange,
  title = 'Delete Confirmation',
  description,
  itemName,
  itemType,
  warningNotice,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isLoading = false,
  onConfirm,
}: DeleteConfirmationModalProps) {
  const [internalLoading, setInternalLoading] = React.useState(false);
  const isPending = isLoading || internalLoading;

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isPending) return;

    setInternalLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error('Delete action failed:', err);
    } finally {
      setInternalLoading(false);
    }
  };

  const defaultDescription = itemName
    ? `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
    : `Are you sure you want to delete this ${itemType || 'item'}? This action cannot be undone.`;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <AlertDialogContent className="max-w-md p-5 rounded-2xl sm:rounded-3xl bg-card border-border shadow-2xl">
        <AlertDialogHeader className="space-y-1.5 text-left">
          <div className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center mb-1">
            <Trash2 className="w-5 h-5" />
          </div>
          <AlertDialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {description || defaultDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {warningNotice && (
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="leading-snug">{warningNotice}</div>
          </div>
        )}

        <AlertDialogFooter className="pt-2 gap-2 flex-row justify-end sm:space-x-2">
          <AlertDialogCancel
            disabled={isPending}
            className="rounded-xl font-bold text-xs mt-0 border-border"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(
              "rounded-xl font-bold text-xs gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>{confirmText}</span>
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
