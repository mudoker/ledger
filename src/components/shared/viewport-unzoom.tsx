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

/**
 * Checks whether an element is an editable text input or control.
 */
export const isInputField = (el: Element | null): boolean => {
  if (!el) return false;
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
};

/**
 * Calculates current visible viewport coordinates and updates CSS variables on root.
 * Directly updates CSS custom properties to avoid heavy React component re-renders.
 */
export function updateViewportState() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const vv = window.visualViewport;
  const root = document.documentElement;

  if (!vv) {
    root.style.setProperty("--keyboard-height", "0px");
    root.style.setProperty("--visual-viewport-height", `${window.innerHeight}px`);
    root.style.setProperty("--visual-viewport-offset-top", "0px");
    root.style.setProperty("--dialog-center-y", "50%");
    root.style.setProperty("--dialog-max-height", "86dvh");
    root.style.setProperty("--keyboard-open", "0");
    root.removeAttribute("data-keyboard-open");
    return;
  }

  const windowH = window.innerHeight;
  const visibleH = vv.height;
  const offsetTop = vv.offsetTop || 0;

  // Software keyboard height
  // In iOS / WebKit, window.innerHeight stays constant while vv.height decreases.
  const rawKeyboardH = windowH - visibleH - offsetTop;
  const isKeyboardOpen = rawKeyboardH > 50;
  const keyboardHeight = isKeyboardOpen ? Math.max(0, Math.round(rawKeyboardH)) : 0;

  if (isKeyboardOpen) {
    // Position dialog in the vertical center of the visible area above the keyboard
    const centerY = Math.round(offsetTop + visibleH / 2);
    // Keep 12px margin top and bottom so dialog never collides with status bar or keyboard
    const maxDialogH = Math.max(160, Math.round(visibleH - 24));

    root.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
    root.style.setProperty("--visual-viewport-height", `${Math.round(visibleH)}px`);
    root.style.setProperty("--visual-viewport-offset-top", `${Math.round(offsetTop)}px`);
    root.style.setProperty("--dialog-center-y", `${centerY}px`);
    root.style.setProperty("--dialog-max-height", `${maxDialogH}px`);
    root.style.setProperty("--keyboard-open", "1");
    root.setAttribute("data-keyboard-open", "true");
  } else {
    root.style.setProperty("--keyboard-height", "0px");
    root.style.setProperty("--visual-viewport-height", `${Math.round(visibleH)}px`);
    root.style.setProperty("--visual-viewport-offset-top", "0px");
    root.style.setProperty("--dialog-center-y", "50%");
    root.style.setProperty("--dialog-max-height", "86dvh");
    root.style.setProperty("--keyboard-open", "0");
    root.removeAttribute("data-keyboard-open");
  }
}

/**
 * Ensures the focused input field is fully scrolled into view with comfortable breathing room.
 * Handles both inputs inside scrollable modal bodies and inputs directly on the page.
 */
export function scrollActiveInputIntoView(target?: Element | null) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const el = (target || document.activeElement) as HTMLElement | null;
  if (!el || !isInputField(el)) return;

  // 1. Check if the element is inside an internal scroll container (e.g. inside a Dialog modal)
  let curr = el.parentElement;
  let scrollContainer: HTMLElement | null = null;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const style = window.getComputedStyle(curr);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      scrollContainer = curr;
      break;
    }
    curr = curr.parentElement;
  }

  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    if (elRect.bottom > containerRect.bottom - 16) {
      scrollContainer.scrollBy({
        top: elRect.bottom - containerRect.bottom + 32,
        behavior: "smooth",
      });
    } else if (elRect.top < containerRect.top + 16) {
      scrollContainer.scrollBy({
        top: elRect.top - containerRect.top - 32,
        behavior: "smooth",
      });
    }
  } else {
    // 2. On regular page outside modal
    const vv = window.visualViewport;
    const visibleH = vv ? vv.height : window.innerHeight;
    const elRect = el.getBoundingClientRect();

    if (elRect.bottom > visibleH - 40) {
      window.scrollBy({
        top: elRect.bottom - (visibleH - 56),
        behavior: "smooth",
      });
    } else if (elRect.top < 64) {
      window.scrollBy({
        top: elRect.top - 72,
        behavior: "smooth",
      });
    }
  }
}

export function ViewportUnzoom() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Helper to run staggered checks across the keyboard animation lifecycle
    const scheduleChecks = (el: HTMLElement) => {
      updateViewportState();
      scrollActiveInputIntoView(el);

      const delays = [60, 150, 280, 420];
      delays.forEach((delay) => {
        setTimeout(() => {
          updateViewportState();
          scrollActiveInputIntoView(el);
        }, delay);
      });
    };

    // When an input gains focus, push the view up and scroll input into view
    const handleFocusIn = (e: FocusEvent) => {
      if (isInputField(e.target as Element)) {
        scheduleChecks(e.target as HTMLElement);
      }
    };

    // When user touches or clicks an input (even if already focused via autoFocus on mobile)
    const handleTouchStart = (e: TouchEvent) => {
      const inputEl = (e.target as Element)?.closest("input, textarea, select, [contenteditable='true']");
      if (inputEl) {
        scheduleChecks(inputEl as HTMLElement);
        return;
      }

      // If user taps outside an input on non-interactive whitespace, blur active input to close keyboard
      const active = document.activeElement;
      if (isInputField(active)) {
        const touchedEl = e.target as Element | null;
        const isInteractive = touchedEl?.closest("button, a, [role='button'], input, textarea, select");
        if (!isInteractive && touchedEl && !touchedEl.contains(active) && touchedEl !== active) {
          (active as HTMLElement).blur();
        }
      }
    };

    const handleClick = (e: MouseEvent) => {
      const inputEl = (e.target as Element)?.closest("input, textarea, select, [contenteditable='true']");
      if (inputEl) {
        scheduleChecks(inputEl as HTMLElement);
      }
    };

    // When an input loses focus, reset viewport state and perform auto-unzoom
    const handleFocusOut = (e: FocusEvent) => {
      if (isInputField(e.target as Element)) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (!isInputField(document.activeElement)) {
            updateViewportState();
            unzoomViewport();
          }
        }, 80);
      }
    };

    // When visualViewport resizes (e.g. keyboard opens/closes)
    const handleViewportResize = () => {
      updateViewportState();
      if (isInputField(document.activeElement)) {
        scrollActiveInputIntoView(document.activeElement as HTMLElement);
      } else {
        unzoomViewport();
      }
    };

    const handleViewportScroll = () => {
      updateViewportState();
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("click", handleClick, true);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
      window.visualViewport.addEventListener("scroll", handleViewportScroll);
    }

    // Initialize root CSS variables on mount
    updateViewportState();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("click", handleClick, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportResize);
        window.visualViewport.removeEventListener("scroll", handleViewportScroll);
      }
    };
  }, []);

  return null;
}
