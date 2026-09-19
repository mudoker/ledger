'use client';

import { useState, useEffect } from 'react';
import { ItemsSection } from "@/components/items/items-section";
import { PeopleSection } from "@/components/people/people-section";
import { SummarySection } from "@/components/summary/summary-section";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Users, Receipt, CreditCard, ArrowLeft, MapPin, Github, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBillStore } from "@/store/useBillStore";
import { deserializeState } from "@/lib/share";
import { Eye } from "lucide-react";
import { LandingPage } from "@/components/layout/landing-page";
import { BillConfiguration } from "@/components/summary/bill-configuration";
import { DiscrepancyBanner } from "@/components/shared/discrepancy-banner";
import { AppLogo } from "@/components/shared/app-logo";
import { LoadingScreen } from "@/components/shared/loading-screen";
import { CreateBillModal, type CreateBillFormData } from "@/components/shared/create-bill-modal";
import { ResizableSplit } from "@/components/layout/resizable-split";
import { AuthButton } from "@/components/layout/auth-button";
import { ShareButton } from "@/components/layout/share-button";
import { AppSettingsPage } from "@/components/settings/app-settings-page";
import { LoginGateScreen } from "@/components/layout/login-gate-screen";
import { UnavailableBillPage } from "@/components/shared/unavailable-bill-page";
import { AccessDeniedPage } from "@/components/shared/access-denied-page";
import { syncManager } from "@/lib/local-db/sync-manager";
import { useAuthStore } from "@/store/useAuthStore";
import { useGroupStore } from "@/store/useGroupStore";
import { GroupOverview } from "@/components/groups/group-overview";
import { BottomSearchBar } from "@/components/shared/bottom-search-bar";
import { FuzzySearchModal } from "@/components/shared/fuzzy-search-modal";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  const [view, setView] = useState<'landing' | 'editor' | 'summary' | 'settings' | 'group' | 'app-settings' | 'not-found' | 'access-denied'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('id') || params.get('v') || params.get('e')) {
        return 'editor';
      }
      if (params.get('groupId')) {
        return 'group';
      }
    }
    return 'landing';
  });
  const [requestedBillId, setRequestedBillId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'people' | 'items' | 'summary' | 'settings'>('items');
  const [isReadOnlyModalOpen, setIsReadOnlyModalOpen] = useState(false);
  const [isGroupSearchOpen, setIsGroupSearchOpen] = useState(false);
  const [returnToGroupId, setReturnToGroupId] = useState<string | null>(null);
  const [notFoundError, setNotFoundError] = useState<string>('');
  const { user, fetchUser, signOut } = useAuthStore();
  const { currentGroup, fetchGroup } = useGroupStore();
  const {
    isReadOnly,
    isHydrated,
    loadState,
    saveToDb,
    fetchBill,
    people,
    items,
    globalCharges,
    hostId,
    currentBillId,
    resetBill,
    loadSeedData,
    fetchHistory,
    setHostId,
    addGlobalCharge,
    updateGlobalCharge,
    removeGlobalCharge,
    billName,
    location,
    setBillName,
    setLocation,
    updatePerson,
    qrCode,
    setQrCode,
    setCurrency
  } = useBillStore();

  // Fetch current user and initialize sync manager on mount
  useEffect(() => {
    fetchUser();
    syncManager.init();
  }, [fetchUser]);

  // Handle URL parameters (Legacy v/e and New id, share mode)
  useEffect(() => {
    if (!isHydrated) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const groupId = params.get('groupId');
    const viewData = params.get('v');
    const editData = params.get('e');
    const token = params.get('token') || params.get('shareToken');
    const isShare = params.get('share') === '1' || params.get('share') === 'true' || Boolean(viewData) || Boolean(token);

    if (id && groupId) {
      setView('editor');
      setReturnToGroupId(groupId);
      fetchGroup(groupId);
      fetchBill(id, isShare, token).catch((err) => {
        console.error("Fetch bill error:", err);
        setRequestedBillId(id);
        if (err?.status === 403 || err?.isForbidden) {
          setView('access-denied');
        } else {
          setNotFoundError(err.message || 'Shared bill is unavailable');
          setView('not-found');
        }
      });
    } else if (groupId) {
      fetchGroup(groupId).then((g) => {
        if (g) setView('group');
      });
    } else if (id || viewData || editData) {
      if (id) {
        setView('editor');
        setReturnToGroupId(null);
        useGroupStore.getState().clearCurrentGroup();
        fetchBill(id, isShare, token).catch((err) => {
          console.error("Fetch bill error:", err);
          setRequestedBillId(id);
          if (err?.status === 403 || err?.isForbidden) {
            setView('access-denied');
          } else {
            setNotFoundError(err.message || 'Shared bill is unavailable');
            setView('not-found');
          }
        });
      } else if (viewData || editData) {
        const state = deserializeState(viewData || editData || '');
        if (state) {
          loadState(state, !!viewData);
        }
      }
    }
  }, [isHydrated, loadState, fetchBill, fetchGroup]);

  // Auto-save logic
  const billGroupId = useBillStore((state) => state.groupId);
  const billCurrency = useBillStore((state) => state.currency);

  useEffect(() => {
    if (!isHydrated || isReadOnly) return;

    // Only auto-save if there's actual data
    if (people.length === 0 && items.length === 0) return;

    const timer = setTimeout(() => {
      saveToDb();
    }, 2000); // 2 second delay for debounced auto-save

    return () => clearTimeout(timer);
  }, [people, items, globalCharges, hostId, billName, location, billCurrency, billGroupId, isHydrated, isReadOnly, saveToDb, view]);

  // Lock body/window scrolling when viewing/editing a bill (bill details page)
  // Ensures the outer page is 100% static, and only the active tab subpage scrolls
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (view === 'landing' || view === 'group') {
      document.documentElement.classList.remove('fixed-app');
      document.body.classList.remove('fixed-app');
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    } else {
      document.documentElement.classList.add('fixed-app');
      document.body.classList.add('fixed-app');
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    }
    return () => {
      document.documentElement.classList.remove('fixed-app');
      document.body.classList.remove('fixed-app');
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [view]);

  // Stacked navigation back handler:
  // If the bill was opened from a group (outer -> group -> bill), going back returns to that group view.
  // Otherwise, it returns to the landing page (outer).
  const handleBackFromEditor = async () => {
    if (!isReadOnly && (people.length > 0 || items.length > 0)) {
      await saveToDb();
    }

    // Stacked navigation: only return to group if navigated outer -> group -> bill
    if (returnToGroupId) {
      const targetGroupId = returnToGroupId;
      setReturnToGroupId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      url.searchParams.set('groupId', targetGroupId);
      window.history.pushState({}, '', url.toString());
      setView('group');
      await fetchGroup(targetGroupId);
      useGroupStore.getState().fetchGroups();
    } else {
      await handleBackToLanding(true);
    }
  };

  const handleOpenSettings = () => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'app-settings');
      window.history.pushState({ view: 'app-settings' }, '', url.toString());
    }
    setView('app-settings');
  };

  const handleCloseSettings = () => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      window.history.pushState({}, '', url.toString());
    }
    setView('landing');
  };

  // Instantaneous back navigation with reliable background synchronization
  const handleBackToLanding = async (alreadySaved: boolean = false) => {
    // 1. Instantly switch view for 0-latency UI feedback
    setView('landing');
    setReturnToGroupId(null);

    // 2. Clear URL params without reload
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.pushState({}, '', cleanUrl);

    // 3. Reset active group in store
    useGroupStore.getState().clearCurrentGroup();

    // 4. Save and sync history if bill had unsaved changes and not already saved
    if (!alreadySaved && !isReadOnly && (people.length > 0 || items.length > 0)) {
      await saveToDb();
    }
    fetchHistory();
    useGroupStore.getState().fetchGroups();
  };

  // Support native browser and mobile back/forward gestures
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      const groupId = params.get('groupId');
      const token = params.get('token') || params.get('shareToken');
      const isShare = params.get('share') === '1' || params.get('share') === 'true' || Boolean(token);
      const viewParam = params.get('view');

      if (viewParam === 'app-settings') {
        setView('app-settings');
        return;
      }

      if (id) {
        if (groupId) {
          setReturnToGroupId(groupId);
          fetchGroup(groupId);
        } else {
          setReturnToGroupId(null);
          useGroupStore.getState().clearCurrentGroup();
        }
        setView('editor');
        fetchBill(id, isShare, token).catch((err) => {
          setRequestedBillId(id);
          if (err?.status === 403 || err?.isForbidden) {
            setView('access-denied');
          } else {
            setNotFoundError(err?.message || 'Shared bill is unavailable');
            setView('not-found');
          }
        });
      } else if (groupId) {
        setView('group');
        setReturnToGroupId(null);
        fetchGroup(groupId).then((g) => {
          if (!g) setView('landing');
        });
      } else {
        setView('landing');
        setReturnToGroupId(null);
        useGroupStore.getState().clearCurrentGroup();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fetchBill, fetchGroup]);

  // Global keyboard shortcuts for rapid navigation and search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K: Toggle Search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGroupSearchOpen((prev) => !prev);
        return;
      }

      // Escape: Close search, modals, or return from settings
      if (e.key === 'Escape') {
        if (isGroupSearchOpen) {
          setIsGroupSearchOpen(false);
          return;
        }
        if (isReadOnlyModalOpen) {
          setIsReadOnlyModalOpen(false);
          return;
        }
        if (view === 'app-settings') {
          handleCloseSettings();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGroupSearchOpen, isReadOnlyModalOpen, view]);

  const handleStartNewBill = async (data?: CreateBillFormData) => {
    resetBill();
    if (data?.currency) {
      setCurrency(data.currency);
    }
    const cleanName = data?.name?.trim() || 'New Bill';
    setBillName(cleanName);
    if (data?.location?.trim()) {
      setLocation(data.location.trim());
    }

    const isFromGroup = view === 'group' && Boolean(currentGroup?.id);
    const targetGroupId = isFromGroup ? currentGroup!.id : (data?.groupId || null);
    if (isFromGroup) {
      setReturnToGroupId(currentGroup!.id);
    } else {
      setReturnToGroupId(null);
      useGroupStore.getState().clearCurrentGroup();
    }

    const hostName = data?.hostName?.trim() || user?.name || (user?.email ? user.email.split('@')[0] : 'Me');
    const hostId = crypto.randomUUID();
    const newBillId = crypto.randomUUID();

    const matchedGroup = targetGroupId ? useGroupStore.getState().groups.find(g => g.id === targetGroupId) : null;
    const groupParticipants = (data as any)?.selectedMembers !== undefined
      ? (data as any).selectedMembers
      : ((matchedGroup as any)?.participants || (currentGroup?.id === targetGroupId ? (currentGroup as any)?.participants : []) || []);

    const inheritedPeople = [
      {
        id: hostId,
        name: hostName,
        sponsorAmount: 0,
        paidAmount: 0,
        userId: user?.id || null,
        email: user?.email || null,
      },
    ];

    for (const gp of groupParticipants) {
      const isHost = (gp.email && user?.email && gp.email.toLowerCase() === user.email.toLowerCase()) ||
                     (gp.name.trim().toLowerCase() === hostName.trim().toLowerCase());
      if (!isHost) {
        inheritedPeople.push({
          id: crypto.randomUUID(),
          name: gp.name,
          sponsorAmount: 0,
          paidAmount: 0,
          userId: gp.userId || null,
          email: gp.email || null,
        });
      }
    }

    // Guarantee invariant: Bill.participants ⊆ Group.participants
    if (targetGroupId) {
      for (const p of inheritedPeople) {
        useGroupStore.getState().addGroupParticipant(targetGroupId, p.name, p.email || null).catch(() => {});
      }
    }

    useBillStore.setState({
      currentBillId: newBillId,
      groupId: targetGroupId || null,
      groupName: matchedGroup?.name || null,
      people: inheritedPeople,
      hostId: hostId,
    });

    useBillStore.getState().setHydrated(true);

    const url = new URL(window.location.href);
    url.searchParams.set('id', newBillId);
    if (isFromGroup && targetGroupId) {
      url.searchParams.set('groupId', targetGroupId);
    } else {
      url.searchParams.delete('groupId');
    }
    window.history.pushState({}, '', url.toString());

    setView('editor');

    // Immediately persist to database so the link between bill and group is stored at creation time
    try {
      await useBillStore.getState().saveToDb();
      if (targetGroupId) {
        await useGroupStore.getState().fetchGroup(targetGroupId);
        useGroupStore.getState().fetchGroups();
      }
    } catch (e) {
      console.error('Error saving new bill:', e);
    }
  };

  const handleSelectBill = async (id: string | 'current') => {
    if (id === 'current') {
      if (!user) return;
      setView('editor');
      return;
    }
    const isFromGroup = view === 'group' && Boolean(currentGroup?.id);
    const navGroupId = isFromGroup ? currentGroup!.id : null;
    setReturnToGroupId(navGroupId);
    if (!isFromGroup) {
      useGroupStore.getState().clearCurrentGroup();
    }
    const url = new URL(window.location.href);
    if (navGroupId) {
      url.searchParams.set('groupId', navGroupId);
    } else {
      url.searchParams.delete('groupId');
    }
    url.searchParams.set('id', id);
    window.history.pushState({}, '', url.toString());

    // Clear previous bill state to avoid briefly flashing the wrong bill
    useBillStore.setState({
      currentBillId: id,
      billName: '',
      people: [],
      items: [],
      globalCharges: [],
      isReadOnly: false,
    });
    setView('editor');

    try {
      await fetchBill(id);
    } catch (err: any) {
      console.error("Fetch bill error:", err);
      setRequestedBillId(id);
      if (err?.status === 403 || err?.isForbidden) {
        setView('access-denied');
      } else {
        setNotFoundError(err?.message || 'Shared bill is unavailable');
        setView('not-found');
      }
    }
  };

  const handleSelectGroup = (groupId: string) => {
    setReturnToGroupId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    url.searchParams.set('groupId', groupId);
    window.history.pushState({}, '', url.toString());
    setView('group');
    fetchGroup(groupId).then((g) => {
      if (!g) {
        setView('landing');
        url.searchParams.delete('groupId');
        window.history.replaceState({}, '', url.toString());
      }
    });
  };

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  // Mandatory Authentication Gate (Online & Offline)
  if (!user) {
    return (
      <ThemeProvider defaultTheme="dark-emerald" storageKey="vite-ui-theme">
        <TooltipProvider delayDuration={100} skipDelayDuration={0}>
          <LoginGateScreen />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  // Dedicated 404 Unavailable Shared Bill View
  if (view === 'not-found') {
    return (
      <ThemeProvider defaultTheme="dark-emerald" storageKey="vite-ui-theme">
        <TooltipProvider delayDuration={100} skipDelayDuration={0}>
          <UnavailableBillPage
            message={notFoundError}
            onGoHome={() => handleBackToLanding(true)}
          />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  // Access Denied / Blocked View with Request Access Push Notification
  if (view === 'access-denied') {
    return (
      <ThemeProvider defaultTheme="dark-emerald" storageKey="vite-ui-theme">
        <TooltipProvider delayDuration={100} skipDelayDuration={0}>
          <AccessDeniedPage
            billId={requestedBillId || currentBillId || undefined}
            billName={billName || undefined}
            onBackToHome={() => handleBackToLanding(true)}
          />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  // App Settings View
  if (view === 'app-settings') {
    return (
      <ThemeProvider defaultTheme="dark-emerald" storageKey="vite-ui-theme">
        <TooltipProvider delayDuration={100} skipDelayDuration={0}>
          <AppSettingsPage onBack={handleCloseSettings} />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark-emerald" storageKey="vite-ui-theme">
      <TooltipProvider delayDuration={100} skipDelayDuration={0}>
        <div className={cn(
        "bg-background font-sans text-foreground antialiased selection:bg-foreground/20 flex flex-col items-stretch",
        view === 'landing' || view === 'group' ? "min-h-[100dvh] overflow-y-auto" : "h-[100dvh] max-h-[100dvh] overflow-hidden fixed inset-0"
      )}>

        {view === 'landing' ? (
          <>
            <div className="flex-none px-4 sm:px-6 md:px-8 lg:px-10 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:pt-6 w-full max-w-[94%] 2xl:max-w-[2000px] mx-auto">
              <header className="flex justify-between items-center">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="p-2 bg-foreground rounded-xl shadow-lg shadow-black/10">
                    <AppLogo className="w-5 h-5 sm:w-6 sm:h-6 text-background" />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Ledger
                  </h1>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <a
                    href="https://github.com/mudoker/ledger"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View GitHub repository"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 h-9 rounded-xl border-foreground/10 hover:bg-foreground/5 font-bold transition-all text-xs"
                    >
                      <Github className="w-4 h-4" />
                      <span className="hidden sm:inline">GitHub</span>
                    </Button>
                  </a>
                  <AuthButton onOpenSettings={handleOpenSettings} />
                  <ModeToggle />
                </div>
              </header>
            </div>
            <LandingPage
              onNewBill={handleStartNewBill}
              onSelectBill={handleSelectBill}
              onSelectGroup={handleSelectGroup}
              onOpenSettings={handleOpenSettings}
              onLoadDemo={() => {
                loadSeedData();
                setView('editor');
              }}
            />
          </>
        ) : view === 'group' ? (
          currentGroup ? (
            <>
              <GroupOverview
                group={currentGroup}
                onBack={handleBackToLanding}
                onSelectBill={handleSelectBill}
                onNewBill={handleStartNewBill}
              />
              <BottomSearchBar onClick={() => setIsGroupSearchOpen(true)} />
              <FuzzySearchModal
                open={isGroupSearchOpen}
                onOpenChange={setIsGroupSearchOpen}
                onSelectBill={handleSelectBill}
                onSelectGroup={handleSelectGroup}
              />
            </>
          ) : (
            <LoadingScreen message="Loading group..." />
          )
        ) : (
          <>
            {isReadOnly && (
              <div className="bg-primary/10 border-b border-primary/20 py-2.5 px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-3 animate-in slide-in-from-top duration-300 flex-none text-[11px] sm:text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Eye className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-bold text-foreground truncate">
                    {user
                      ? "Read-Only Mode — Only the bill owner can edit this bill."
                      : "Shared Bill (Read-Only) — Viewing mode only. Editing is disabled."}
                  </span>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-[10px] font-bold ml-2 shrink-0 px-2.5"
                  onClick={() => setIsReadOnlyModalOpen(true)}
                >
                  Start New Bill
                </Button>
              </div>
            )}

            <CreateBillModal
              open={isReadOnlyModalOpen}
              onOpenChange={setIsReadOnlyModalOpen}
              onSubmit={handleStartNewBill}
            />

              {/* Header - Fixed & Safe-Area Aware */}
              <div className="flex-none px-4 sm:px-6 md:px-8 lg:px-10 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:pt-6 w-full max-w-full md:max-w-[94%] 2xl:max-w-[2000px] mx-auto">
                <header className="flex justify-between items-center mb-1.5 sm:mb-3 md:mb-5 gap-1.5 sm:gap-3">
                  <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleBackFromEditor}
                      className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl shrink-0 touch-manipulation active:scale-95"
                      title={returnToGroupId ? "Back to Group" : "Back to Bills"}
                      aria-label={returnToGroupId ? "Back to Group" : "Back to Bills"}
                    >
                      <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                    </Button>
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                      <div className="hidden xs:flex p-1.5 sm:p-2 bg-foreground rounded-xl shadow-lg shadow-black/10 shrink-0">
                        <AppLogo className="w-4 h-4 sm:w-5 sm:h-5 text-background" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <h1 className="text-sm sm:text-lg md:text-xl font-black tracking-tight text-foreground truncate" title={billName || "Untitled Bill"}>
                            {billName || "Untitled Bill"}
                          </h1>
                          <span className="hidden md:inline-flex text-[9px] text-muted-foreground border border-foreground/10 uppercase font-black tracking-[0.2em] bg-foreground/5 px-2 py-0.5 rounded-full shrink-0">
                            {currentBillId ? `SESSION ${currentBillId.slice(0, 8)}` : "LIVE SESSION"}
                          </span>
                        </div>
                        {location && (
                          <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 font-medium truncate mt-0.5" title={location}>
                            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <Button
                      variant={view === 'editor' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setView('editor');
                        if (mobileTab !== 'people' && mobileTab !== 'items') {
                          setMobileTab('items');
                        }
                      }}
                      className="hidden md:flex gap-2 rounded-xl h-9"
                    >
                      <Receipt className="w-4 h-4" /> Editor
                    </Button>
                    <Button
                      variant={view === 'summary' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setView('summary');
                        setMobileTab('summary');
                      }}
                      className="hidden md:flex gap-2 rounded-xl h-9"
                    >
                      <CreditCard className="w-4 h-4" /> Summary
                    </Button>
                    <Button
                      variant={view === 'settings' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setView('settings');
                        setMobileTab('settings');
                      }}
                      className="hidden md:flex gap-2 rounded-xl h-9"
                    >
                      <Settings className="w-4 h-4" /> Settings
                    </Button>
                    <ShareButton />
                    <a
                      href="https://github.com/mudoker/ledger"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View GitHub repository"
                      className="hidden sm:block"
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border-foreground/10 hover:bg-foreground/5"
                      >
                        <Github className="w-4 h-4" />
                      </Button>
                    </a>
                    <AuthButton onOpenSettings={handleOpenSettings} />
                    <ModeToggle />
                  </div>
                </header>
              </div>

              <DiscrepancyBanner />

              {/* Main Content - Flex Grow */}
              <main className="flex-1 w-full mx-auto max-w-full md:max-w-[94%] 2xl:max-w-[2000px] px-1 sm:px-6 md:px-8 lg:px-10 md:pt-0 overflow-hidden relative flex flex-col min-h-0">
                {/* Desktop Grid Layout */}
                <div className="hidden md:flex flex-1 min-h-0 h-full overflow-hidden">
                  {view === 'editor' && (
                    <ResizableSplit
                      left={<PeopleSection />}
                      right={<ItemsSection />}
                      defaultLeftPercent={35}
                      minLeftPercent={22}
                      maxLeftPercent={50}
                    />
                  )}
                  {view === 'summary' && (
                    <div className="h-full overflow-hidden max-w-5xl xl:max-w-6xl mx-auto w-full flex flex-col min-h-0">
                      <SummarySection />
                    </div>
                  )}
                  {view === 'settings' && (
                    <div className="h-full overflow-hidden max-w-4xl mx-auto w-full flex flex-col min-h-0">
                      <BillConfiguration />
                    </div>
                  )}
                </div>

                {/* Mobile Tab Layout */}
                <div className="md:hidden flex-1 relative overflow-hidden flex flex-col pb-0 min-h-0">
                  <div className="flex-1 overflow-hidden h-full flex flex-col min-h-0">
                    {mobileTab === 'people' && (
                      <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                        <PeopleSection />
                      </div>
                    )}
                    {mobileTab === 'items' && (
                      <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                        <ItemsSection />
                      </div>
                    )}
                    {mobileTab === 'summary' && (
                      <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                        <SummarySection />
                      </div>
                    )}
                    {mobileTab === 'settings' && (
                      <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                        <BillConfiguration />
                      </div>
                    )}
                  </div>
                </div>
              </main>

              {/* Mobile Bottom Nav */}
              <nav
                aria-label="Mobile Navigation"
                className="md:hidden flex-none bg-card/95 dark:bg-[#121215]/95 backdrop-blur-2xl border-t border-border/80 select-none pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_24px_rgba(0,0,0,0.35)] z-30 transition-all duration-200 [html[data-keyboard-open='true']_&]:hidden"
              >
                <div className="flex h-14 max-w-md mx-auto items-center justify-around px-2">
                  <button
                    type="button"
                    className={cn(
                      "group flex flex-1 flex-col items-center justify-center py-1 touch-manipulation transition-all duration-150 active:scale-95 relative",
                      mobileTab === 'people'
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => {
                      setMobileTab('people');
                      setView('editor');
                    }}
                  >
                    <div className="relative flex items-center justify-center">
                      <div className={cn(
                        "p-1 rounded-xl transition-all",
                        mobileTab === 'people' ? "bg-primary/10 text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        <Users
                          className="w-5 h-5 transition-colors duration-150"
                          strokeWidth={mobileTab === 'people' ? 2.5 : 2}
                        />
                      </div>
                      {people.length > 0 && (
                        <span className={cn(
                          "absolute -top-1 -right-2 text-[9px] font-black h-4 min-w-4 px-1 rounded-full flex items-center justify-center shadow-sm",
                          mobileTab === 'people'
                            ? "bg-primary text-primary-foreground"
                            : "bg-foreground/20 text-foreground"
                        )}>
                          {people.length}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "mt-0.5 text-[10px] leading-tight tracking-tight transition-colors duration-150",
                      mobileTab === 'people' ? "font-black text-primary" : "font-semibold text-muted-foreground group-hover:text-foreground"
                    )}>
                      People
                    </span>
                    {mobileTab === 'people' && (
                      <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "group flex flex-1 flex-col items-center justify-center py-1 touch-manipulation transition-all duration-150 active:scale-95 relative",
                      mobileTab === 'items'
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => {
                      setMobileTab('items');
                      setView('editor');
                    }}
                  >
                    <div className="relative flex items-center justify-center">
                      <div className={cn(
                        "p-1 rounded-xl transition-all",
                        mobileTab === 'items' ? "bg-primary/10 text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        <Receipt
                          className="w-5 h-5 transition-colors duration-150"
                          strokeWidth={mobileTab === 'items' ? 2.5 : 2}
                        />
                      </div>
                      {items.length > 0 && (
                        <span className={cn(
                          "absolute -top-1 -right-2 text-[9px] font-black h-4 min-w-4 px-1 rounded-full flex items-center justify-center shadow-sm",
                          mobileTab === 'items'
                            ? "bg-primary text-primary-foreground"
                            : "bg-foreground/20 text-foreground"
                        )}>
                          {items.length}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "mt-0.5 text-[10px] leading-tight tracking-tight transition-colors duration-150",
                      mobileTab === 'items' ? "font-black text-primary" : "font-semibold text-muted-foreground group-hover:text-foreground"
                    )}>
                      Items
                    </span>
                    {mobileTab === 'items' && (
                      <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "group flex flex-1 flex-col items-center justify-center py-1 touch-manipulation transition-all duration-150 active:scale-95 relative",
                      mobileTab === 'summary'
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => {
                      setMobileTab('summary');
                      setView('summary');
                    }}
                  >
                    <div className="relative flex items-center justify-center">
                      <div className={cn(
                        "p-1 rounded-xl transition-all",
                        mobileTab === 'summary' ? "bg-primary/10 text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        <CreditCard
                          className="w-5 h-5 transition-colors duration-150"
                          strokeWidth={mobileTab === 'summary' ? 2.5 : 2}
                        />
                      </div>
                    </div>
                    <span className={cn(
                      "mt-0.5 text-[10px] leading-tight tracking-tight transition-colors duration-150",
                      mobileTab === 'summary' ? "font-black text-primary" : "font-semibold text-muted-foreground group-hover:text-foreground"
                    )}>
                      Summary
                    </span>
                    {mobileTab === 'summary' && (
                      <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "group flex flex-1 flex-col items-center justify-center py-1 touch-manipulation transition-all duration-150 active:scale-95 relative",
                      mobileTab === 'settings'
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => {
                      setMobileTab('settings');
                      setView('settings');
                    }}
                  >
                    <div className="relative flex items-center justify-center">
                      <div className={cn(
                        "p-1 rounded-xl transition-all",
                        mobileTab === 'settings' ? "bg-primary/10 text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        <Settings
                          className="w-5 h-5 transition-colors duration-150"
                          strokeWidth={mobileTab === 'settings' ? 2.5 : 2}
                        />
                      </div>
                    </div>
                    <span className={cn(
                      "mt-0.5 text-[10px] leading-tight tracking-tight transition-colors duration-150",
                      mobileTab === 'settings' ? "font-black text-primary" : "font-semibold text-muted-foreground group-hover:text-foreground"
                    )}>
                      Settings
                    </span>
                    {mobileTab === 'settings' && (
                      <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    )}
                  </button>
                </div>
              </nav>

              {/* Desktop Footer */}
              <footer className="hidden md:flex flex-col items-center gap-1 mt-2 text-center text-[11px] text-muted-foreground shrink-0 pb-2">
                <p>Designed for easy splitting even with late arrivals & sponsors.</p>
                {user && (
                  <Button
                    variant="link"
                    onClick={signOut}
                    className="text-xs text-muted-foreground hover:text-foreground font-semibold p-0 h-auto underline-offset-4 hover:underline"
                  >
                    Log out
                  </Button>
                )}
              </footer>
          </>
        )}
      </div>
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
