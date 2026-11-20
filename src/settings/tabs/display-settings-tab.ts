/**
 * Display Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderDisplaySettingsTab(containerEl, plugin, onRefresh) — main render fn
 */
import { createSettingsGroup } from "../settings-layout";
import { Setting } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { renderStartupFiltersSetting } from "./display-startup-filters-menu";
import {
  renderArticleTitleSizeSetting,
  renderCardPressAnimationSetting,
  renderCardSpacingSetting,
  renderCardsPerRowSetting,
  renderClearImageCacheSetting,
  renderDashboardBehaviorSettings,
  renderImageCacheLimitSettings,
  renderImageCachingSettings,
  renderMobileToolbarSettings,
  renderReaderSettings,
  renderShowSummarySetting,
} from "./display-settings-sections";

// Re-export pure helpers from sidebar-settings-tab for backward compatibility
export { moveIconOrder, normalizeHexColor } from "./sidebar-settings-tab";

// ── Tab renderer ──────────────────────────────────────────────────────────────

/**
 * @param onRefresh  Callback that re-renders the full settings panel.
 *                   Needed so the Display tab can call display() without
 *                   holding a reference to the parent class.
 */
export function renderDisplaySettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
  targetSection?: string,
): () => void {
  const persistReaderFormat = async (): Promise<void> => {
    await plugin.saveSettings();
    await plugin.applyReaderFormatToOpenViews();
  };

  const rerenderActiveDashboardView = async (): Promise<void> => {
    const view = await plugin.getActiveDashboardView();
    if (!view) {
      return;
    }

    await plugin.app.workspace.revealLeaf(view.leaf);
    view.render();
  };

  new Setting(containerEl).setName("Dashboard").setHeading();

  const cache = renderImageCachingSettings(
    containerEl,
    plugin,
    onRefresh,
    rerenderActiveDashboardView,
  );
  renderImageCacheLimitSettings(cache, plugin, onRefresh);
  const disposeClearImageCache = renderClearImageCacheSetting(
    cache,
    plugin,
    onRefresh,
  );
  const cards = createSettingsGroup(containerEl);
  renderShowSummarySetting(cards, plugin, rerenderActiveDashboardView);
  renderCardsPerRowSetting(cards, plugin);
  renderCardSpacingSetting(cards, plugin);
  renderArticleTitleSizeSetting(cards, plugin);
  renderCardPressAnimationSetting(cards, plugin);
  const dashboard = createSettingsGroup(containerEl);
  renderDashboardBehaviorSettings(
    dashboard,
    plugin,
    rerenderActiveDashboardView,
  );

  renderStartupFiltersSetting(dashboard, plugin);

  renderReaderSettings(
    createSettingsGroup(containerEl),
    plugin,
    onRefresh,
    targetSection,
    persistReaderFormat,
  );

  containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

  renderMobileToolbarSettings(
    createSettingsGroup(containerEl),
    plugin,
    targetSection,
  );

  containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

  return disposeClearImageCache;
}
