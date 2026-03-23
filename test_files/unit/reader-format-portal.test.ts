import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installObsidianDomPolyfills } from "./test-dom-polyfills";
import { createReaderFormatPortal } from "../../src/utils/reader-format-portal";
import type { ReaderFormatSettings } from "../../src/types/types";

installObsidianDomPolyfills();

function setMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => {
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {
        // deprecated
      },
      removeListener: () => {
        // deprecated
      },
      addEventListener: () => {
        // no-op
      },
      removeEventListener: () => {
        // no-op
      },
      dispatchEvent: () => false,
    } as MediaQueryList;
  }) as typeof window.matchMedia;
}

function createFormat(overrides: Partial<ReaderFormatSettings> = {}): ReaderFormatSettings {
  return {
    textAlign: "justify",
    paragraphWidth: 100,
    fontScalePct: 100,
    lineHeightPct: 140,
    fontFamily: "default",
    paragraphSpacing: "default",
    ...overrides,
  };
}

describe("createReaderFormatPortal", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates a desktop portal and fires change callbacks", () => {
    setMatchMedia(false);

    const anchor = document.body.createDiv();
    const format = createFormat({ textAlign: "justify" });
    const defaults = createFormat();

    const applyFormat = vi.fn();
    const scheduleSave = vi.fn();
    const flushSave = vi.fn();

    const handle = createReaderFormatPortal({
      anchor,
      format,
      defaults,
      applyFormat,
      scheduleSave,
      flushSave,
    });

    const portal = document.body.querySelector(".rss-reader-format-dropdown-portal");
    expect(portal).toBeTruthy();
    expect(document.body.querySelector(".rss-reader-format-sheet-backdrop")).toBeNull();

    const selects = portal?.querySelectorAll("select") ?? [];
    expect(selects.length).toBeGreaterThan(0);

    const firstSelect = selects[0] as HTMLSelectElement;
    // Change alignment away from initial value
    firstSelect.value = "left";
    firstSelect.dispatchEvent(new Event("change"));

    expect(format.textAlign).toBe("left");
    expect(applyFormat).toHaveBeenCalled();
    expect(scheduleSave).toHaveBeenCalled();

    handle.close(true);
    expect(flushSave).toHaveBeenCalled();
    expect(document.body.querySelector(".rss-reader-format-dropdown-portal")).toBeNull();
  });

  it("creates a mobile sheet with backdrop and closes on backdrop click", () => {
    setMatchMedia(true);

    const anchor = document.body.createDiv();
    const format = createFormat();
    const defaults = createFormat();
    const flushSave = vi.fn();

    createReaderFormatPortal({
      anchor,
      format,
      defaults,
      applyFormat: vi.fn(),
      scheduleSave: vi.fn(),
      flushSave,
    });

    expect(document.body.querySelector(".rss-reader-format-dropdown-portal")).toBeTruthy();
    const backdrop = document.body.querySelector(
      ".rss-reader-format-sheet-backdrop",
    ) as HTMLElement | null;
    expect(backdrop).toBeTruthy();

    backdrop?.dispatchEvent(new MouseEvent("click"));
    expect(flushSave).toHaveBeenCalled();
    expect(document.body.querySelector(".rss-reader-format-dropdown-portal")).toBeNull();
  });
});

