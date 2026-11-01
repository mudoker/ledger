import { useEffect, useState, useMemo } from 'react';
import { useBillStore } from "@/store/useBillStore";
import { useGroupStore } from "@/store/useGroupStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Clock, ChevronRight, Receipt, Play, History, MapPin, Shield, LogIn, Sparkles, FolderPlus, Folder } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/format';
import { motion } from 'framer-motion';
import { IS_DEV } from '@/lib/env';
import { AppLogo } from '@/components/shared/app-logo';
import { GoogleIcon } from '@/components/shared/google-icon';
import { DevLoginModal } from '@/components/layout/dev-login-modal';
import { CreateBillModal, type CreateBillFormData } from '@/components/shared/create-bill-modal';
import { CreateGroupModal } from '@/components/shared/create-group-modal';
import { BottomSearchBar } from '@/components/shared/bottom-search-bar';
import { FuzzySearchModal } from '@/components/shared/fuzzy-search-modal';
import { LandingCard } from '@/components/layout/landing-card';

interface LandingPageProps {
    onNewBill: (data: CreateBillFormData) => void;
    onSelectBill: (id: string | 'current') => void;
    onSelectGroup?: (id: string) => void;
    onLoadDemo?: () => void;
    onOpenSettings?: () => void;
}

export function LandingPage({ onNewBill, onSelectBill, onSelectGroup, onLoadDemo, onOpenSettings }: LandingPageProps) {
    const {
        billHistory,
        fetchHistory,
        isHydrated,
        people,
        items,
        billName,
        location,
        currentBillId,
        lastSaved,
        globalCharges,
        dbStatus,
    } = useBillStore();
    const { groups, fetchGroups } = useGroupStore();
    const { user, signInWithGoogle, signOut } = useAuthStore();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isDevLoginOpen, setIsDevLoginOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'bills' | 'groups'>('bills');

    const [hasCreatedSample, setHasCreatedSample] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        const userKey = user?.id ? `ledger_sample_bill_${user.id}` : 'ledger_sample_bill_guest';
        return localStorage.getItem(userKey) === 'true' || localStorage.getItem('ledger_sample_bill_clicked') === 'true';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const userKey = user?.id ? `ledger_sample_bill_${user.id}` : 'ledger_sample_bill_guest';
        if (localStorage.getItem(userKey) === 'true' || localStorage.getItem('ledger_sample_bill_clicked') === 'true') {
            setHasCreatedSample(true);
        }
    }, [user]);

    const handleLoadDemo = () => {
        if (typeof window !== 'undefined') {
            const userKey = user?.id ? `ledger_sample_bill_${user.id}` : 'ledger_sample_bill_guest';
            localStorage.setItem(userKey, 'true');
            localStorage.setItem('ledger_sample_bill_clicked', 'true');
            setHasCreatedSample(true);
        }
        onLoadDemo?.();
    };

    useEffect(() => {
        if (isHydrated) {
            fetchHistory();
            if (user) {
                fetchGroups();
            }
        }
    }, [isHydrated, fetchHistory, fetchGroups, user]);

    const hasActiveDraft = Boolean(user) && (people.length > 0 || items.length > 0) && (!currentBillId || !billHistory.some((b) => b.id === currentBillId));

    const draftTotal = useMemo(() => {
        const rawSubtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        let total = rawSubtotal;
        for (const charge of globalCharges) {
            if (charge.type === 'percent') {
                total += (rawSubtotal * charge.amount) / 100;
            } else {
                total += charge.amount;
            }
        }
        return total;
    }, [items, globalCharges]);

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
                        {user ? (
                            <>
                                <Button
                                    onClick={() => setIsCreateGroupModalOpen(true)}
                                    variant="outline"
                                    size="lg"
                                    className="h-11 sm:h-14 px-5 sm:px-8 text-sm sm:text-lg font-bold gap-2 rounded-xl sm:rounded-2xl border-2 transition-all hover:bg-foreground/5 w-full sm:w-auto touch-manipulation active:scale-95"
                                >
                                    <FolderPlus className="w-4 h-4 sm:w-6 sm:h-6 text-primary" /> Create Group
                                </Button>
                                <Button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    size="lg"
                                    className="h-11 sm:h-14 px-5 sm:px-8 text-sm sm:text-lg font-bold gap-2 rounded-xl sm:rounded-2xl shadow-xl shadow-foreground/10 transition-all hover:scale-105 active:scale-95 bg-foreground text-background hover:bg-foreground/90 w-full sm:w-auto touch-manipulation"
                                >
                                    <Plus className="w-4 h-4 sm:w-6 sm:h-6" /> Start New
                                </Button>
                            </>
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

                    <CreateGroupModal
                        open={isCreateGroupModalOpen}
                        onOpenChange={setIsCreateGroupModalOpen}
                        onCreated={(g) => onSelectGroup?.(g.id)}
                    />

                    <div className="flex flex-wrap items-center justify-center gap-2 mt-1 sm:mt-2">
                        {!hasCreatedSample && onLoadDemo && (
                            <Button
                                onClick={handleLoadDemo}
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
            <div className="flex-1 px-4 sm:px-6 max-w-2xl mx-auto w-full flex flex-col pb-36 sm:pb-44">
                <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        {user ? (
                            <div className="flex items-center p-0.5 bg-muted rounded-xl border border-border/60">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('bills')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                        activeTab === 'bills'
                                            ? 'bg-card text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    Bills ({billHistory.length + (hasActiveDraft ? 1 : 0)})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('groups')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                        activeTab === 'groups'
                                            ? 'bg-card text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    Groups ({groups.length})
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
                                    Recent Transactions
                                </h2>
                            </div>
                        )}
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
                                        Sign in with Google to view and sync your bills and groups.
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
                        ) : activeTab === 'groups' ? (
                            groups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center space-y-3 sm:space-y-4 rounded-3xl border-2 border-dashed bg-muted/20 px-4">
                                    <Folder className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/30" />
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground font-medium italic text-sm">No bill groups found.</p>
                                        <p className="text-xs text-muted-foreground/60">Create a group to track multi-bill vacations, events, or shared living expenses!</p>
                                    </div>
                                    <Button
                                        onClick={() => setIsCreateGroupModalOpen(true)}
                                        size="sm"
                                        variant="outline"
                                        className="rounded-xl font-bold text-xs gap-1.5"
                                    >
                                        <FolderPlus className="w-3.5 h-3.5 text-primary" /> Create First Group
                                    </Button>
                                </div>
                            ) : (
                                groups.map((group) => (
                                    <LandingCard
                                        key={group.id}
                                        id={group.id}
                                        title={group.name}
                                        amount={group.total_amount}
                                        description={group.description}
                                        icon={<Folder className="w-5 h-5 sm:w-6 sm:h-6 transition-colors group-hover:text-inherit" />}
                                        iconVariant="primary"
                                        role={group.is_owner ? 'owner' : 'participant'}
                                        timestamp={group.updated_at}
                                        onClick={() => onSelectGroup?.(group.id)}
                                    />
                                ))
                            )
                        ) : billHistory.length === 0 && !hasActiveDraft ? (
                            <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center space-y-3 sm:space-y-4 rounded-3xl border-2 border-dashed bg-muted/20 px-4">
                                <Receipt className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/30" />
                                <div className="space-y-1">
                                    <p className="text-muted-foreground font-medium italic text-sm">No bills found for your account.</p>
                                    <p className="text-xs text-muted-foreground/60">Create a bill or have a friend add your email to their bill!</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {hasActiveDraft && (
                                    <LandingCard
                                        id="current"
                                        title={billName || 'Untitled Draft Bill'}
                                        amount={draftTotal > 0 ? draftTotal : undefined}
                                        icon={<Receipt className="w-5 h-5 sm:w-6 sm:h-6 transition-colors" />}
                                        iconVariant="amber"
                                        isDraft={true}
                                        role="draft"
                                        timestamp={lastSaved || undefined}
                                        location={location}
                                        extraMetadata={
                                            <div className="flex items-center gap-1.5 font-bold shrink-0">
                                                <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                    {items.length} item{items.length === 1 ? '' : 's'}
                                                </span>
                                                <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                    {people.length} member{people.length === 1 ? '' : 's'}
                                                </span>
                                            </div>
                                        }
                                        onClick={() => onSelectBill('current')}
                                    />
                                )}

                                {billHistory.map((bill) => (
                                    <LandingCard
                                        key={bill.id}
                                        id={bill.id}
                                        title={bill.name || `Bill ${bill.id.slice(0, 8)}`}
                                        amount={bill.totalAmount}
                                        icon={<Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground transition-colors group-hover:text-inherit" />}
                                        iconVariant="muted"
                                        role={bill.role}
                                        sharingStatus={bill.sharingStatus || 'local'}
                                        visibility={bill.visibility || 'local'}
                                        groupName={bill.group_name}
                                        timestamp={bill.updated_at}
                                        location={bill.location}
                                        onClick={() => onSelectBill(bill.id)}
                                    />
                                ))}
                            </>
                        )}
                    </motion.div>
                </div>
            </div>

            {/* Bottom Search Bar Dock with User Status */}
            <BottomSearchBar
                onClick={() => setIsSearchModalOpen(true)}
                footer={
                    user ? (
                        <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-muted-foreground select-none">
                            <span>
                                Signed in as <strong className="text-foreground font-bold">{user.name || user.email}</strong>
                            </span>
                            <span className="text-muted-foreground/60">•</span>
                            <button
                                type="button"
                                onClick={signOut}
                                className="text-xs sm:text-sm text-muted-foreground hover:text-foreground font-medium underline-offset-4 hover:underline cursor-pointer transition-colors"
                            >
                                Log out
                            </button>
                        </div>
                    ) : null
                }
            />

            {/* Fuzzy Search Modal */}
            <FuzzySearchModal
                open={isSearchModalOpen}
                onOpenChange={setIsSearchModalOpen}
                onSelectBill={onSelectBill}
                onSelectGroup={(gid) => onSelectGroup?.(gid)}
            />

            {IS_DEV && (
                <DevLoginModal open={isDevLoginOpen} onOpenChange={setIsDevLoginOpen} />
            )}
        </div>
    );
}
