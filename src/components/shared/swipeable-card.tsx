import React, { useRef } from 'react';
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
}

/**
 * Reusable swipe-to-delete card component.
 * Allows swiping left to reveal the delete action underneath,
 * while preventing accidental clicks during swipe gestures.
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
}: SwipeableCardProps) {
  const controls = useAnimation();
  const x = useMotionValue(0);
  const isSwipingRef = useRef(false);

  const canSwipe = Boolean(onDelete && canDelete && !disabled);

  // Gradually reveal delete button as card is swiped left:
  // At x = 0 (tap or resting), opacity is 0 (completely invisible, never overlaps or flashes on tap).
  // As user swipes left (x moves from -10px to -60px), delete smoothly fades in underneath the sliding card.
  const deleteOpacity = useTransform(x, [-10, -60], [0, 1]);
  const deleteScale = useTransform(x, [-10, -60], [0.8, 1]);

  const handleDragStart = () => {
    isSwipingRef.current = true;
  };

  const handleDragEnd = async (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -60 || info.velocity.x < -300) {
      controls.start({ x: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } });
      onDelete?.();
    } else {
      controls.start({ x: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } });
    }
    setTimeout(() => {
      isSwipingRef.current = false;
    }, 100);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isSwipingRef.current) return;
    onClick?.(e);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 hover:border-foreground/30 transition-colors shadow-xs bg-card select-none touch-manipulation",
        className
      )}
    >
      {/* Background Delete Action (Revealed underneath only upon swiping left) */}
      {canSwipe && (
        <motion.div
          style={{ opacity: deleteOpacity, scale: deleteScale }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="absolute inset-y-0 right-0 w-24 bg-destructive text-destructive-foreground flex flex-col items-center justify-center gap-1 font-bold text-xs cursor-pointer select-none z-0 rounded-r-2xl"
          title={deleteLabel}
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
        dragConstraints={{ left: -96, right: 0 }}
        dragElastic={0.12}
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
