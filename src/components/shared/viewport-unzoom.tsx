"use client";

import { useEffect } from "react";

/**
 * Resets mobile browser viewport scale back to 1.0 when inputs blur.
 * Overcomes mobile Safari and Android WebView sticky zoom when inputs with small fonts are focused.
 */
export function unzoomViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    // Only perform unzoom if viewport is actually zoomed in or offset
    if (window.visualViewport && window.visualViewport.scale <= 1.01 && window.scrollX === 0) {
      return;
    }

    // 1. Reset any horizontal panning offset caused by auto-zoom
    if (window.scrollX !== 0) {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    }

    // 2. Temporarily constrain the viewport meta tag to force the browser engine to snap back to 1.0
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      const original = meta.getAttribute("content") || "width=device-width, initial-scale=1, viewport-fit=cover";
      meta.setAttribute(
        "content",
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
      );

      // Scroll reset
      window.scrollTo(0, window.scrollY);

      setTimeout(() => {
        meta.setAttribute("content", original);
      }, 200);
    }

    // 3. WebKit/Blink body zoom recalibration fallback
    const bodyStyle = document.body.style as unknown as { zoom?: string };
    if ("zoom" in bodyStyle) {
      bodyStyle.zoom = "0.9999";
      setTimeout(() => {
        bodyStyle.zoom = "";
      }, 50);
    }
  } catch {
    // Ignore unzoom errors
  }
}

export function ViewportUnzoom() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const isInputField = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
    };

    // When an input loses focus, automatically reset viewport zoom
    const handleFocusOut = (e: FocusEvent) => {
      if (isInputField(e.target as Element)) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          // If focus didn't immediately move to another input, unzoom
          if (!isInputField(document.activeElement)) {
            unzoomViewport();
          }
        }, 60);
      }
    };

    // Tapping outside an input dismisses keyboard and triggers unzoom immediately
    const handleTouchStart = (e: TouchEvent) => {
      const active = document.activeElement;
      if (isInputField(active)) {
        const touchedEl = e.target as Element | null;
        if (touchedEl && !touchedEl.contains(active) && touchedEl !== active && !isInputField(touchedEl)) {
          (active as HTMLElement).blur();
        }
      }
    };

    // When visualViewport resizes (e.g. software keyboard closes), unzoom if no input is focused
    const handleViewportResize = () => {
      if (!isInputField(document.activeElement)) {
        unzoomViewport();
      }
    };

    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("touchstart", handleTouchStart, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("touchstart", handleTouchStart);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportResize);
      }
    };
  }, []);

  return null;
}
