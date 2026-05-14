import { beforeEach, describe, expect, it, vi } from "vitest";
import RssDashboardPlugin from "../../../main";
import { App, type PluginManifest } from "obsidian";

interface TestApp extends App {
  setting: {
    open: () => void;
    openTabById: (id: string) => void;
  };
}

interface TestPlugin extends RssDashboardPlugin {
  settingTab: {
    activateTab: (tabId: string, section?: string) => void;
  } & NonNullable<RssDashboardPlugin["settingTab"]>;
}

function createManifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    dir: ".",
  } as PluginManifest;
}

describe("openSettingsToTab()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the plugin settings and targets an optional section", async () => {
    const app = (App as unknown as { createMock: () => TestApp }).createMock();
    const setting = {
      open: vi.fn(),
      openTabById: vi.fn(),
    };
    app.setting = setting;

    const plugin = new RssDashboardPlugin(app, createManifest()) as TestPlugin;
    plugin.settingTab = {
      activateTab: vi.fn(),
    } as unknown as TestPlugin["settingTab"];

    await plugin.openSettingsToTab("Display", "Reader");

    expect(setting.open).toHaveBeenCalledTimes(1);
    expect(setting.openTabById).toHaveBeenCalledWith("rss-dashboard");
     
    expect(plugin.settingTab.activateTab).toHaveBeenCalledWith(
      "Display",
      "Reader",
    );
  });
});
