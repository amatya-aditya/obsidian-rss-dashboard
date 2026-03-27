/**
 * Rules Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderRulesSettingsTab(containerEl, plugin, onRefresh)
 */
import { Setting } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { renderKeywordFilterEditor } from "../../components/keyword-filter-editor";

export function renderRulesSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
): void {
  new Setting(containerEl).setName("Keyword rules").setHeading();
  containerEl.createEl("p", {
    cls: "rss-dashboard-settings-description",
    text: "Create global include/exclude keyword rules. Rules are case-insensitive, and per-feed settings can optionally override these global rules.",
  });

  if (!plugin.settings.keywordRules) {
    plugin.settings.keywordRules = {
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
      includeLogic: plugin.settings.keywordRules.includeLogic,
      rules: plugin.settings.keywordRules.rules,
    },
    onChange: (nextState) => {
      plugin.settings.keywordRules.includeLogic = nextState.includeLogic;
      plugin.settings.keywordRules.rules = nextState.rules;
      void (async () => {
        await plugin.saveSettings();
        plugin.notifyFiltersUpdated({
          source: "settings-rules-tab",
          timestamp: Date.now(),
        });
      })();
      onRefresh();
    },
  });
}
