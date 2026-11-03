'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, ArrowDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
  threshold?: number;
  disabled?: boolean;
}

/**
 * Reusable Pull-To-Refresh wrapper for touch devices and lists.
 * When pulled down past threshold, triggers fresh data retrieval
 * bypassing stale caches.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
  threshold = 64,
  disabled = false,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    const target = containerRef.current;
    if (!target) return;

    // Only allow pull-down if user is at the very top of the scroll container
    if (target.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current || disabled || isRefreshing) return;
    const target = containerRef.current;
    if (!target) return;

    if (target.scrollTop > 0) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diffY = currentY - touchStartY.current;

    if (diffY > 0) {
      // Damped pull curve (diminishing returns)
      const damped = Math.min(110, Math.pow(diffY, 0.85) * 1.5);
      setPullDistance(damped);
      if (damped > 8 && e.cancelable) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
    }
  };

  const executeRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPullDistance(threshold * 0.75); // Hold indicator in view
    try {
      await onRefresh();
    } catch (err) {
      console.error('PullToRefresh error:', err);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
      isPulling.current = false;
    }
  }, [onRefresh, threshold]);

  const handleTouchEnd = () => {
    if (!isPulling.current || disabled || isRefreshing) return;
    isPulling.current = false;

    if (pullDistance >= threshold) {
      executeRefresh();
    } else {
      setPullDistance(0);
    }
  };

  const progress = Math.min(1, pullDistance / threshold);
  const isReady = pullDistance >= threshold;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={cn("relative overflow-y-auto overscroll-contain flex-1 min-h-0", className)}
    >
      {/* Pull Indicator Pill */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          style={{
            transform: `translateY(${pullDistance - 44}px)`,
            opacity: Math.max(0.2, progress),
          }}
          className="absolute top-0 left-0 right-0 z-40 flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out"
        >
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/95 backdrop-blur-md border border-border/80 shadow-lg text-xs font-semibold text-foreground">
            {isRefreshing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                <span className="text-[11px] text-primary">Fetching latest...</span>
              </>
            ) : isReady ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-primary shrink-0 animate-spin" />
                <span className="text-[11px] text-primary">Release to refresh</span>
              </>
            ) : (
              <>
                <ArrowDown
                  style={{ transform: `rotate(${progress * 180}deg)` }}
                  className="w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0"
                />
                <span className="text-[11px] text-muted-foreground">Pull down to refresh</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content with dynamic slight translateY when pulled */}
      <div
        style={{
          transform: isRefreshing
            ? 'translateY(36px)'
            : pullDistance > 0
            ? `translateY(${pullDistance * 0.4}px)`
            : 'none',
          transition: isPulling.current ? 'none' : 'transform 200ms ease-out',
        }}
        className="w-full h-full min-h-full flex flex-col"
      >
        {children}
      </div>
    </div>
  );
}
