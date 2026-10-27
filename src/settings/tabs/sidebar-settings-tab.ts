/**
 * Sidebar Settings Tab renderer.
 *
 * Extracted from display-settings-tab.ts. The tab entry point stays here while
 * its renderers live in a focused module.
 * Exports:
 *   - renderSidebarSettingsTab(containerEl, plugin, onRefresh, targetSection) — main render fn
 *   - moveIconOrder(order, fromId, toId, insertAfter)  — testable pure helper
 *   - normalizeHexColor(value)                         — testable pure helper
 */
import RssDashboardPlugin from "../../../main";
import {
  moveIconOrder,
  normalizeHexColor,
  renderSidebarSettingsSections,
} from "./sidebar-settings-sections";

export { moveIconOrder, normalizeHexColor };

// ── Tab renderer ──────────────────────────────────────────────────────────────

/**
 * @param onRefresh  Callback that re-renders the full settings panel.
 *                   Needed so the Sidebar tab can call display() without
 *                   holding a reference to the parent class.
 */
export function renderSidebarSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
  targetSection?: string,
): void {
  renderSidebarSettingsSections(containerEl, plugin, onRefresh, targetSection);
}
