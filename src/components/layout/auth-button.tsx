'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LogOut, Sparkles, Settings } from 'lucide-react';
import { IS_DEV } from '@/lib/env';
import { DevLoginModal } from '@/components/layout/dev-login-modal';

interface AuthButtonProps {
  avatarOnly?: boolean;
  onOpenSettings?: () => void;
}

export function AuthButton({ avatarOnly = true, onOpenSettings }: AuthButtonProps = {}) {
  const { user, isLoading, signOut } = useAuthStore();
  const [isDevLoginOpen, setIsDevLoginOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Do not render anything in header when loading or when user is not logged in
  if (isLoading || !user) {
    return null;
  }

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={avatarOnly
              ? "h-8 w-8 sm:h-9 sm:w-9 p-0 rounded-xl border-foreground/15 hover:bg-foreground/5 font-bold transition-all text-xs shrink-0"
              : "h-8 sm:h-9 gap-2 px-2.5 sm:px-3 rounded-xl border-foreground/15 hover:bg-foreground/5 font-bold transition-all text-xs shrink-0"
            }
            title={user.name || user.email}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name || user.email}
                className={avatarOnly ? "w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full object-cover border border-foreground/10" : "w-5 h-5 rounded-full object-cover border border-foreground/10"}
              />
            ) : (
              <div className={avatarOnly ? "w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-black" : "w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-black"}>
                {initials}
              </div>
            )}
            {!avatarOnly && (
              <span className="hidden sm:inline max-w-[100px] sm:max-w-[140px] truncate">
                {user.name || user.email.split('@')[0]}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 bg-card/95 backdrop-blur-xl border-border rounded-2xl shadow-xl" align="end">
          <div className="space-y-3">
            <div className="flex items-center gap-3 pb-2 border-b border-border/60">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name || user.email}
                  className="w-10 h-10 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-black">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-foreground truncate">{user.name || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate font-medium">{user.email}</p>
              </div>
            </div>

            <div className="space-y-1">
              {onOpenSettings && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs font-bold gap-2 text-foreground hover:bg-muted h-8"
                  onClick={() => {
                    setPopoverOpen(false);
                    onOpenSettings();
                  }}
                >
                  <Settings className="w-4 h-4 text-primary" />
                  App Settings
                </Button>
              )}

              {IS_DEV && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs font-bold gap-2 text-muted-foreground hover:text-foreground h-8"
                  onClick={() => setIsDevLoginOpen(true)}
                >
                  <Sparkles className="w-4 h-4" />
                  Switch Dev Account
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs font-bold gap-2 text-destructive hover:bg-destructive/10 h-8"
                onClick={signOut}
              >
                <LogOut className="w-4 h-4" />
                Log out
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Dev Login Modal */}
      {IS_DEV && (
        <DevLoginModal open={isDevLoginOpen} onOpenChange={setIsDevLoginOpen} />
      )}
    </>
  );
}
