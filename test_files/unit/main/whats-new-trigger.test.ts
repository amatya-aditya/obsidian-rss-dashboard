import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, type PluginManifest } from "obsidian";

const openModal = vi.fn();

vi.mock("../../../src/generated/whats-new-content", () => ({
  WHATS_NEW_VERSION: "2.7.0",
  WHATS_NEW_FEATURES: ["Add a What's New popup"],
}));

vi.mock("../../../src/modals/whats-new-modal", () => ({
  WhatsNewModal: class {
    open = openModal;
  },
}));

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

interface WorkspaceStub {
  getActiveViewOfType: (type: unknown) => unknown;
  triggerLayoutReady: () => void;
}

async function loadedPlugin(): Promise<{
  plugin: RssDashboardPlugin;
  workspace: WorkspaceStub;
}> {
  const app = App.createMock();
  const plugin = new RssDashboardPlugin(app, manifest);
  plugin.loadData = vi.fn().mockResolvedValue({
    ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    lastShownVersion: "2.6.0",
  });
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  await plugin.loadSettings();
  return { plugin, workspace: app.workspace as unknown as WorkspaceStub };
}

type Trigger = { maybeShowWhatsNewForActiveDashboard: () => void };

describe("What's New popup trigger", () => {
  beforeEach(() => {
    openModal.mockClear();
  });

  it("does not show, or record the version as shown, while the dashboard is not the active view", async () => {
    const { plugin, workspace } = await loadedPlugin();
    workspace.getActiveViewOfType = () => null;

    (plugin as unknown as Trigger).maybeShowWhatsNewForActiveDashboard();
    await Promise.resolve();

    expect(openModal).not.toHaveBeenCalled();
    expect(plugin.settings.lastShownVersion).toBe("2.6.0");
  });

  it("shows once when the dashboard becomes the active view, then not again this session", async () => {
    const { plugin, workspace } = await loadedPlugin();
    const trigger = plugin as unknown as Trigger;

    workspace.getActiveViewOfType = () => null;
    trigger.maybeShowWhatsNewForActiveDashboard();

    workspace.getActiveViewOfType = () => ({});
    trigger.maybeShowWhatsNewForActiveDashboard();
    trigger.maybeShowWhatsNewForActiveDashboard();
    await vi.waitFor(() => expect(openModal).toHaveBeenCalledTimes(1));

    expect(plugin.settings.lastShownVersion).toBe("2.7.0");
  });
});
