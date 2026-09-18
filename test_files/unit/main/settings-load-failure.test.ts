import { describe, it, expect, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

const manifest: PluginManifest = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "2.7.0",
  author: "test",
  description: "test",
  dir: ".",
};

async function pluginWhoseSettingsFailedToLoad(): Promise<{
  plugin: RssDashboardPlugin;
  saveData: ReturnType<typeof vi.fn>;
}> {
  const plugin = new RssDashboardPlugin(App.createMock(), manifest);
  const saveData = vi.fn().mockResolvedValue(undefined);
  plugin.loadData = vi
    .fn()
    .mockRejectedValue(new SyntaxError("Unexpected token } in JSON"));
  plugin.saveData = saveData;
  await plugin.loadSettings();
  return { plugin, saveData };
}

describe("when data.json cannot be read at startup", () => {
  it("does not persist the in-memory fallback settings over the user's data.json", async () => {
    const { plugin, saveData } = await pluginWhoseSettingsFailedToLoad();

    await plugin.saveSettings();

    expect(saveData).not.toHaveBeenCalled();
  });

  it("does not mutate the shared DEFAULT_SETTINGS object", async () => {
    const { plugin } = await pluginWhoseSettingsFailedToLoad();

    expect(plugin.settings).not.toBe(DEFAULT_SETTINGS);
  });

  it("saves normally again once a later load succeeds", async () => {
    const { plugin, saveData } = await pluginWhoseSettingsFailedToLoad();
    plugin.loadData = vi
      .fn()
      .mockResolvedValue(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
    await plugin.loadSettings();
    saveData.mockClear();

    plugin.settings.viewStyle = "list";
    await plugin.saveSettings();

    expect(saveData).toHaveBeenCalled();
  });
});
