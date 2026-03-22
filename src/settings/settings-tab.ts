/**
 * RSS Dashboard Settings Tab — Orchestrator
 *
 * This file was refactored from a 3151-line monolith.
 * Each settings tab now lives in its own file under src/settings/tabs/.
 * Modal classes live in src/settings/modals/settings-modals.ts.
 *
 * This file is responsible ONLY for:
 *   1. Rendering the tab bar UI
 *   2. Delegating content rendering to the appropriate tab renderer
 *
 * Tab name constants / predicates are in ./tab-names.ts (zero Obsidian deps)
 * so tests can import them without pulling in PluginSettingTab.
 */
import { App, PluginSettingTab } from "obsidian";
import RssDashboardPlugin from "./../../main";
// Re-export pure helpers for backwards compatibility with any external imports.
export { SETTINGS_TAB_NAMES, isValidSettingsTab, getInitialTab } from "./tab-names";
export type { SettingsTabName } from "./tab-names";

// Tab renderer imports
import { renderGeneralSettingsTab } from "./tabs/general-settings-tab";
import { renderDisplaySettingsTab } from "./tabs/display-settings-tab";
import { renderMediaSettingsTab } from "./tabs/media-settings-tab";
import { renderArticleSavingSettingsTab } from "./tabs/article-saving-settings-tab";
import { renderFiltersSettingsTab } from "./tabs/filters-settings-tab";
import { renderHighlightsSettingsTab } from "./tabs/highlights-settings-tab";
import { renderImportExportSettingsTab } from "./tabs/import-export-settings-tab";
import { renderTagsSettingsTab } from "./tabs/tags-settings-tab";
import { renderAboutTab } from "./tabs/about-settings-tab";
import {
  SETTINGS_TAB_NAMES,
  SettingsTabName,
  isValidSettingsTab,
  getInitialTab,
} from "./tab-names";

// ── Main class ────────────────────────────────────────────────────────────────

export class RssDashboardSettingTab extends PluginSettingTab {
  plugin: RssDashboardPlugin;
  private currentTab: SettingsTabName = getInitialTab();

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Programmatically switch to a named tab and re-render. */
  public activateTab(tabName: string): void {
    if (isValidSettingsTab(tabName)) {
      this.currentTab = tabName;
      this.display();
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Tab bar ──────────────────────────────────────────────────────────────
    const tabBar = containerEl.createDiv("rss-dashboard-settings-tab-bar");
    SETTINGS_TAB_NAMES.forEach((tab) => {
      const tabBtn = tabBar.createEl("button", {
        text: tab,
        cls:
          "rss-dashboard-settings-tab-btn" +
          (this.currentTab === tab ? " active" : ""),
      });
      tabBtn.onclick = () => {
        this.currentTab = tab;
        this.display();
      };
    });

    // ── Tab content ──────────────────────────────────────────────────────────
    const tabContent = containerEl.createDiv(
      "rss-dashboard-settings-tab-content",
    );

    /** Shorthand refresh callback passed to tab renderers that need it. */
    const onRefresh = () => this.display();

    // Listen for CustomEvents emitted by tab renderers that need a full refresh
    // (e.g. the General tab's CORS proxy toggle) without holding a class reference.
    tabContent.addEventListener("rss-settings-refresh", onRefresh);

    switch (this.currentTab) {
      case "General":
        renderGeneralSettingsTab(tabContent, this.plugin);
        break;
      case "Display":
        renderDisplaySettingsTab(tabContent, this.plugin, onRefresh);
        break;
      case "Media":
        renderMediaSettingsTab(tabContent, this.plugin);
        break;
      case "Article saving":
        renderArticleSavingSettingsTab(tabContent, this.plugin, onRefresh);
        break;
      case "Filters":
        renderFiltersSettingsTab(tabContent, this.plugin, onRefresh);
        break;
      case "Highlights":
        renderHighlightsSettingsTab(tabContent, this.plugin, onRefresh);
        break;
      case "Import/Export":
        renderImportExportSettingsTab(tabContent, this.plugin);
        break;
      case "Tags":
        renderTagsSettingsTab(tabContent, this.plugin, onRefresh);
        break;
      case "About":
        renderAboutTab(tabContent, this.plugin);
        break;
    }
  }
}
