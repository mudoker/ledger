import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  isInputField,
  updateViewportState,
  scrollActiveInputIntoView,
  unzoomViewport,
} from "@/components/shared/viewport-unzoom";

describe("Viewport and Keyboard Manager", () => {
  let mockWindow: any;
  let mockDocument: any;
  let rootProperties: Record<string, string>;
  let rootAttributes: Record<string, string>;

  beforeEach(() => {
    rootProperties = {};
    rootAttributes = {};

    const documentElement = {
      style: {
        setProperty: (key: string, val: string) => {
          rootProperties[key] = val;
        },
        getPropertyValue: (key: string) => rootProperties[key] || "",
      },
      setAttribute: (key: string, val: string) => {
        rootAttributes[key] = val;
      },
      removeAttribute: (key: string) => {
        delete rootAttributes[key];
      },
      hasAttribute: (key: string) => key in rootAttributes,
      getAttribute: (key: string) => rootAttributes[key],
    };

    mockDocument = {
      documentElement,
      activeElement: null,
      querySelector: () => null,
      createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        style: {},
        isContentEditable: false,
        parentElement: null,
      }),
    };

    mockWindow = {
      innerHeight: 844,
      visualViewport: {
        height: 844,
        offsetTop: 0,
        scale: 1,
      },
      scrollBy: () => {},
      scrollTo: () => {},
      getComputedStyle: () => ({ overflowY: "visible" }),
    };

    // Attach to globalThis
    (globalThis as any).window = mockWindow;
    (globalThis as any).document = mockDocument;
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  describe("isInputField detection", () => {
    it("identifies input elements", () => {
      const input = { tagName: "INPUT", isContentEditable: false };
      expect(isInputField(input as any)).toBe(true);
    });

    it("identifies textarea elements", () => {
      const textarea = { tagName: "TEXTAREA", isContentEditable: false };
      expect(isInputField(textarea as any)).toBe(true);
    });

    it("identifies select elements", () => {
      const select = { tagName: "SELECT", isContentEditable: false };
      expect(isInputField(select as any)).toBe(true);
    });

    it("identifies contenteditable elements", () => {
      const div = { tagName: "DIV", isContentEditable: true };
      expect(isInputField(div as any)).toBe(true);
    });

    it("rejects non-input elements", () => {
      const div = { tagName: "DIV", isContentEditable: false };
      const button = { tagName: "BUTTON", isContentEditable: false };
      expect(isInputField(div as any)).toBe(false);
      expect(isInputField(button as any)).toBe(false);
      expect(isInputField(null)).toBe(false);
    });
  });

  describe("updateViewportState", () => {
    it("resets to default 50% center and 86dvh when keyboard is closed", () => {
      mockWindow.innerHeight = 844;
      mockWindow.visualViewport = {
        height: 844,
        offsetTop: 0,
        scale: 1,
      };

      updateViewportState();

      expect(rootProperties["--keyboard-height"]).toBe("0px");
      expect(rootProperties["--dialog-center-y"]).toBe("50%");
      expect(rootProperties["--dialog-max-height"]).toBe("86dvh");
      expect(rootProperties["--keyboard-open"]).toBe("0");
      expect("--keyboard-open" in rootAttributes).toBe(false);
    });

    it("calculates centered dialog and keyboard height when keyboard opens", () => {
      mockWindow.innerHeight = 844;
      // Software keyboard opens: 344px tall keyboard, visible height 500px
      mockWindow.visualViewport = {
        height: 500,
        offsetTop: 0,
        scale: 1,
      };

      updateViewportState();

      expect(rootProperties["--keyboard-height"]).toBe("344px");
      // Center of 500px visible height is 250px
      expect(rootProperties["--dialog-center-y"]).toBe("250px");
      // Max height is 500 - 24 = 476px
      expect(rootProperties["--dialog-max-height"]).toBe("476px");
      expect(rootProperties["--keyboard-open"]).toBe("1");
      expect(rootAttributes["data-keyboard-open"]).toBe("true");
    });

    it("accounts for visualViewport offsetTop when iOS Safari shifts the viewport", () => {
      mockWindow.innerHeight = 844;
      // Shrunken viewport shifted down by 40px
      mockWindow.visualViewport = {
        height: 480,
        offsetTop: 40,
        scale: 1,
      };

      updateViewportState();

      // keyboard = 844 - 480 - 40 = 324px
      expect(rootProperties["--keyboard-height"]).toBe("324px");
      // Center = offsetTop (40) + visibleH/2 (240) = 280px
      expect(rootProperties["--dialog-center-y"]).toBe("280px");
      // Max height = 480 - 24 = 456px
      expect(rootProperties["--dialog-max-height"]).toBe("456px");
      expect(rootAttributes["data-keyboard-open"]).toBe("true");
    });

    it("gracefully falls back when visualViewport is not supported", () => {
      mockWindow.visualViewport = null;

      updateViewportState();

      expect(rootProperties["--keyboard-height"]).toBe("0px");
      expect(rootProperties["--dialog-center-y"]).toBe("50%");
      expect(rootProperties["--dialog-max-height"]).toBe("86dvh");
    });
  });

  describe("scrollActiveInputIntoView", () => {
    it("does nothing if no active input is present", () => {
      expect(() => scrollActiveInputIntoView(null)).not.toThrow();
    });

    it("scrolls internal container when input is inside an overflow container", () => {
      let scrollAmount: any = null;
      const container: any = {
        tagName: "DIV",
        parentElement: null,
        scrollBy: (opts: any) => {
          scrollAmount = opts;
        },
        getBoundingClientRect: () => ({
          top: 100,
          bottom: 400,
          height: 300,
        }),
      };

      const input: any = {
        tagName: "INPUT",
        isContentEditable: false,
        parentElement: container,
        getBoundingClientRect: () => ({
          top: 360,
          bottom: 395,
          height: 35,
        }),
      };

      mockWindow.getComputedStyle = (el: any) => {
        if (el === container) return { overflowY: "auto" };
        return { overflowY: "visible" };
      };

      scrollActiveInputIntoView(input);

      expect(scrollAmount).not.toBeNull();
      expect(scrollAmount.behavior).toBe("smooth");
      expect(scrollAmount.top).toBeGreaterThan(0);
    });

    it("scrolls window when input is directly on page and near bottom", () => {
      let windowScroll: any = null;
      mockWindow.scrollBy = (opts: any) => {
        windowScroll = opts;
      };

      mockWindow.visualViewport = {
        height: 500,
        offsetTop: 0,
      };

      const input: any = {
        tagName: "INPUT",
        isContentEditable: false,
        parentElement: null,
        getBoundingClientRect: () => ({
          top: 450,
          bottom: 490, // Near 500
          height: 40,
        }),
      };

      mockWindow.getComputedStyle = () => ({ overflowY: "visible" });

      scrollActiveInputIntoView(input);

      expect(windowScroll).not.toBeNull();
      expect(windowScroll.behavior).toBe("smooth");
      expect(windowScroll.top).toBeGreaterThan(0);
    });
  });

  describe("unzoomViewport", () => {
    it("runs safely without errors", () => {
      expect(() => unzoomViewport()).not.toThrow();
    });
  });
});
