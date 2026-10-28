"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AppLogo } from "@/components/shared/app-logo";

const VERSION_FALLBACK = "latest";
const SEEN_VERSION_KEY = "ledger_pwa_seen_version";

const clearLedgerCaches = async () => {
  if (typeof window === "undefined" || !("caches" in window)) return;

  const keys = await window.caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("ledger-v"))
      .map((key) => window.caches.delete(key))
  );
};

const reloadWithUpdateToken = () => {
  window.location.reload();
};

const forceServiceWorkerRefresh = async () => {
  await clearLedgerCaches();

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  reloadWithUpdateToken();
};

const isStandalonePwa = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
};

const readServiceWorkerVersion = async () => {
  try {
    const response = await fetch(`/sw.js?update-check=${Date.now()}`, {
      cache: "no-cache",
    });
    const source = await response.text();
    return (
      source.match(/SW_VERSION\s*=\s*["']([^"']+)["']/)?.[1] ||
      source.match(/ledger-v([0-9]+\.[0-9]+\.[0-9]+)/)?.[1] ||
      VERSION_FALLBACK
    );
  } catch {
    return VERSION_FALLBACK;
  }
};

const readWorkerVersion = async (worker: ServiceWorker | null) =>
  new Promise<string | null>((resolve) => {
    if (!worker) {
      resolve(null);
      return;
    }

    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(null), 800);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve(event.data?.type === "SW_VERSION" ? event.data.version : null);
    };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });

