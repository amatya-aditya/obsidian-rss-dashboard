import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReaderFormatPortal } from "../../../src/utils/reader-format-portal";
import type { ReaderFormatSettings } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

type ObsidianHTMLElement = HTMLElement & {
  createDiv: (options?: { cls?: string }) => HTMLDivElement;
};

function createFormat(): ReaderFormatSettings {
  return {
    textAlign: "justify",
    paragraphWidth: 100,
    fontScalePct: 100,
    lineHeightPct: 140,
    fontFamily: "default",
    paragraphSpacing: "default",
  };
}

function setNarrowViewport(matches: boolean): void {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches,
  } as MediaQueryList);
}

describe("createReaderFormatPortal characterization", () => {
  beforeEach(() => {
    document.body.empty();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.empty();
  });

  it("closes idempotently without flushing when requested and removes outside handling", () => {
    setNarrowViewport(false);
    const flushSave = vi.fn();
    const onClosed = vi.fn();
    const handle = createReaderFormatPortal({
      anchor: (document.body as ObsidianHTMLElement).createDiv(),
      format: createFormat(),
      defaults: createFormat(),
      applyFormat: vi.fn(),
      scheduleSave: vi.fn(),
      flushSave,
      openReaderDisplaySettings: vi.fn(),
      onClosed,
    });

    vi.runOnlyPendingTimers();
    handle.close(false);
    handle.close(true);
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(
      document.querySelector(".rss-reader-format-dropdown-portal"),
    ).toBeNull();
    expect(flushSave).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("updates mobile sheet height on visual viewport resize and removes listeners on close", () => {
    setNarrowViewport(true);
    const listeners = new Map<
      string,
      EventListenerOrEventListenerObject | null
    >();
    let viewportHeight = 400;
    const visualViewport = {
      get height() {
        return viewportHeight;
      },
      addEventListener: vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject | null) =>
          listeners.set(type, listener),
      ),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    } as unknown as VisualViewport;
    vi.spyOn(document, "defaultView", "get").mockReturnValue({
      matchMedia: window.matchMedia,
      innerHeight: 400,
      visualViewport,
      getComputedStyle: () => ({ bottom: "20px" }) as CSSStyleDeclaration,
    } as unknown as typeof window);

    const handle = createReaderFormatPortal({
      anchor: (document.body as ObsidianHTMLElement).createDiv(),
      format: createFormat(),
      defaults: createFormat(),
      applyFormat: vi.fn(),
      scheduleSave: vi.fn(),
      flushSave: vi.fn(),
      openReaderDisplaySettings: vi.fn(),
    });
    const portal = document.querySelector<HTMLElement>(
      ".rss-reader-format-dropdown-portal",
    );
    expect(portal?.style.getPropertyValue("max-height")).toBe("320px");
    expect(portal?.style.getPropertyPriority("max-height")).toBe("important");

    viewportHeight = 800;
    const onResize = listeners.get("resize");
    if (typeof onResize === "function") onResize(new Event("resize"));
    else onResize?.handleEvent(new Event("resize"));
    expect(portal?.style.getPropertyValue("max-height")).toBe("640px");

    handle.close(false);
    expect(listeners.has("resize")).toBe(false);
    expect(listeners.has("scroll")).toBe(false);
    expect(visualViewport.removeEventListener).toHaveBeenCalledTimes(2);
  });
  it("does not install outside-click handling after closing before registration", () => {
    setNarrowViewport(false);
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    const handle = createReaderFormatPortal({
      anchor: (document.body as ObsidianHTMLElement).createDiv(),
      format: createFormat(),
      defaults: createFormat(),
      applyFormat: vi.fn(),
      scheduleSave: vi.fn(),
      flushSave: vi.fn(),
      openReaderDisplaySettings: vi.fn(),
    });

    handle.close(false);
    vi.runOnlyPendingTimers();

    expect(addListener).not.toHaveBeenCalledWith(
      "mousedown",
      expect.any(Function),
    );
    expect(removeListener).not.toHaveBeenCalledWith(
      "mousedown",
      expect.any(Function),
    );
  });

  it("closes on an outside click after listener registration", () => {
    setNarrowViewport(false);
    const flushSave = vi.fn();
    const handle = createReaderFormatPortal({
      anchor: (document.body as ObsidianHTMLElement).createDiv(),
      format: createFormat(),
      defaults: createFormat(),
      applyFormat: vi.fn(),
      scheduleSave: vi.fn(),
      flushSave,
      openReaderDisplaySettings: vi.fn(),
    });

    vi.runOnlyPendingTimers();
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(
      document.querySelector(".rss-reader-format-dropdown-portal"),
    ).toBeNull();
    expect(flushSave).toHaveBeenCalledTimes(1);
    handle.close(false);
  });
});
