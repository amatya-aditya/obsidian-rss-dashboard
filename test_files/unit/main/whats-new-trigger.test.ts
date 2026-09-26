import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";

const whatsNew = vi.hoisted(() => ({ open: vi.fn() }));
const storagePrompt = vi.hoisted(() => ({ open: vi.fn() }));
const releaseNotes = vi.hoisted(() => ({ hasExact: vi.fn(() => false) }));

vi.mock("../../../src/modals/whats-new-modal", () => ({
  WhatsNewModal: class {
    open = whatsNew.open;
  },
}));

vi.mock("../../../src/modals/storage-migration-modal", () => ({
  StorageMigrationModal: class {
    open = storagePrompt.open;
  },
}));

vi.mock("../../../src/release-notes", async () => {
  const actual = await vi.importActual<typeof import("../../../src/release-notes")>(
    "../../../src/release-notes",
  );
  return {
    ...actual,
    hasExactReleaseNoteForVersion: releaseNotes.hasExact,
  };
});

import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

function manifestFor(version: string): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version,
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: ".",
  };
}

interface WorkspaceStub {
  getActiveViewOfType: (type: unknown) => unknown;
}

type Trigger = {
  maybeShowWhatsNewForActiveDashboard: () => void;
  maybeShowStorageDeprecationPrompt: () => void;
  settings: { lastShownVersion?: string };
};

async function loadedPlugin(options: {
  version?: string;
  settings?: Record<string, unknown>;
  loadData?: () => Promise<unknown>;
}): Promise<{ plugin: RssDashboardPlugin; workspace: WorkspaceStub }> {
  const app = App.createMock();
  const plugin = new RssDashboardPlugin(app, manifestFor(options.version ?? "2.7.0"));
  plugin.loadData = options.loadData
    ? vi.fn().mockImplementation(options.loadData)
    : vi.fn().mockResolvedValue({
        ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        lastShownVersion: "2.6.0",
        ...options.settings,
      });
  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  await plugin.loadSettings();
  vi.spyOn(plugin, "saveSettings").mockResolvedValue(undefined);

  return { plugin, workspace: app.workspace as unknown as WorkspaceStub };
}

function dashboardActive(workspace: WorkspaceStub): void {
  workspace.getActiveViewOfType = () => ({});
}

beforeEach(() => {
  whatsNew.open.mockClear();
  storagePrompt.open.mockClear();
  releaseNotes.hasExact.mockReturnValue(false);
});

describe("What's New trigger", () => {
  it("does not show or record while the dashboard is not the active view", async () => {
    const { plugin, workspace } = await loadedPlugin({});
    workspace.getActiveViewOfType = () => null;

    (plugin as unknown as Trigger).maybeShowWhatsNewForActiveDashboard();
    await Promise.resolve();

    expect(whatsNew.open).not.toHaveBeenCalled();
    expect(plugin.settings.lastShownVersion).toBe("2.6.0");
  });

  it("shows once when the dashboard becomes active, and records the release line", async () => {
    const { plugin, workspace } = await loadedPlugin({});
    dashboardActive(workspace);
    const trigger = plugin as unknown as Trigger;

    trigger.maybeShowWhatsNewForActiveDashboard();
    trigger.maybeShowWhatsNewForActiveDashboard();
    await vi.waitFor(() => expect(whatsNew.open).toHaveBeenCalledTimes(1));

    expect(plugin.settings.lastShownVersion).toBe("2.7.0");
  });

  it("does not show or write for a patch-only update", async () => {
    const { plugin, workspace } = await loadedPlugin({
      version: "2.7.1",
      settings: { lastShownVersion: "2.7.0" },
    });
    dashboardActive(workspace);

    (plugin as unknown as Trigger).maybeShowWhatsNewForActiveDashboard();
    await Promise.resolve();

    expect(whatsNew.open).not.toHaveBeenCalled();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.settings.lastShownVersion).toBe("2.7.0");
  });

  it("shows and records an explicitly authored patch note", async () => {
    releaseNotes.hasExact.mockReturnValue(true);
    const { plugin, workspace } = await loadedPlugin({
      version: "2.7.1",
      settings: { lastShownVersion: "2.7.0" },
    });
    dashboardActive(workspace);

    (plugin as unknown as Trigger).maybeShowWhatsNewForActiveDashboard();
    await vi.waitFor(() => expect(whatsNew.open).toHaveBeenCalledTimes(1));

    expect(plugin.settings.lastShownVersion).toBe("2.7.1");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("gives the storage warning precedence and does not record the release line", async () => {
    const { plugin, workspace } = await loadedPlugin({
      settings: { storageMode: "legacy-json" },
    });
    dashboardActive(workspace);
    const trigger = plugin as unknown as Trigger;

    trigger.maybeShowWhatsNewForActiveDashboard();
    trigger.maybeShowStorageDeprecationPrompt();
    await Promise.resolve();

    expect(whatsNew.open).not.toHaveBeenCalled();
    expect(storagePrompt.open).toHaveBeenCalledTimes(1);
    expect(plugin.settings.lastShownVersion).toBe("2.6.0");
  });

  it("shows nothing and writes nothing on a null settings load", async () => {
    const { plugin, workspace } = await loadedPlugin({
      loadData: async () => null,
    });
    dashboardActive(workspace);

    (plugin as unknown as Trigger).maybeShowWhatsNewForActiveDashboard();
    await Promise.resolve();

    expect(whatsNew.open).not.toHaveBeenCalled();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("does not show on the second launch of a fresh install", async () => {
    let persisted: unknown = null;

    // First launch: a fresh install ships no data.json, so the load is null.
    const firstApp = App.createMock();
    const firstLaunch = new RssDashboardPlugin(firstApp, manifestFor("2.7.0"));
    firstLaunch.loadData = vi.fn().mockResolvedValue(null);
    firstLaunch.saveData = vi.fn().mockImplementation(async (data: unknown) => {
      persisted = JSON.parse(JSON.stringify(data));
    });
    await firstLaunch.loadSettings();
    dashboardActive(firstApp.workspace as unknown as WorkspaceStub);
    (firstLaunch as unknown as Trigger).maybeShowWhatsNewForActiveDashboard();

    // Any user change is the first write of data.json.
    firstLaunch.settings.useFirstSeenDateFallback =
      !firstLaunch.settings.useFirstSeenDateFallback;
    await firstLaunch.saveSettings();
    expect(persisted).not.toBeNull();

    // Second launch reads the data.json the first launch wrote.
    const { plugin, workspace } = await loadedPlugin({
      loadData: async () => persisted,
    });
    dashboardActive(workspace);
    (plugin as unknown as Trigger).maybeShowWhatsNewForActiveDashboard();
    await Promise.resolve();

    expect(whatsNew.open).not.toHaveBeenCalled();
  });

  it("shows nothing and writes nothing when the settings load failed", async () => {
    const { plugin, workspace } = await loadedPlugin({
      loadData: async () => {
        throw new Error("unreadable settings");
      },
    });
    dashboardActive(workspace);

    (plugin as unknown as Trigger).maybeShowWhatsNewForActiveDashboard();
    await Promise.resolve();

    expect(whatsNew.open).not.toHaveBeenCalled();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.settings.lastShownVersion).toBeUndefined();
  });
});
