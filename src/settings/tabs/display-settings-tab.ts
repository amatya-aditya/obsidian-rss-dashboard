/**
 * Display Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderDisplaySettingsTab(containerEl, plugin, onRefresh) — main render fn
 */
import { Setting } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { renderStartupFiltersSetting } from "./display-startup-filters-menu";
import {
  renderArticleTitleSizeSetting,
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
  const rerenderActiveReaderView = async (): Promise<void> => {
    const readerView = await plugin.getActiveReaderView?.();
    if (!readerView) {
      return;
    }

    try {
      const viewState = readerView as unknown as {
        applyReaderFormat?: () => void;
      };
      viewState.applyReaderFormat?.();
    } catch {
      // Best-effort refresh for settings-driven format changes.
    }
  };

  const persistReaderFormat = async (): Promise<void> => {
    await plugin.saveSettings();
    await rerenderActiveReaderView();
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

  renderImageCachingSettings(
    containerEl,
    plugin,
    onRefresh,
    rerenderActiveDashboardView,
  );
  renderImageCacheLimitSettings(containerEl, plugin, onRefresh);
  const disposeClearImageCache = renderClearImageCacheSetting(
    containerEl,
    plugin,
    onRefresh,
  );
  renderShowSummarySetting(containerEl, plugin, rerenderActiveDashboardView);
  renderCardsPerRowSetting(containerEl, plugin);
  renderCardSpacingSetting(containerEl, plugin);
  renderArticleTitleSizeSetting(containerEl, plugin);
  renderDashboardBehaviorSettings(
    containerEl,
    plugin,
    rerenderActiveDashboardView,
  );

  renderStartupFiltersSetting(containerEl, plugin);

  renderReaderSettings(
    containerEl,
    plugin,
    onRefresh,
    targetSection,
    persistReaderFormat,
  );

  containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

  renderMobileToolbarSettings(containerEl, plugin, targetSection);

  containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

  return disposeClearImageCache;
}
