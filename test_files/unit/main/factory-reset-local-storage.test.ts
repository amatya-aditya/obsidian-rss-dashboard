/**
 * Pins the caller side of the factory-reset local-storage contract.
 *
 * The registered keys are cleared through `clearFactoryResetLocalStorage()` in
 * `main.ts`. Its observable result changed when the per-device Left-handed
 * layout key joined the list (#986), so this covers the caller, not only the
 * list itself — see "Sibling callers of a changed shared function" in
 * `docs/development/test_coverage/testing-guide.md`.
 */
import { describe, expect, it, vi } from "vitest";
import { App, type MockApp, type PluginManifest } from "obsidian";

import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { LEFT_HANDED_LAYOUT_STORAGE_KEY } from "../../../src/utils/left-handed-layout";
import { FACTORY_RESET_LOCAL_STORAGE_KEYS } from "../../../src/utils/settings-loader";

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: "my-config/plugins/rss-dashboard",
  };
}

async function startPlugin(app: MockApp): Promise<RssDashboardPlugin> {
  const plugin = new RssDashboardPlugin(app, manifest());
  plugin.loadData = vi
    .fn()
    .mockResolvedValue(structuredClone(DEFAULT_SETTINGS));
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  await plugin.loadSettings();
  return plugin;
}

/** Seeds every registered key, the way real use would have left them. */
function seedRegisteredKeys(app: MockApp): void {
  for (const key of FACTORY_RESET_LOCAL_STORAGE_KEYS) {
    app.saveLocalStorage(key, true);
  }
}

describe("Factory reset local storage", () => {
  it("clears every registered key, including the left-handed layout", async () => {
    const app = App.createMock();
    const removed: string[] = [];
    (
      app as unknown as { removeLocalStorage?: (key: string) => void }
    ).removeLocalStorage = (key) => {
      removed.push(key);
      app.saveLocalStorage(key, undefined);
    };
    seedRegisteredKeys(app);

    const plugin = await startPlugin(app);
    // Startup migrations may clear keys of their own; only the reset counts.
    removed.length = 0;
    await plugin.performFactoryReset();

    expect(removed).toEqual([...FACTORY_RESET_LOCAL_STORAGE_KEYS]);
    expect(removed).toContain(LEFT_HANDED_LAYOUT_STORAGE_KEY);
    for (const key of FACTORY_RESET_LOCAL_STORAGE_KEYS) {
      expect(app.loadLocalStorage(key)).toBeUndefined();
    }
  });

  it("writes null for every registered key when the host cannot remove them", async () => {
    const app = App.createMock();
    const saveLocalStorage = vi.spyOn(app, "saveLocalStorage");
    seedRegisteredKeys(app);
    (
      app as unknown as { removeLocalStorage?: (key: string) => void }
    ).removeLocalStorage = undefined;

    const plugin = await startPlugin(app);
    await plugin.performFactoryReset();

    expect(saveLocalStorage).toHaveBeenCalledWith(
      LEFT_HANDED_LAYOUT_STORAGE_KEY,
      null,
    );
    for (const key of FACTORY_RESET_LOCAL_STORAGE_KEYS) {
      expect(saveLocalStorage).toHaveBeenCalledWith(key, null);
      expect(app.loadLocalStorage(key)).toBeNull();
    }
  });
});
