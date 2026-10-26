'use client';

import React, { useEffect } from 'react';
import { Search, Sparkles, Command } from 'lucide-react';
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
      className="fixed bottom-0 left-0 right-0 z-30 flex flex-col items-center justify-end px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none"
    >
      <div className="w-full max-w-sm sm:max-w-md flex flex-col items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={onClick}
          className="group relative flex items-center justify-between gap-3 w-full h-11 sm:h-12 px-4 rounded-full bg-card/90 dark:bg-card/85 backdrop-blur-2xl border border-border/80 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:shadow-[0_12px_36px_rgba(0,0,0,0.18)] transition-all duration-300 active:scale-[0.98] cursor-pointer"
          aria-label="Search bills, groups and items"
        >
          {/* Subtle hover gradient pill glow */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/5 via-blue-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

          <div className="relative flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-full bg-primary/10 text-primary shrink-0 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
              <Search className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold truncate text-muted-foreground group-hover:text-foreground transition-colors">
              Search bills, groups &amp; items...
            </span>
          </div>

          <div className="relative flex items-center gap-1.5 shrink-0">
            <span className="hidden xs:inline-flex items-center gap-1 text-[10px] font-bold text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Fuzzy</span>
            </span>

            <kbd className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-mono font-bold text-muted-foreground bg-muted/80 rounded-md border border-border/70 group-hover:border-foreground/30 transition-colors shadow-2xs">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </kbd>
          </div>
        </button>

        {footer}
      </div>
    </motion.div>
  );
}
