'use client';

import React, { useState, useRef, useCallback } from 'react';
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
 * Clean, touch-friendly Pull-To-Refresh container.
 * Invariants:
 * 1. NEVER applies CSS transforms to `{children}`, preserving fixed bottom bars and preventing scroll jumping.
 * 2. Respects horizontal swipe gestures (card swiping / swipe-to-delete) without interception.
 * 3. Only engages when the scroll position is strictly at the top.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
  threshold = 60,
  disabled = false,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    const target = containerRef.current;
    if (!target) return;

    const isWindowAtTop = typeof window !== 'undefined' ? window.scrollY <= 1 : true;
    const isTargetAtTop = target.scrollTop <= 1;

    // Only engage if strictly at the top of both container and window
    if (isWindowAtTop && isTargetAtTop) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current || disabled || isRefreshing) return;
    const target = containerRef.current;
    if (!target) return;

    const isWindowAtTop = typeof window !== 'undefined' ? window.scrollY <= 1 : true;
    const isTargetAtTop = target.scrollTop <= 1;

    if (!isWindowAtTop || !isTargetAtTop) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const diffY = currentY - touchStartY.current;
    const diffX = currentX - touchStartX.current;

    // If gesture is horizontal (e.g. swiping to delete card), do NOT pull to refresh
    if (Math.abs(diffX) > Math.abs(diffY)) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }

    if (diffY > 0) {
      // Damped curve for smooth spring feel
      const damped = Math.min(80, Math.pow(diffY, 0.8) * 1.2);
      setPullDistance(damped);

      // Only cancel browser bounce if deliberately pulling downward past deadzone
      if (damped > 24 && e.cancelable) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
    }
  };

  const executeRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPullDistance(44); // Keep pill visible during fetch
    try {
      await onRefresh();
    } catch (err) {
      console.error('PullToRefresh error:', err);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
      isPulling.current = false;
    }
  }, [onRefresh]);

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
      className={cn("relative min-h-0", className)}
    >
      {/* Floating Pull Indicator Pill (Does NOT displace or transform children) */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          style={{
            transform: `translateY(${Math.max(8, pullDistance - 16)}px)`,
            opacity: Math.max(0.3, progress),
          }}
          className="absolute top-0 left-0 right-0 z-40 flex items-center justify-center pointer-events-none transition-transform duration-100 ease-out"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/95 dark:bg-card/90 backdrop-blur-md border border-border/80 shadow-lg text-xs font-semibold text-foreground">
            {isRefreshing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                <span className="text-[11px] text-primary font-bold">Fetching latest...</span>
              </>
            ) : isReady ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-primary shrink-0 animate-spin" />
                <span className="text-[11px] text-primary font-bold">Release to refresh</span>
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

      {/* Render children directly without CSS transform to keep bottom bar and scroll tree 100% stable */}
      {children}
    </div>
  );
}
