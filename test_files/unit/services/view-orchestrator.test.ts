// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Workspace, WorkspaceLeaf } from "obsidian";
import { ViewOrchestrator } from "../../../src/services/view-orchestrator";
import { SettingsManager } from "../../../src/services/settings-manager";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

describe("ViewOrchestrator", () => {
  let mockApp: App;
  let mockSettingsManager: SettingsManager;
  let mockWorkspace: Workspace;
  let orchestrator: ViewOrchestrator;

  beforeEach(() => {
    mockWorkspace = {
      getLeavesOfType: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      getLeaf: vi.fn(),
      revealLeaf: vi.fn(),
    } as unknown as Workspace;

    mockApp = {
      workspace: mockWorkspace,
    } as unknown as App;

    mockSettingsManager = {
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    } as unknown as SettingsManager;

    orchestrator = new ViewOrchestrator(mockApp, mockSettingsManager);
  });

  describe("activateView", () => {
    it("reveals existing dashboard view if one exists", async () => {
      const mockLeaf = { setViewState: vi.fn() } as unknown as WorkspaceLeaf;
      vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([mockLeaf]);

      await orchestrator.activateView();

      expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith("rss-dashboard-view");
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({ type: "rss-dashboard-view", active: true });
      expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });

    it("creates a new leaf based on viewLocation setting if none exists", async () => {
      vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([]);
      const mockLeaf = { setViewState: vi.fn() } as unknown as WorkspaceLeaf;
      vi.mocked(mockWorkspace.getRightLeaf).mockReturnValue(mockLeaf);
      
      mockSettingsManager.settings.viewLocation = "right-sidebar";

      await orchestrator.activateView();

      expect(mockWorkspace.getRightLeaf).toHaveBeenCalledWith(false);
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({ type: "rss-dashboard-view", active: true });
    });
  });

  describe("activateDiscoverView", () => {
    it("reveals existing discover view if one exists", async () => {
      const mockLeaf = { setViewState: vi.fn() } as unknown as WorkspaceLeaf;
      vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([mockLeaf]);

      await orchestrator.activateDiscoverView();

      expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith("rss-discover-view");
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({ type: "rss-discover-view", active: true });
      expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });
  });

  describe("activateSmallwebView", () => {
    it("reveals existing smallweb view if one exists", async () => {
      const mockLeaf = { setViewState: vi.fn() } as unknown as WorkspaceLeaf;
      vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([mockLeaf]);

      await orchestrator.activateSmallwebView();

      expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith("rss-smallweb-view");
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({ type: "rss-smallweb-view", active: true });
      expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });
  });

  describe("applyMobileOptimizations", () => {
    it("adjusts refresh interval, max items, and sidebar state for mobile", () => {
      mockSettingsManager.settings.refreshInterval = 30;
      mockSettingsManager.settings.maxItems = 100;
      mockSettingsManager.settings.sidebarCollapsed = false;

      orchestrator.applyMobileOptimizations();

      expect(mockSettingsManager.settings.refreshInterval).toBe(60);
      expect(mockSettingsManager.settings.maxItems).toBe(50);
      expect(mockSettingsManager.settings.sidebarCollapsed).toBe(true);
    });
  });
});
