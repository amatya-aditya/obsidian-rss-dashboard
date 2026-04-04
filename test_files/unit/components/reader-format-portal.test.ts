import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { createReaderFormatPortal } from "../../../src/utils/reader-format-portal";
import type { ReaderFormatSettings } from "../../../src/types/types";

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
    const openReaderDisplaySettings = vi.fn();

    const handle = createReaderFormatPortal({
      anchor,
      format,
      defaults,
      applyFormat,
      scheduleSave,
      flushSave,
      openReaderDisplaySettings,
    });

    const portal = document.body.querySelector(".rss-reader-format-dropdown-portal");
    expect(portal).toBeTruthy();
    expect(document.body.querySelector(".rss-reader-format-sheet-backdrop")).toBeNull();

    expect(portal?.textContent).toContain("Theme default");
    expect(portal?.textContent).not.toContain("Font default");
    expect(portal?.textContent).not.toContain("Paragraph width");

    const fontScaleValue = portal?.querySelector(
      ".rss-reader-format-row[data-setting='fontScalePct'] .rss-reader-format-value",
    ) as HTMLElement | null;
    expect(fontScaleValue?.textContent).toBe("100%");

    const fontScaleIncrease = portal?.querySelector(
      ".rss-reader-format-row[data-setting='fontScalePct'] .rss-reader-format-stepper-increase",
    ) as HTMLElement | null;
    expect(fontScaleIncrease).toBeTruthy();
    fontScaleIncrease?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(format.fontScalePct).toBe(110);
    expect(fontScaleValue?.textContent).toBe("110%");
    expect(applyFormat).toHaveBeenCalledTimes(1);
    expect(scheduleSave).toHaveBeenCalledTimes(1);

    const lineHeightDecrease = portal?.querySelector(
      ".rss-reader-format-row[data-setting='lineHeightPct'] .rss-reader-format-stepper-decrease",
    ) as HTMLElement | null;
    expect(lineHeightDecrease).toBeTruthy();
    lineHeightDecrease?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(format.lineHeightPct).toBe(130);
    expect(applyFormat).toHaveBeenCalledTimes(2);
    expect(scheduleSave).toHaveBeenCalledTimes(2);

    const fontFamilyButtons = Array.from(
      portal?.querySelectorAll(".rss-reader-format-font-button") ?? [],
    ) as HTMLButtonElement[];
    expect(fontFamilyButtons.map((button) => button.textContent?.trim())).toEqual([
      "Theme default",
      "Serif",
      "Sans",
      "Mono",
    ]);

    const serifButton = fontFamilyButtons.find(
      (button) => button.dataset.value === "serif",
    );
    serifButton?.click();
    expect(format.fontFamily).toBe("serif");
    expect(applyFormat).toHaveBeenCalledTimes(3);
    expect(scheduleSave).toHaveBeenCalledTimes(3);

    const settingsButton = portal?.querySelector(
      ".rss-reader-format-settings-button",
    ) as HTMLElement | null;
    expect(settingsButton).toBeTruthy();
    settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(openReaderDisplaySettings).toHaveBeenCalledTimes(1);

    handle.close(true);
    expect(flushSave).toHaveBeenCalled();
    expect(document.body.querySelector(".rss-reader-format-dropdown-portal")).toBeNull();
  });

  it("resets the quick controls back to defaults", () => {
    setMatchMedia(false);

    const anchor = document.body.createDiv();
    const format = createFormat({
      fontScalePct: 150,
      lineHeightPct: 180,
      fontFamily: "mono",
    });
    const defaults = createFormat();

    const applyFormat = vi.fn();
    const scheduleSave = vi.fn();

    createReaderFormatPortal({
      anchor,
      format,
      defaults,
      applyFormat,
      scheduleSave,
      flushSave: vi.fn(),
      openReaderDisplaySettings: vi.fn(),
    });

    const portal = document.body.querySelector(".rss-reader-format-dropdown-portal");
    const resetButton = portal?.querySelector(
      ".rss-reader-format-reset-button",
    ) as HTMLElement | null;
    expect(resetButton).toBeTruthy();

    resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(format.fontScalePct).toBe(defaults.fontScalePct);
    expect(format.lineHeightPct).toBe(defaults.lineHeightPct);
    expect(format.fontFamily).toBe(defaults.fontFamily);

    const fontScaleValue = portal?.querySelector(
      ".rss-reader-format-row[data-setting='fontScalePct'] .rss-reader-format-value",
    ) as HTMLElement | null;
    expect(fontScaleValue?.textContent).toBe("100%");

    const activeFontButton = portal?.querySelector(
      ".rss-reader-format-font-button.is-active",
    ) as HTMLElement | null;
    expect(activeFontButton?.textContent?.trim()).toBe("Theme default");
    expect(applyFormat).toHaveBeenCalledTimes(1);
    expect(scheduleSave).toHaveBeenCalledTimes(1);
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
      openReaderDisplaySettings: vi.fn(),
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

