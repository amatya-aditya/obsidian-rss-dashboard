import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

const manifest: PluginManifest = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "1.0.0",
  minAppVersion: "1.8.7",
  author: "test",
  description: "test",
  dir: ".",
};

describe("toggleVideoFocusMode", () => {
  let plugin: RssDashboardPlugin;
  let applySpy: ReturnType<typeof vi.spyOn>;
  let saveSpy: ReturnType<typeof vi.spyOn>;
  let refreshSpy: ReturnType<typeof vi.fn>;
  let noticeSpy: ReturnType<typeof vi.spyOn>;

  const notices = (): unknown[] =>
    noticeSpy.mock.calls
      .filter((call: unknown[]) => call[0] === "[Stub Notice]")
      .map((call: unknown[]) => call[1]);

  beforeEach(() => {
    vi.restoreAllMocks();
    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    plugin = new RssDashboardPlugin(
      new App() as unknown as ConstructorParameters<
        typeof RssDashboardPlugin
      >[0],
      manifest,
    );
    plugin.settings = structuredClone(DEFAULT_SETTINGS);
    applySpy = vi
      .spyOn(plugin, "applyVideoFocusMode")
      .mockResolvedValue(undefined);
    saveSpy = vi.spyOn(plugin, "saveSettings").mockResolvedValue(undefined);
    refreshSpy = vi.fn();
    plugin.settingTab = { refresh: refreshSpy } as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  it("turns Video focus mode on when it is off and announces it", async () => {
    plugin.settings.media.youtubeFocusMode = false;

    await expect(plugin.toggleVideoFocusMode()).resolves.toBe(true);

    expect(plugin.settings.media.youtubeFocusMode).toBe(true);
    expect(applySpy).toHaveBeenLastCalledWith(true);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(notices()).toEqual(["Video focus mode on"]);
  });

  it("turns Video focus mode off when it is on and announces it", async () => {
    plugin.settings.media.youtubeFocusMode = true;

    await expect(plugin.toggleVideoFocusMode()).resolves.toBe(false);

    expect(plugin.settings.media.youtubeFocusMode).toBe(false);
    expect(applySpy).toHaveBeenLastCalledWith(false);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(notices()).toEqual(["Video focus mode off"]);
  });

  it("refreshes an open settings tab so its Video focus mode toggle follows", async () => {
    await plugin.toggleVideoFocusMode();

    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("does not fail when no settings tab has been created", async () => {
    plugin.settingTab = null;

    await expect(plugin.toggleVideoFocusMode()).resolves.toBe(true);
  });

  it("preserves toggleYouTubeFocusMode as a working compatibility alias", async () => {
    plugin.settings.media.youtubeFocusMode = false;

    await expect(plugin.toggleYouTubeFocusMode()).resolves.toBe(true);

    expect(plugin.settings.media.youtubeFocusMode).toBe(true);
    expect(applySpy).toHaveBeenLastCalledWith(true);
    expect(notices()).toEqual(["Video focus mode on"]);
  });
});
