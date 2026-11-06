import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { renderReaderSettings } from "../../../src/settings/tabs/display-settings-sections";
import { loadAndNormalizeSettings } from "../../../src/utils/settings-normalization";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { isToggleOn, setToggle } from "../test-toggle-helpers";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
}

describe("Show fetched content first setting", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("is off by default", () => {
    expect(DEFAULT_SETTINGS.display.showFetchedContentFirst).toBe(false);
  });

  it("falls back to off for a missing or non-boolean stored value", () => {
    const raw = cloneSettings() as unknown as {
      display: Record<string, unknown>;
    };
    raw.display.showFetchedContentFirst = "yes";
    expect(loadAndNormalizeSettings(raw).display.showFetchedContentFirst).toBe(
      false,
    );
    delete raw.display.showFetchedContentFirst;
    expect(loadAndNormalizeSettings(raw).display.showFetchedContentFirst).toBe(
      false,
    );
  });

  it("keeps a stored true", () => {
    const raw = cloneSettings();
    raw.display.showFetchedContentFirst = true;
    expect(loadAndNormalizeSettings(raw).display.showFetchedContentFirst).toBe(
      true,
    );
  });

  it("renders a Reader toggle that saves the choice", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    const saveSettings = vi.fn(async () => {});
    renderReaderSettings(
      containerEl,
      { settings, saveSettings } as unknown as Parameters<
        typeof renderReaderSettings
      >[1],
      vi.fn(),
      undefined,
      vi.fn(async () => {}),
    );

    const row = Array.from(
      containerEl.querySelectorAll<HTMLElement>(".setting-item"),
    ).find(
      (el) =>
        el.querySelector(".setting-item-name")?.textContent ===
        "Show fetched content first",
    );
    expect(row).toBeDefined();
    expect(isToggleOn(row)).toBe(false);

    setToggle(row?.querySelector("input[type=checkbox]"), true);
    await Promise.resolve();

    expect(settings.display.showFetchedContentFirst).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});
