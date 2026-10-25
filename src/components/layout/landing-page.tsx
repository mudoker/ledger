import { useEffect, useState } from 'react';
import { useBillStore } from "@/store/useBillStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Clock, ChevronRight, Receipt, Users as UsersIcon, Play, History, MapPin, Shield, LogIn, Sparkles } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/format';
import { motion } from 'framer-motion';
import { IS_DEV } from '@/lib/env';
import { AppLogo } from '@/components/shared/app-logo';
import { GoogleIcon } from '@/components/shared/google-icon';
import { DevLoginModal } from '@/components/layout/dev-login-modal';
import { CreateBillModal, type CreateBillFormData } from '@/components/shared/create-bill-modal';

interface LandingPageProps {
    onNewBill: (data: CreateBillFormData) => void;
    onSelectBill: (id: string | 'current') => void;
    onLoadDemo?: () => void;
}

export function LandingPage({ onNewBill, onSelectBill, onLoadDemo }: LandingPageProps) {
    const { billHistory, fetchHistory, isHydrated, people, items, dbStatus } = useBillStore();
    const { user, signInWithGoogle, signOut } = useAuthStore();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isDevLoginOpen, setIsDevLoginOpen] = useState(false);

    useEffect(() => {
        if (isHydrated) {
            fetchHistory();
        }
    }, [isHydrated, fetchHistory, user]);

    const hasActiveLocalData = Boolean(user) && (people.length > 0 || items.length > 0);

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background">
            {/* Hero Section */}
            <div className="flex-none pt-4 sm:pt-12 pb-6 sm:pb-16 px-4 sm:px-6 text-center space-y-3.5 sm:space-y-6 max-w-2xl mx-auto w-full">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex p-2.5 sm:p-3 bg-foreground/5 rounded-2xl mb-1 sm:mb-2"
                >
                    <AppLogo className="w-8 h-8 sm:w-10 sm:h-10 text-foreground/80" />
                </motion.div>
                <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground leading-tight"
                >
                    Split Bills. <br />Not Friendships.
                </motion.h1>
                <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="text-muted-foreground text-xs sm:text-lg max-w-md mx-auto px-2 leading-relaxed"
                >
                    The smartest way to split group bills, handle sponsors, and manage late arrivals.
                </motion.p>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="flex flex-col items-center gap-3 sm:gap-4 pt-2 sm:pt-4 w-full"
                >
                    <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4 justify-center w-full max-w-sm sm:max-w-none">
                        {hasActiveLocalData && (
                            <Button
                                onClick={() => {
                                    if (!user) return;
                                    onSelectBill('current');
                                }}
                                variant="outline"
                                size="lg"
                                className="h-11 sm:h-14 px-5 sm:px-8 text-sm sm:text-lg font-bold gap-2 rounded-xl sm:rounded-2xl border-2 transition-all hover:bg-foreground/5 w-full sm:w-auto touch-manipulation active:scale-95"
                            >
                                <Play className="w-4 h-4 sm:w-6 sm:h-6" /> Resume Last
                            </Button>
                        )}
                        {user ? (
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                size="lg"
                                className="h-11 sm:h-14 px-5 sm:px-8 text-sm sm:text-lg font-bold gap-2 rounded-xl sm:rounded-2xl shadow-xl shadow-foreground/10 transition-all hover:scale-105 active:scale-95 bg-foreground text-background hover:bg-foreground/90 w-full sm:w-auto touch-manipulation"
                            >
                                <Plus className="w-4 h-4 sm:w-6 sm:h-6" /> Start New
                            </Button>
                        ) : (
                            <Button
                                onClick={signInWithGoogle}
                                size="lg"
                                className="h-11 sm:h-14 px-5 sm:px-8 text-sm sm:text-lg font-bold gap-3 rounded-xl sm:rounded-2xl shadow-xl shadow-foreground/10 transition-all hover:scale-105 active:scale-95 bg-foreground text-background hover:bg-foreground/90 w-full sm:w-auto touch-manipulation"
                            >
                                <GoogleIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                                <span>Sign in with Google</span>
                            </Button>
                        )}
                    </div>

                    <CreateBillModal
                        open={isCreateModalOpen}
                        onOpenChange={setIsCreateModalOpen}
                        onSubmit={onNewBill}
                    />

                    <div className="flex flex-wrap items-center justify-center gap-2 mt-1 sm:mt-2">
                        {onLoadDemo && (
                            <Button
                                onClick={onLoadDemo}
                                variant="ghost"
                                size="sm"
                                className="text-xs font-bold text-muted-foreground hover:text-foreground gap-1.5 touch-manipulation active:scale-95"
                            >
                                <Sparkles className="w-3.5 h-3.5 text-primary" /> Try Sample Bill
                            </Button>
                        )}
                        {IS_DEV && !user && (
                            <Button
                                onClick={() => setIsDevLoginOpen(true)}
                                variant="ghost"
                                size="sm"
                                className="text-xs font-bold text-muted-foreground hover:text-foreground gap-1.5"
                            >
                                <Sparkles className="w-3.5 h-3.5" /> Dev Mock Login
                            </Button>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Recent History Section */}
            <div className="flex-1 px-4 sm:px-6 max-w-2xl mx-auto w-full flex flex-col">
                <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
                            {user ? 'My Bills & Shared Bills' : 'Recent Transactions'}
                        </h2>
                    </div>
                    {(() => {
                        if (!dbStatus.isOnline) {
                            return (
                                <span
                                    className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wider"
                                    title="Backend server is offline. Run 'bun run dev' or 'bun run server'"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Server Offline
                                </span>
                            );
                        }
                        if (dbStatus.type === 'neon') {
                            return (
                                <span
                                    className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider"
                                    title="Connected to Neon PostgreSQL Database"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Neon DB
                                </span>
                            );
                        }
                        if (dbStatus.type === 'postgres') {
                            return (
                                <span
                                    className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider"
                                    title="Connected to PostgreSQL Database"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> PostgreSQL
                                </span>
                            );
                        }
                        return (
                            <span
                                className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider"
                                title={dbStatus.isFallback ? `Fallback active: ${dbStatus.fallbackReason}` : "Using local SQLite database. Set DATABASE_URL in .env to connect to Neon."}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                                {dbStatus.isFallback ? 'Fallback (SQLite)' : 'Local SQLite'}
                            </span>
                        );
                    })()}
                </div>

                <div className="w-full">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="grid gap-3 sm:gap-4 pb-8 sm:pb-12"
                    >
                        {!user ? (
                            <div className="flex flex-col items-center justify-center py-10 sm:py-14 text-center space-y-3 sm:space-y-4 rounded-3xl border-2 border-dashed bg-muted/20 px-4">
                                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                    <Shield className="w-6 h-6 sm:w-8 sm:h-8" />
                                </div>
                                <div className="space-y-1 max-w-sm">
                                    <p className="text-foreground font-bold text-sm">Protected User Workspace</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Sign in with Google to view and sync your bills. Only participants added to a bill have access.
                                    </p>
                                </div>
                                <Button
                                    onClick={signInWithGoogle}
                                    size="sm"
                                    className="gap-2 rounded-xl text-xs font-bold"
                                >
                                    <LogIn className="w-3.5 h-3.5" /> Sign In with Google
                                </Button>
                            </div>
                        ) : billHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center space-y-3 sm:space-y-4 rounded-3xl border-2 border-dashed bg-muted/20 px-4">
                                <Receipt className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/30" />
                                <div className="space-y-1">
                                    <p className="text-muted-foreground font-medium italic text-sm">No bills found for your account.</p>
                                    <p className="text-xs text-muted-foreground/60">Create a bill or have a friend add your email to their bill!</p>
                                </div>
                            </div>
                        ) : (
                            billHistory.map((bill) => (
                                <Card
                                    key={bill.id}
                                    className="group overflow-hidden border-border/50 hover:border-foreground/20 hover:shadow-2xl hover:shadow-black/5 transition-all duration-300 cursor-pointer rounded-2xl touch-manipulation active:scale-[0.99]"
                                    onClick={() => onSelectBill(bill.id)}
                                >
                                    <CardContent className="p-0">
                                        <div className="flex items-center gap-3 sm:gap-4 p-3.5 sm:p-5">
                                            <div className="p-2.5 sm:p-3 bg-muted rounded-xl group-hover:bg-foreground group-hover:text-background transition-colors shrink-0">
                                                <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground transition-colors group-hover:text-inherit" />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <h3 className="font-bold text-base sm:text-lg truncate text-foreground">
                                                            {bill.name || `Bill ${bill.id.slice(0, 8)}`}
                                                        </h3>
                                                        {bill.role && (
                                                            <span className={bill.role === 'owner'
                                                                ? "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-foreground/10 text-foreground border border-foreground/20 shrink-0"
                                                                : "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 shrink-0"
                                                            }>
                                                                {bill.role === 'owner' ? 'Owner' : 'Participant'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {bill.totalAmount !== undefined && (
                                                        <span className="text-foreground font-black tabular-nums text-sm sm:text-base shrink-0">
                                                            {formatCurrency(bill.totalAmount)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 sm:gap-4 mt-1 text-[10px] text-muted-foreground font-medium flex-wrap">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDistanceToNow(new Date(bill.updated_at), { addSuffix: true })}
                                                    </div>
                                                    {bill.location && (
                                                        <div className="flex items-center gap-1 truncate max-w-[140px] sm:max-w-none">
                                                            <MapPin className="w-3 h-3 shrink-0" />
                                                            <span className="truncate">{bill.location}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center rounded-full bg-muted group-hover:bg-foreground group-hover:text-background transition-all duration-300">
                                                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </motion.div>
                </div>
            </div>

            {/* Feature Pills & Bottom Bar */}
            <div className="flex-none pt-6 sm:pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-8 px-4 sm:px-6 border-t bg-muted/30">
                <div className="max-w-2xl mx-auto flex flex-col items-center gap-3.5 text-center">
                    <div className="flex flex-wrap justify-center gap-x-6 sm:gap-x-8 gap-y-3 sm:gap-y-4 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <UsersIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground/40" />
                            <span>Group Splitting</span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <ScanLine className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground/40" />
                            <span>Receipt Scanning</span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground/40" />
                            <span>RBAC &amp; Cloud Sync</span>
                        </div>
                    </div>

                    {user && (
                        <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
                            <span>Signed in as <strong className="text-foreground font-bold">{user.name || user.email}</strong></span>
                            <span>•</span>
                            <Button
                                variant="link"
                                onClick={signOut}
                                className="text-xs text-muted-foreground hover:text-foreground font-semibold p-0 h-auto underline-offset-4 hover:underline"
                            >
                                Log out
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {IS_DEV && (
                <DevLoginModal open={isDevLoginOpen} onOpenChange={setIsDevLoginOpen} />
            )}
        </div>
    );
}

function ScanLine({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M3 17v2a2 2 0 0 1 2 2h2" />
            <line x1="7" x2="17" y1="12" y2="12" />
        </svg>
    );
}
