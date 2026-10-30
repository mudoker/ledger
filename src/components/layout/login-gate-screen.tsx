'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppLogo } from '@/components/shared/app-logo';
import { GoogleIcon } from '@/components/shared/google-icon';
import { ShieldCheck, WifiOff, Sparkles, ArrowRight, User } from 'lucide-react';
import { IS_DEV } from '@/lib/env';

export function LoginGateScreen() {
  const { signInWithGoogle, offlineLogin, devLogin } = useAuthStore();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [showOfflineForm, setShowOfflineForm] = useState(false);
  const [error, setError] = useState('');

  const handleOfflineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email or username');
      return;
    }
    setError('');
    await offlineLogin(email.trim(), name.trim());
  };

  const handleQuickDevLogin = async (devEmail: string, devName: string) => {
    await devLogin(devEmail, devName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background text-foreground overflow-y-auto">
      <div className="w-full max-w-md mx-auto my-auto space-y-6 text-center">
        {/* Brand Icon & Title */}
        <div className="space-y-3 flex flex-col items-center">
          <div className="w-14 h-14 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
            <AppLogo className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">Welcome to Ledger</h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
              Privacy-first bill splitting and fair allocations. Your data stays on your device by default.
            </p>
          </div>
        </div>

        {/* Card Body */}
        <div className="bg-card border border-border/80 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-left">
          {/* Google Sign In */}
          <Button
            onClick={signInWithGoogle}
            className="w-full h-11 rounded-2xl bg-foreground text-background hover:bg-foreground/90 font-bold text-xs sm:text-sm gap-2.5 shadow-sm"
          >
            <GoogleIcon className="w-4 h-4" />
            Continue with Google
          </Button>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-border/60 w-full" />
            <span className="bg-card px-3 text-[10px] uppercase tracking-wider font-bold text-muted-foreground shrink-0">
              Or Offline Access
            </span>
          </div>

          {/* Offline / Local Sign In */}
          {!showOfflineForm ? (
            <Button
              variant="outline"
              onClick={() => setShowOfflineForm(true)}
              className="w-full h-10 rounded-2xl border-border/80 text-xs font-bold gap-2 text-foreground hover:bg-muted"
            >
              <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
              Sign in with Local Device Account
            </Button>
          ) : (
            <form onSubmit={handleOfflineSubmit} className="space-y-3 pt-1">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground">Email or Display Name</Label>
                <Input
                  placeholder="e.g. alex@example.com or Alex"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  className="h-9 rounded-xl text-xs bg-muted/30"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground">Full Name (Optional)</Label>
                <Input
                  placeholder="e.g. Alex Henderson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 rounded-xl text-xs bg-muted/30"
                />
              </div>

              {error && <p className="text-[11px] font-bold text-destructive">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOfflineForm(false)}
                  className="rounded-xl text-xs font-bold h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="flex-1 rounded-xl text-xs font-bold h-9 bg-primary text-primary-foreground gap-1.5"
                >
                  <span>Start Offline Session</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </form>
          )}

          {/* Dev Quick Accounts */}
          {IS_DEV && (
            <div className="pt-2 border-t border-border/50 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" /> Dev Quick Login
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { name: 'Alex', email: 'alex@example.com' },
                  { name: 'Bob', email: 'bob@example.com' },
                  { name: 'Charlie', email: 'charlie@example.com' },
                ].map((dev) => (
                  <button
                    key={dev.email}
                    type="button"
                    onClick={() => handleQuickDevLogin(dev.email, dev.name)}
                    className="p-2 rounded-xl bg-muted/40 hover:bg-muted text-center border border-border/50 text-[11px] font-bold text-foreground transition-all active:scale-95 flex flex-col items-center gap-0.5"
                  >
                    <User className="w-3 h-3 text-primary" />
                    <span>{dev.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Privacy Note */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>Local-First by default. Cloud upload requires your explicit consent.</span>
        </div>
      </div>
    </div>
  );
}
