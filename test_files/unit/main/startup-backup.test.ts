import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";

// Record every backup snapshot any BackupService instance writes, so the test
// observes the startup snapshot regardless of which instance performs it.
const backupSnapshots = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../../src/services/backup-service", () => ({
  BackupService: class BackupService {
    performAutoBackups(): Promise<void> {
      backupSnapshots.count += 1;
      return Promise.resolve();
    }
  },
}));

import RssDashboardPlugin from "../../../main";

function createManifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    dir: ".",
  };
}

describe("startup settings load backup", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    backupSnapshots.count = 0;
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("backs up the settings that loading normalizes and saves on a fresh plugin", async () => {
    // A fresh plugin, as Obsidian constructs it: no services initialized yet.
    const plugin = new RssDashboardPlugin(App.createMock(), createManifest());
    // A negative refresh interval is normalized on load, which forces a save.
    // Legacy JSON storage persists without waiting on a synced user-state file.
    plugin.loadData = vi.fn().mockResolvedValue({
      storageMode: "legacy-json",
      refreshInterval: -5,
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.saveData).toHaveBeenCalled();
    expect(backupSnapshots.count).toBe(1);
    expect(consoleError).not.toHaveBeenCalledWith(
      "[RSS Dashboard] Backup after save failed:",
      expect.anything(),
    );
  });
});
