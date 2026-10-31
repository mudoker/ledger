'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface BottomNavItem<T extends string = string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number | string | null;
  onClick?: () => void;
}

export interface BottomNavProps<T extends string = string> {
  items: BottomNavItem<T>[];
  activeId: T;
  onChange?: (id: T) => void;
  className?: string;
  desktopHidden?: boolean; // default true (md:hidden)
}

export function BottomNav<T extends string = string>({
  items,
  activeId,
  onChange,
  className,
  desktopHidden = true,
}: BottomNavProps<T>) {
  return (
    <nav
      aria-label="Bottom Navigation"
      className={cn(
        "flex-none bg-card/95 dark:bg-[#121215]/95 backdrop-blur-2xl border-t border-border/80 select-none pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_24px_rgba(0,0,0,0.35)] z-30 transition-all duration-200 [html[data-keyboard-open='true']_&]:hidden",
        desktopHidden && "md:hidden",
        className
      )}
    >
      <div className="flex h-14 max-w-md mx-auto items-center justify-around px-2">
        {items.map((item) => {
          const isActive = item.id === activeId;
          const Icon = item.icon;
          const showBadge =
            item.badge !== undefined &&
            item.badge !== null &&
            (typeof item.badge === 'number' ? item.badge > 0 : Boolean(item.badge));

          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                "group flex flex-1 flex-col items-center justify-center py-1 touch-manipulation transition-all duration-150 active:scale-95 relative",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                item.onClick?.();
                onChange?.(item.id);
              }}
            >
              <div className="relative flex items-center justify-center">
                <div
                  className={cn(
                    "p-1 rounded-xl transition-all",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <Icon
                    className="w-5 h-5 transition-colors duration-150"
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </div>
                {showBadge && (
                  <span
                    className={cn(
                      "absolute -top-1 -right-2 text-[9px] font-black h-4 min-w-4 px-1 rounded-full flex items-center justify-center shadow-sm",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-foreground/20 text-foreground"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "mt-0.5 text-[10px] leading-tight tracking-tight transition-colors duration-150",
                  isActive
                    ? "font-black text-primary"
                    : "font-semibold text-muted-foreground group-hover:text-foreground"
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
