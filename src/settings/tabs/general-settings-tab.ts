/**
 * General Settings Tab renderer.
 *
 * The tab entry point stays here while its section renderers live in
 * general-settings-sections.ts and general-settings-proxy-section.ts.
 * Exports:
 *   - renderGeneralSettingsTab(containerEl, plugin) — main render function
 *   - GeneralSettingsPlugin                              — the plugin surface the tab uses
 *   - REFRESH_INTERVAL_PRESETS, isPresetRefreshInterval  — testable helpers
 *   - MAX_ITEMS_PRESETS, isPresetMaxItems                — testable helpers
 *   - AUTO_DELETE_PRESETS, isPresetAutoDeleteDuration    — testable helpers
 */
import type { GeneralSettingsPlugin } from "./general-settings-plugin";
import {
  AUTO_DELETE_PRESETS,
  isPresetAutoDeleteDuration,
  isPresetMaxItems,
  MAX_ITEMS_PRESETS,
  renderGeneralSettingsSections,
} from "./general-settings-sections";
export {
  REFRESH_INTERVAL_PRESETS,
  isPresetRefreshInterval,
} from "../../utils/refresh-intervals";

export type { GeneralSettingsPlugin };
export {
  AUTO_DELETE_PRESETS,
  isPresetAutoDeleteDuration,
  isPresetMaxItems,
  MAX_ITEMS_PRESETS,
};

// ── Tab renderer ─────────────────────────────────────────────────────────────

export function renderGeneralSettingsTab(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): (() => void) | undefined {
  return renderGeneralSettingsSections(containerEl, plugin);
}
