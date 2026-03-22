/**
 * Filters Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderFiltersSettingsTab(containerEl, plugin, onRefresh)
 */
import { Setting } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { renderKeywordFilterEditor } from "../../components/keyword-filter-editor";

export function renderFiltersSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
): void {
  new Setting(containerEl).setName("Keyword filters").setHeading();
  containerEl.createEl("p", {
    cls: "rss-dashboard-settings-description",
    text: "Create global include/exclude keyword rules. Rules are case-insensitive, and per-feed settings can optionally override these global rules.",
  });

  if (!plugin.settings.filters) {
    plugin.settings.filters = {
      includeLogic: "AND",
      bypassAll: false,
      rules: [],
    };
  }

  const editorContainer = containerEl.createDiv({
    cls: "rss-keyword-filter-editor",
  });

  renderKeywordFilterEditor({
    containerEl: editorContainer,
    state: {
      includeLogic: plugin.settings.filters.includeLogic,
      rules: plugin.settings.filters.rules,
    },
    onChange: (nextState) => {
      plugin.settings.filters.includeLogic = nextState.includeLogic;
      plugin.settings.filters.rules = nextState.rules;
      void (async () => {
        await plugin.saveSettings();
        plugin.notifyFiltersUpdated({
          source: "settings-filters-tab",
          timestamp: Date.now(),
        });
      })();
      onRefresh();
    },
  });
}
