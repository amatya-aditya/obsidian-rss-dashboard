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
  containerEl.createEl("p", {
    cls: "rss-dashboard-settings-description",
    text: "Each rule can search four fields: title (the article title), preview (the preview text shown on cards and in the feed view, even when summaries are hidden), content (the article body, or the feed description when there is none), and URL (the article link). Partial matches the keyword anywhere in a field. Exact matches it only as a whole word.",
  });
  containerEl.createEl("p", {
    cls: "rss-dashboard-settings-description",
    text: "The bypass keyword rules option in the dashboard filter menu turns off all keyword rules at once, including per-feed rules.",
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
