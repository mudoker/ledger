'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CountDisplayProps {
  count?: number | null;
  isLoading?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
  spinnerClassName?: string;
  skeletonClassName?: string;
  variant?: 'spinner' | 'skeleton';
}

/**
 * Clean reusable component for counts (bill counts, participant counts, item counts).
 * Displays spinning loader or pulse skeleton while data is syncing or loading.
 */
export function CountDisplay({
  count,
  isLoading = false,
  prefix = '',
  suffix = '',
  className,
  spinnerClassName,
  skeletonClassName,
  variant = 'spinner',
}: CountDisplayProps) {
  const isPending = isLoading || count === undefined || count === null;

  if (isPending) {
    if (variant === 'skeleton') {
      return (
        <span
          className={cn(
            "inline-block h-3.5 w-5 bg-muted/60 animate-pulse rounded align-middle",
            skeletonClassName
          )}
          aria-label="Loading count"
        />
      );
    }

    return (
      <span className={cn("inline-flex items-center gap-0.5 align-middle", className)} aria-label="Loading count">
        <Loader2 className={cn("w-2.5 h-2.5 animate-spin text-primary shrink-0", spinnerClassName)} />
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {count}
      {suffix}
    </span>
  );
}
