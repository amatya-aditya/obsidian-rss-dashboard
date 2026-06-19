import { App, WorkspaceLeaf, Notice } from "obsidian";
import { SettingsManager } from "./settings-manager";
import { RSS_DASHBOARD_VIEW_TYPE } from "../views/dashboard-view";
import { RSS_DISCOVER_VIEW_TYPE } from "../views/discover-view";
import { RSS_SMALLWEB_VIEW_TYPE } from "../views/kagi-smallweb-view";

export class ViewOrchestrator {
  constructor(private app: App, private settingsManager: SettingsManager) {}

  public async activateView(): Promise<void> {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        switch (this.settingsManager.settings.viewLocation) {
          case "left-sidebar":
            leaf = workspace.getLeftLeaf(false);
            break;
          case "right-sidebar":
            leaf = workspace.getRightLeaf(false);
            break;
          default:
            leaf = workspace.getLeaf("tab");
            break;
        }
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_DASHBOARD_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening RSS dashboard view");
    }
  }

  public async activateDiscoverView(): Promise<void> {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_DISCOVER_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        leaf = workspace.getLeaf("tab");
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_DISCOVER_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening RSS discover view");
    }
  }

  public async activateSmallwebView(): Promise<void> {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_SMALLWEB_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        leaf = workspace.getLeaf("tab");
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_SMALLWEB_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening kagi smallweb");
    }
  }

  public applyMobileOptimizations(): void {
    const settings = this.settingsManager.settings;
    if (settings.refreshInterval > 0 && settings.refreshInterval < 60) {
      settings.refreshInterval = 60;
    }

    if (settings.maxItems > 50) {
      settings.maxItems = 50;
    }

    if (!settings.sidebarCollapsed) {
      settings.sidebarCollapsed = true;
    }
  }
}
