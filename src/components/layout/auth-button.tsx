'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { LogOut, Copy, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { IS_DEV } from '@/lib/env';
import { DevLoginModal } from '@/components/layout/dev-login-modal';

interface AuthButtonProps {
  avatarOnly?: boolean;
}

export function AuthButton({ avatarOnly = true }: AuthButtonProps = {}) {
  const { user, isLoading, signOut } = useAuthStore();
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isDevLoginOpen, setIsDevLoginOpen] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || 'https://ledger.mudoker.com');
  const prodOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://ledger.mudoker.com';
  const prodRedirect = `${prodOrigin}/api/auth/callback/google`;
  const localRedirect = `${currentOrigin}/api/auth/callback/google`;

  const copyToClipboard = (text: string, type: 'origin' | 'redirect') => {
    navigator.clipboard.writeText(text);
    if (type === 'origin') {
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2000);
    } else {
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 2000);
    }
  };

  // Do not render anything in header when loading or when user is not logged in
  if (isLoading || !user) {
    return null;
  }

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <>
      <Popover>
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
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs font-bold gap-2 text-muted-foreground hover:text-foreground h-8"
                onClick={() => setIsSetupModalOpen(true)}
              >
                <ShieldCheck className="w-4 h-4" />
                OAuth Setup Details
              </Button>

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

      {/* OAuth Setup Info Modal */}
      <Dialog open={isSetupModalOpen} onOpenChange={setIsSetupModalOpen}>
        <DialogContent className="max-w-lg p-5 rounded-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Google OAuth 2.0 Configuration
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure these in Google Cloud Console &gt; APIs &amp; Services &gt; Credentials.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Authorized JavaScript Origins
              </Label>
              <div className="flex items-center justify-between p-2 rounded-xl bg-muted font-mono text-[11px] border border-border">
                <span className="truncate">{prodOrigin}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 ml-2"
                  onClick={() => copyToClipboard(prodOrigin, 'origin')}
                >
                  {copiedOrigin ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Authorized Redirect URIs
              </Label>
              <div className="flex items-center justify-between p-2 rounded-xl bg-muted font-mono text-[11px] border border-border">
                <span className="truncate">{prodRedirect}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 ml-2"
                  onClick={() => copyToClipboard(prodRedirect, 'redirect')}
                >
                  {copiedRedirect ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                For local dev: <code className="bg-muted px-1 py-0.5 rounded">{localRedirect}</code>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dev Login Modal */}
      {IS_DEV && (
        <DevLoginModal open={isDevLoginOpen} onOpenChange={setIsDevLoginOpen} />
      )}
    </>
  );
}
