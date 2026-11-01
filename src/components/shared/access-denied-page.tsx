'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/useAuthStore';
import {
  ShieldAlert,
  ArrowLeft,
  Send,
  CheckCircle2,
  BellRing,
  Lock,
  Sparkles,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface AccessDeniedPageProps {
  billId?: string;
  billName?: string;
  onBackToHome: () => void;
}

export function AccessDeniedPage({
  billId,
  billName,
  onBackToHome,
}: AccessDeniedPageProps) {
  const user = useAuthStore((s) => s.user);

  const [requesterName, setRequesterName] = useState(user?.name || '');
  const [requesterEmail, setRequesterEmail] = useState(user?.email || '');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [notified, setNotified] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billId) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/bills/${billId}/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterName: requesterName.trim() || undefined,
          requesterEmail: requesterEmail.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to request access from bill owner');
      }

      setIsSuccess(true);
      setNotified(Boolean(data.notified));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 min-h-[80vh] flex items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-background via-muted/20 to-background">
      <div className="w-full max-w-lg bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center">
        {/* Subtle decorative glowing background */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Shield Header */}
        <div className="relative mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6 shadow-inner">
          <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500" />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center ring-2 ring-background">
            <ShieldAlert className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        {/* Title & Description */}
        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground mb-2">
          Access Restricted
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-md mx-auto mb-6">
          {billName ? (
            <>
              You do not have permission to view <span className="font-semibold text-foreground">"{billName}"</span>. This bill is shared privately with selected participants only.
            </>
          ) : (
            'This bill has been shared in restricted mode. Only whitelisted participants and the bill owner are allowed to view its details.'
          )}
        </p>

        {isSuccess ? (
          /* Success State */
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 mb-6 text-left">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-emerald-400">
                  Access Request Submitted!
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {notified ? (
                    <>
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                        <BellRing className="w-3.5 h-3.5 inline" /> Push notification sent
                      </span>{' '}
                      directly to the bill owner's device. You will be able to view this bill once they grant access.
                    </>
                  ) : (
                    'Your access request has been recorded. Once the owner opens Ledger, they will be able to approve your access.'
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Request Access Form */
          <form onSubmit={handleRequestAccess} className="space-y-4 text-left mb-6 bg-muted/40 p-4 sm:p-5 rounded-2xl border border-border/60">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Request Access from Owner
              </span>
            </div>

            {errorMessage && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-name" className="text-[11px] font-semibold text-muted-foreground">
                  Your Name
                </Label>
                <Input
                  id="req-name"
                  placeholder="e.g. Alex"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="h-9 text-xs bg-background"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-email" className="text-[11px] font-semibold text-muted-foreground">
                  Your Email
                </Label>
                <Input
                  id="req-email"
                  type="email"
                  placeholder="alex@example.com"
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  className="h-9 text-xs bg-background"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="req-note" className="text-[11px] font-semibold text-muted-foreground">
                Short Note (Optional)
              </Label>
              <Input
                id="req-note"
                placeholder="e.g. Hey, I ordered the pizza with you guys!"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-9 text-xs bg-background"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !billId}
              className="w-full gap-2 rounded-xl h-10 font-bold bg-amber-500 hover:bg-amber-600 text-black shadow-md mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending Request & Push...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Request Access via Push Notification
                </>
              )}
            </Button>
          </form>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2 border-t border-border/50">
          <Button
            variant="ghost"
            onClick={onBackToHome}
            className="w-full sm:w-auto gap-2 rounded-xl text-xs h-9 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
