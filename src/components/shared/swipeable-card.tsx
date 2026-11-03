'use client';

import React, { useRef, useCallback } from 'react';
import { motion, useAnimation, useMotionValue, useTransform } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SwipeableCardProps {
  children: React.ReactNode;
  onDelete?: () => void;
  canDelete?: boolean;
  deleteLabel?: string;
  onClick?: (e?: React.MouseEvent) => void;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  /** Distance in px required to trigger delete directly on deep swipe (defaults to 130px to prevent accidental triggers) */
  triggerThreshold?: number;
}

/**
 * Reusable swipe-to-delete card component.
 * Allows swiping left to reveal the delete action underneath,
 * with high thresholds to eliminate accidental false-positive triggers.
 */
export function SwipeableCard({
  children,
  onDelete,
  canDelete = true,
  deleteLabel = 'Delete',
  onClick,
  className,
  contentClassName,
  disabled = false,
  triggerThreshold = 130,
}: SwipeableCardProps) {
  const controls = useAnimation();
  const x = useMotionValue(0);
  const isSwipingRef = useRef(false);
  const isOpenRef = useRef(false);

  const canSwipe = Boolean(onDelete && canDelete && !disabled);

  // Gradually reveal delete button as card is swiped left:
  // Hidden during minor drag (0 to -20px) to prevent flash on diagonal scrolling.
  // Smoothly fades in from -20px to -70px.
  const deleteOpacity = useTransform(x, [-20, -70], [0, 1]);
  const deleteScale = useTransform(x, [-20, -70], [0.85, 1]);

  const snapClose = useCallback(() => {
    controls.start({ x: 0, transition: { type: 'spring', damping: 25, stiffness: 350 } });
    isOpenRef.current = false;
  }, [controls]);

  const snapOpen = useCallback(() => {
    controls.start({ x: -84, transition: { type: 'spring', damping: 25, stiffness: 350 } });
    isOpenRef.current = true;
  }, [controls]);

  const handleDragStart = () => {
    isSwipingRef.current = true;
  };

  const handleDragEnd = async (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    // High threshold to eliminate false positives:
    // Only a deliberate deep drag (< -130px) or high velocity with solid offset (< -90px & velocity < -650) triggers directly
    const isDeepSwipe = offset < -triggerThreshold || (offset < -90 && velocity < -650);

    if (isDeepSwipe) {
      snapClose();
      onDelete?.();
    } else if (offset < -55 || (offset < -35 && velocity < -250)) {
      // Swiped enough to reveal delete button: snap open to -84px so user can tap delete
      snapOpen();
    } else {
      // Accidental small swipe or swipe right: snap closed safely
      snapClose();
    }

    setTimeout(() => {
      isSwipingRef.current = false;
    }, 150);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isSwipingRef.current) return;
    if (isOpenRef.current) {
      // If card was open, clicking it snaps it closed rather than triggering card navigation
      snapClose();
      return;
    }
    onClick?.(e);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    snapClose();
    onDelete?.();
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 hover:border-foreground/30 transition-colors shadow-xs bg-card select-none touch-manipulation",
        className
      )}
    >
      {/* Background Delete Action (Revealed underneath upon swiping left) */}
      {canSwipe && (
        <motion.div
          style={{ opacity: deleteOpacity, scale: deleteScale }}
          onClick={handleDeleteClick}
          className="absolute inset-y-0 right-0 w-24 bg-destructive text-destructive-foreground flex flex-col items-center justify-center gap-1 font-bold text-xs cursor-pointer select-none z-0 rounded-r-2xl"
          title={deleteLabel}
          aria-label={deleteLabel}
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider">{deleteLabel}</span>
        </motion.div>
      )}

      {/* Foreground Draggable Card Surface */}
      <motion.div
        style={{ x }}
        drag={canSwipe ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: -140, right: 0 }}
        dragElastic={0.15}
        dragMomentum={false}
        animate={controls}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        className={cn(
          "relative z-10 bg-card transition-colors cursor-pointer",
          contentClassName
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}