export function PwaRegister() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const [version, setVersion] = useState(VERSION_FALLBACK);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const dismissedVersionRef = useRef<string | null>(null);
  const isApplyingRef = useRef(false);
  const versionRef = useRef(version);
  const fallbackReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.includes("pwa-update")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("pwa-update");
      const cleanPath = url.pathname + (url.search ? `?${url.searchParams.toString()}` : "") + url.hash;
      window.history.replaceState({}, "", cleanPath);
    }
  }, []);

  const showUpdate = useCallback(async (sw: ServiceWorker | null, nextVersion?: string) => {
    if (isApplyingRef.current) return;
    const [detectedVersion, controllerVersion] = await Promise.all([
      nextVersion || readServiceWorkerVersion(),
      readWorkerVersion(navigator.serviceWorker?.controller ?? null),
    ]);
    const seenVersion = localStorage.getItem(SEEN_VERSION_KEY);

    if (detectedVersion === VERSION_FALLBACK) return;
    if (controllerVersion === detectedVersion) {
      localStorage.setItem(SEEN_VERSION_KEY, detectedVersion);
      return;
    }
    if (seenVersion === detectedVersion) return;
    if (dismissedVersionRef.current === detectedVersion) return;

    setWaitingSW(sw);
    setVersion(detectedVersion);
    setShowUpdateModal(true);
  }, []);

  const applyUpdate = useCallback(async () => {
    if (isApplyingRef.current) return;
    isApplyingRef.current = true;
    setIsApplying(true);
    localStorage.setItem(SEEN_VERSION_KEY, version);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const sw = waitingSW || registration?.waiting;

      if (sw) {
        fallbackReloadRef.current = setTimeout(() => {
          void forceServiceWorkerRefresh();
        }, 2500);
        sw.postMessage({ type: "SKIP_WAITING" });
        return;
      }

      await forceServiceWorkerRefresh();
    } catch {
      reloadWithUpdateToken();
    }
  }, [version, waitingSW]);

  useEffect(() => {
    return () => {
      if (fallbackReloadRef.current) {
        clearTimeout(fallbackReloadRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isApplying) return;

    const controller = navigator.serviceWorker?.controller;
    if (!controller) {
      void forceServiceWorkerRefresh();
      return;
    }
  }, [isApplying]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || navigator.webdriver) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let resumeTimeout: ReturnType<typeof setTimeout> | undefined;
    let registration: ServiceWorkerRegistration | null = null;
    let reloading = false;

    const checkVersionMismatch = async () => {
      const latestVersion = await readServiceWorkerVersion();
      if (latestVersion === VERSION_FALLBACK) return;

      const controllerVersion = await readWorkerVersion(navigator.serviceWorker.controller);
      const seenVersion = localStorage.getItem(SEEN_VERSION_KEY);
      const activeVersion = controllerVersion || seenVersion;

      if (!activeVersion) {
        localStorage.setItem(SEEN_VERSION_KEY, latestVersion);
        return;
      }

      if (activeVersion !== latestVersion && dismissedVersionRef.current !== latestVersion) {
        await showUpdate(registration?.waiting || null, latestVersion);
      }
    };

    const watchInstalling = (reg: ServiceWorkerRegistration) => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed") {
          if (navigator.serviceWorker.controller) {
            void showUpdate(reg.waiting || sw);
          }
        }
      });
    };

    const showWaitingWorker = async () => {
      if (registration?.waiting) {
        await showUpdate(registration.waiting);
        return true;
      }
      return false;
    };

    const pollForUpdate = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const reg = registration;
        if (reg) {
          await reg.update();
        }
        if (await showWaitingWorker()) {
          return;
        }
        await checkVersionMismatch();
      } catch {
        // Offline launches can fail update checks.
      }
    };

    const startPolling = () => {
      if (interval) clearInterval(interval);
      // Poll every 5 minutes only while app is visible in the foreground
      interval = setInterval(() => {
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          void pollForUpdate();
        }
      }, 5 * 60_000);
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
        resumeTimeout = undefined;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pollForUpdate();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const onPageShow = () => {
      void pollForUpdate();
      startPolling();
    };

    const onPageHide = () => {
      stopPolling();
    };

    const onStandaloneResume = () => {
      if (!isStandalonePwa() || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      if (resumeTimeout) clearTimeout(resumeTimeout);
      resumeTimeout = setTimeout(() => void pollForUpdate(), 250);
    };

    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_UPDATE_READY") {
        void showUpdate(registration?.waiting || null, event.data.version);
      }
    };

    const onControllerChange = () => {
      if (!reloading) {
        reloading = true;
        if (fallbackReloadRef.current) {
          clearTimeout(fallbackReloadRef.current);
        }
        localStorage.setItem(SEEN_VERSION_KEY, versionRef.current);
        reloadWithUpdateToken();
      }
    };

    let isDestroyed = false;

    const ensureManifestLink = () => {
      if (typeof document === "undefined") return;
      if (!document.querySelector('link[rel="manifest"]')) {
        const link = document.createElement("link");
        link.rel = "manifest";
        link.href = "/manifest.json";
        document.head.appendChild(link);
      }
    };

    const startRegistration = () => {
      if (isDestroyed) return;
      ensureManifestLink();
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then(async (reg) => {
          if (isDestroyed) return;
          registration = reg;

          await showWaitingWorker();

          reg.addEventListener("updatefound", () => watchInstalling(reg));
          await pollForUpdate();

          if (typeof document === "undefined" || document.visibilityState === "visible") {
            startPolling();
          }

          window.addEventListener("focus", pollForUpdate);
          window.addEventListener("online", pollForUpdate);
          window.addEventListener("pageshow", onPageShow);
          window.addEventListener("pagehide", onPageHide);
          window.addEventListener("touchstart", onStandaloneResume, { passive: true });
          document.addEventListener("visibilitychange", onVisible);
        })
        .catch((err) => console.error("PWA: SW registration failed:", err));

      navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    };

    let idleHandle: number | undefined;
    let timerHandle: ReturnType<typeof setTimeout> | undefined;

    if (document.readyState === "complete") {
      if ("requestIdleCallback" in window) {
        idleHandle = (
          window as Window & {
            requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
          }
        ).requestIdleCallback(startRegistration, { timeout: 3500 });
      } else {
        timerHandle = setTimeout(startRegistration, 1500);
      }
    } else {
      const onLoad = () => {
        if ("requestIdleCallback" in window) {
          idleHandle = (
            window as Window & {
              requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
            }
          ).requestIdleCallback(startRegistration, { timeout: 3500 });
        } else {
          timerHandle = setTimeout(startRegistration, 1500);
        }
      };
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      isDestroyed = true;
      if (idleHandle && "cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleHandle);
      }
      if (timerHandle) clearTimeout(timerHandle);
      stopPolling();
      window.removeEventListener("focus", pollForUpdate);
      window.removeEventListener("online", pollForUpdate);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("touchstart", onStandaloneResume);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [showUpdate]);

  return (
    <Dialog
      open={showUpdateModal}
      onOpenChange={(open) => {
        // Modal is forced open until updated - cannot be closed by outside trigger
        if (open) setShowUpdateModal(true);
      }}
    >
      <DialogContent
        showClose={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="w-[min(92vw,400px)] rounded-3xl border border-border/80 bg-card/95 backdrop-blur-xl p-5 text-foreground shadow-2xl sm:p-6"
      >
        <DialogHeader className="space-y-3.5 text-left">
          <div className="flex items-center justify-between">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary/25 via-primary/10 to-transparent border border-primary/25 text-primary p-2.5 shadow-lg shadow-primary/10 shrink-0">
              <AppLogo className="h-full w-full" />
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-tight bg-primary/15 text-primary border border-primary/25">
              v{version}
            </span>
          </div>
          <div className="space-y-1.5">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              New update available
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              Ledger version {version} is ready. Update now to refresh the app and load the latest features and fixes.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 text-xs font-medium leading-relaxed text-foreground/80 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <span>
            Your bills, groups, and splits stay saved. The app will reload once the update is activated.
          </span>
        </div>

        <div className="pt-1">
          <Button
            type="button"
            onClick={applyUpdate}
            disabled={isApplying}
            className="h-11 w-full rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            <RefreshCw className={cn("h-4 w-4 shrink-0 text-primary-foreground", isApplying && "animate-spin")} />
            <span>{isApplying ? "Updating Ledger..." : "Update now"}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
