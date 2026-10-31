/**
 * Highlights Settings Tab renderer.
 *
 * The tab entry point stays here while its renderers live in
 * highlights-settings-sections.ts.
 * Exports:
 *   - renderHighlightsSettingsTab(containerEl, plugin, onRefresh)
 *   - isHighlightWordDuplicate(words, text, excludeIndex?)  — testable pure helper
 *   - buildDefaultHighlights()                              — testable pure helper
 */
import RssDashboardPlugin from "../../../main";
import {
  buildDefaultHighlights,
  isHighlightWordDuplicate,
  renderHighlightsSettingsSections,
} from "./highlights-settings-sections";

export { buildDefaultHighlights, isHighlightWordDuplicate };

// ── Tab renderer ──────────────────────────────────────────────────────────────

export function renderHighlightsSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
): void {
  renderHighlightsSettingsSections(containerEl, plugin, onRefresh);
}
