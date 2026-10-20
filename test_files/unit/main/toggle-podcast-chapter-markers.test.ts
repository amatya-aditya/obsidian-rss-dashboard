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

describe("togglePodcastChapterMarkers", () => {
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
      .spyOn(plugin, "applyPodcastChapterMarkers")
      .mockResolvedValue(undefined);
    saveSpy = vi.spyOn(plugin, "saveSettings").mockResolvedValue(undefined);
    refreshSpy = vi.fn();
    plugin.settingTab = { refresh: refreshSpy } as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  it("turns markers off when they are on, persists it and announces it", async () => {
    plugin.settings.media.showPodcastChapterMarkers = true;

    await expect(plugin.togglePodcastChapterMarkers()).resolves.toBe(false);

    expect(plugin.settings.media.showPodcastChapterMarkers).toBe(false);
    expect(applySpy).toHaveBeenLastCalledWith(false);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(notices()).toEqual(["Chapter markers off"]);
  });

  it("turns markers on when they are off and announces it", async () => {
    plugin.settings.media.showPodcastChapterMarkers = false;

    await expect(plugin.togglePodcastChapterMarkers()).resolves.toBe(true);

    expect(plugin.settings.media.showPodcastChapterMarkers).toBe(true);
    expect(applySpy).toHaveBeenLastCalledWith(true);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(notices()).toEqual(["Chapter markers on"]);
  });

  it("refreshes an open settings tab so its toggle follows", async () => {
    await plugin.togglePodcastChapterMarkers();

    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("does not fail when no settings tab has been created", async () => {
    plugin.settingTab = null;

    await expect(plugin.togglePodcastChapterMarkers()).resolves.toBe(false);
  });
});
