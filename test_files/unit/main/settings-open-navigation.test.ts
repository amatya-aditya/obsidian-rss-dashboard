import { beforeEach, describe, expect, it, vi } from "vitest";
import RssDashboardPlugin from "../../../main";
import { App } from "obsidian";

function createManifest() {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    dir: ".",
  };
}

describe("openSettingsToTab()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the plugin settings and targets an optional section", async () => {
    const app = (App as any).createMock();
    const setting = {
      open: vi.fn(),
      openTabById: vi.fn(),
    };
    (app as any).setting = setting;

    const plugin = new RssDashboardPlugin(app as any, createManifest() as any);
    plugin.settingTab = {
      activateTab: vi.fn(),
    } as any;

    await plugin.openSettingsToTab("Display", "Reader");

    expect(setting.open).toHaveBeenCalledTimes(1);
    expect(setting.openTabById).toHaveBeenCalledWith("rss-dashboard");
    expect(plugin.settingTab.activateTab).toHaveBeenCalledWith(
      "Display",
      "Reader",
    );
  });
});
