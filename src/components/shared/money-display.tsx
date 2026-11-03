'use client';

import React from 'react';
import { formatCurrency } from '@/lib/format';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MoneyDisplayProps {
  amount?: number | null;
  currency?: string;
  isLoading?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
  spinnerClassName?: string;
  skeletonClassName?: string;
  variant?: 'text' | 'skeleton' | 'spinner';
}

/**
 * MoneyDisplay component that cleanly displays monetary amounts
 * with built-in spinning loader or pulsing skeleton while loading/converting.
 */
export function MoneyDisplay({
  amount,
  currency,
  isLoading = false,
  prefix,
  suffix,
  className,
  spinnerClassName,
  skeletonClassName,
  variant = 'spinner',
}: MoneyDisplayProps) {
  const isPending = isLoading || amount === undefined || amount === null;

  if (isPending) {
    if (variant === 'skeleton') {
      return (
        <span
          className={cn(
            "inline-block h-[1.1em] w-16 bg-muted/60 animate-pulse rounded-md align-middle",
            skeletonClassName
          )}
          aria-label="Loading amount"
        />
      );
    }

    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-muted-foreground/80 align-middle",
          className
        )}
        aria-label="Updating amount"
      >
        <Loader2 className={cn("w-3.5 h-3.5 animate-spin text-primary shrink-0", spinnerClassName)} />
        <span className="text-[10px] font-mono opacity-70">...</span>
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {formatCurrency(amount, currency)}
      {suffix}
    </span>
  );
}
