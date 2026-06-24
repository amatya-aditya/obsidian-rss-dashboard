// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { App, Workspace, WorkspaceLeaf } from "obsidian";
import { ViewOrchestrator } from "../../../src/services/view-orchestrator";
import { SettingsManager } from "../../../src/services/settings-manager";
import { DEFAULT_SETTINGS, RssDashboardSettings } from "../../../src/types/types";

describe("ViewOrchestrator", () => {
  let mockApp: App;
  let mockSettingsManager: SettingsManager;
  let mockWorkspace: Workspace;
  let orchestrator: ViewOrchestrator;
  
  let getLeavesOfType: Mock<(type: string) => WorkspaceLeaf[]>;
  let getRightLeaf: Mock<(split: boolean) => WorkspaceLeaf>;
  let getLeftLeaf: Mock<(split: boolean) => WorkspaceLeaf>;
  let getLeaf: Mock<(id: string) => WorkspaceLeaf>;
  let revealLeaf: Mock<(leaf: WorkspaceLeaf) => void>;

  beforeEach(() => {
    getLeavesOfType = vi.fn();
    getRightLeaf = vi.fn();
    getLeftLeaf = vi.fn();
    getLeaf = vi.fn();
    revealLeaf = vi.fn();

    mockWorkspace = {
      getLeavesOfType,
      getLeftLeaf,
      getRightLeaf,
      getLeaf,
      revealLeaf,
    } as unknown as Workspace;

    mockApp = {
      workspace: mockWorkspace,
    } as unknown as App;

    mockSettingsManager = {
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings,
    } as unknown as SettingsManager;

    orchestrator = new ViewOrchestrator(mockApp, mockSettingsManager);
  });

  describe("activateView", () => {
    it("reveals existing dashboard view if one exists", async () => {
      const mockLeaf = { setViewState: vi.fn() } as unknown as WorkspaceLeaf;
      getLeavesOfType.mockReturnValue([mockLeaf]);

      await orchestrator.activateView();

      expect(getLeavesOfType).toHaveBeenCalledWith("rss-dashboard-view");
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({ type: "rss-dashboard-view", active: true });
      expect(revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });

    it("creates a new leaf based on viewLocation setting if none exists", async () => {
      getLeavesOfType.mockReturnValue([]);
      const mockLeaf = { setViewState: vi.fn() } as unknown as WorkspaceLeaf;
      getRightLeaf.mockReturnValue(mockLeaf);
      
      mockSettingsManager.settings.viewLocation = "right-sidebar";

      await orchestrator.activateView();

      expect(getRightLeaf).toHaveBeenCalledWith(false);
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({ type: "rss-dashboard-view", active: true });
    });
  });

  describe("activateDiscoverView", () => {
    it("reveals existing discover view if one exists", async () => {
      const mockLeaf = { setViewState: vi.fn() } as unknown as WorkspaceLeaf;
      getLeavesOfType.mockReturnValue([mockLeaf]);

      await orchestrator.activateDiscoverView();

      expect(getLeavesOfType).toHaveBeenCalledWith("rss-discover-view");
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({ type: "rss-discover-view", active: true });
      expect(revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });
  });

  describe("activateSmallwebView", () => {
    it("reveals existing smallweb view if one exists", async () => {
      const mockLeaf = { setViewState: vi.fn() } as unknown as WorkspaceLeaf;
      getLeavesOfType.mockReturnValue([mockLeaf]);

      await orchestrator.activateSmallwebView();

      expect(getLeavesOfType).toHaveBeenCalledWith("rss-smallweb-view");
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({ type: "rss-smallweb-view", active: true });
      expect(revealLeaf).toHaveBeenCalledWith(mockLeaf);
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
