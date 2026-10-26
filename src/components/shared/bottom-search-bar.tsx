'use client';

import React, { useEffect } from 'react';
import { Search } from 'lucide-react';
import { motion } from 'framer-motion';

interface BottomSearchBarProps {
  onClick: () => void;
  footer?: React.ReactNode;
}

export function BottomSearchBar({ onClick, footer }: BottomSearchBarProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClick]);

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0.1 }}
      className="fixed bottom-0 left-0 right-0 z-30 flex flex-col items-center justify-end px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none"
    >
      <div className="w-full max-w-md sm:max-w-lg flex flex-col items-center gap-2.5 sm:gap-3 pointer-events-auto">
        <button
          type="button"
          onClick={onClick}
          className="group relative flex items-center justify-between gap-3 w-full h-12 sm:h-13 px-2.5 sm:px-3 rounded-full bg-card/90 dark:bg-card/85 backdrop-blur-2xl border border-primary/50 dark:border-primary/60 shadow-[0_8px_32px_rgba(0,0,0,0.25)] text-foreground hover:border-primary/80 transition-all duration-300 active:scale-[0.98] cursor-pointer"
          aria-label="Search bills, groups and items"
        >
          {/* Subtle hover gradient pill glow */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/10 via-emerald-500/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

          <div className="relative flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground dark:bg-emerald-500 dark:text-zinc-950 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              <Search className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-xs sm:text-sm font-semibold truncate text-foreground/90 group-hover:text-foreground transition-colors">
              Search bills, groups &amp; items...
            </span>
          </div>

          <kbd className="relative inline-flex items-center justify-center h-7 sm:h-8 px-2.5 sm:px-3 text-xs font-mono font-medium text-muted-foreground bg-muted/60 rounded-full border border-border/80 group-hover:border-foreground/30 transition-colors shrink-0">
            <span className="text-sm mr-0.5 leading-none">⌘</span>
            <span>K</span>
          </kbd>
        </button>

        {footer}
      </div>
    </motion.div>
  );
}
