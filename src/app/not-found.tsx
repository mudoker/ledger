'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion, ArrowLeft, Home, Sparkles } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-background via-muted/20 to-background text-foreground text-center">
      <div className="w-full max-w-md mx-auto space-y-6 bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        {/* 404 Badge & Icon */}
        <div className="mx-auto w-20 h-20 rounded-3xl bg-muted border border-border flex items-center justify-center text-primary shadow-inner relative">
          <FileQuestion className="w-10 h-10 text-primary" />
          <span className="absolute -bottom-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black tracking-widest uppercase">
            404
          </span>
        </div>

        {/* Text Details */}
        <div className="space-y-2 pt-2">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Page Not Found
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            The page or bill you are looking for does not exist, has been removed, or the link has expired.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
          <Link href="/" className="w-full">
            <Button
              className="w-full h-11 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs sm:text-sm gap-2 shadow-sm"
            >
              <Home className="w-4 h-4" />
              Return to Ledger
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
