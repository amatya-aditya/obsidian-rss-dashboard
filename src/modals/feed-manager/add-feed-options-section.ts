import { Setting } from "obsidian";
import type { FeedEncoding, SavedTemplate, Tag } from "../../types/types";
import {
  FEED_REFRESH_DISABLED_INTERVAL,
  getPerFeedRefreshIntervalDropdownValue,
} from "../../utils/refresh-intervals";
import { addTagMultiSelectControl } from "../../components/tag-multi-select-control";

/**
 * Read/write access to the per-feed option state AddFeedModal owns. The modal
 * keeps the fields; the section renderers read and write them through here so
 * the values the Save button submits stay in one place.
 */
export interface AddFeedOptionsState {
  getFeedEncoding(): FeedEncoding;
  setFeedEncoding(value: FeedEncoding): void;
  getAutoDeleteDuration(): number;
  setAutoDeleteDuration(value: number): void;
  getMaxItemsLimit(): number;
  setMaxItemsLimit(value: number): void;
  getScanInterval(): number;
  setScanInterval(value: number): void;
  setExcludeFromRefresh(value: boolean): void;
  getExcludeFromRefresh(): boolean;
  getCustomTemplate(): string;
  setCustomTemplate(value: string): void;
  setCustomTags(value: string[]): void;
  getCustomTags(): string[];
}

export function renderFeedEncodingSetting(
  perFeedControlsBody: HTMLElement,
  state: AddFeedOptionsState,
): void {
  new Setting(perFeedControlsBody)
    .setName("Feed encoding")
    .setDesc(
      "Use automatic detection unless this RSS or atom feed must be decoded as windows-1251.",
    )
    .addDropdown((dropdown) => {
      dropdown
        .addOption("auto", "Auto-detect")
        .addOption("windows-1251", "Windows-1251")
        .setValue(state.getFeedEncoding())
        .onChange((value) => {
          if (value === "auto" || value === "windows-1251") {
            state.setFeedEncoding(value);
          }
        });
    });
}

interface PresetOrCustomConfig {
  options: Array<[value: string, label: string]>;
  initialDropdownValue: string;
  placeholder: string;
  get(): number;
  set(value: number): void;
}

/** Custom entries are whole numbers of at least 0; anything else counts as 0. */
function parseCustomValue(raw: string): number {
  return Math.max(0, parseInt(raw, 10) || 0);
}

/**
 * A preset dropdown with a "Custom..." entry that reveals a number input. The
 * input is created on first need, prefilled from the current value, and shown
 * from the start when the current value is not one of the presets.
 */
function renderPresetOrCustomDropdown(
  setting: Setting,
  config: PresetOrCustomConfig,
): void {
  let customInput: HTMLInputElement | null = null;

  const setCustomInputVisible = (visible: boolean) => {
    if (visible && !customInput) {
      customInput = setting.controlEl.createEl("input", {
        type: "number",
        placeholder: config.placeholder,
        cls: "rss-custom-input",
      });
      customInput.min = "1";
      customInput.value = config.get() > 0 ? config.get().toString() : "";
      customInput.addEventListener("change", (evt: Event) => {
        const target = evt.target as HTMLInputElement;
        config.set(parseCustomValue(target.value));
      });
    }
    if (customInput) {
      customInput.toggleClass("visible", visible);
      customInput.toggleClass("hidden", !visible);
    }
  };

  setting.addDropdown((dropdown) => {
    for (const [value, label] of config.options) {
      dropdown.addOption(value, label);
    }
    dropdown
      .addOption("custom", "Custom...")
      .setValue(config.initialDropdownValue)
      .onChange((value) => {
        if (value === "custom") {
          setCustomInputVisible(true);
        } else {
          setCustomInputVisible(false);
          config.set(parseInt(value, 10) || 0);
        }
      });
  });
  setCustomInputVisible(config.initialDropdownValue === "custom");
}

function presetOrCustomDropdownValue(value: number, presets: number[]): string {
  if (value === 0) return "0";
  return presets.includes(value) ? value.toString() : "custom";
}

export function renderAutoDeleteSetting(
  perFeedControlsBody: HTMLElement,
  state: Pick<
    AddFeedOptionsState,
    "getAutoDeleteDuration" | "setAutoDeleteDuration"
  >,
): Setting {
  const setting = new Setting(perFeedControlsBody)
    .setName("Auto delete articles duration")
    .setDesc(
      "Days to keep articles before auto-delete. Articles are dated by their publish date, or by the date first seen for undated items when that general setting is on. Articles covered by a retention protection in the general settings are never deleted. This also limits the timeframe window for shown articles.",
    );
  renderPresetOrCustomDropdown(setting, {
    options: [
      ["0", "Disabled"],
      ["1", "1 day"],
      ["3", "3 days"],
      ["7", "1 week"],
      ["14", "2 weeks"],
      ["30", "1 month"],
      ["60", "2 months"],
      ["90", "3 months"],
      ["180", "6 months"],
      ["365", "1 year"],
    ],
    initialDropdownValue: presetOrCustomDropdownValue(
      state.getAutoDeleteDuration(),
      [1, 3, 7, 14, 30, 60, 90, 180, 365],
    ),
    placeholder: "Enter days",
    get: () => state.getAutoDeleteDuration(),
    set: (value) => state.setAutoDeleteDuration(value),
  });
  return setting;
}

export function renderMaxItemsSetting(
  perFeedControlsBody: HTMLElement,
  state: Pick<AddFeedOptionsState, "getMaxItemsLimit" | "setMaxItemsLimit">,
): Setting {
  const setting = new Setting(perFeedControlsBody)
    .setName("Max items limit")
    .setDesc(
      "Maximum number of items to keep per feed. Articles covered by a retention protection in the general settings are kept and do not count toward the limit.",
    );
  renderPresetOrCustomDropdown(setting, {
    options: [
      ["0", "Unlimited"],
      ["10", "10 items"],
      ["25", "25 items"],
      ["50", "50 items"],
      ["100", "100 items"],
      ["200", "200 items"],
      ["500", "500 items"],
      ["1000", "1000 items"],
    ],
    initialDropdownValue: presetOrCustomDropdownValue(
      state.getMaxItemsLimit(),
      [10, 25, 50, 100, 200, 500, 1000],
    ),
    placeholder: "Enter number",
    get: () => state.getMaxItemsLimit(),
    set: (value) => state.setMaxItemsLimit(value),
  });
  return setting;
}

export function renderScanIntervalSetting(
  perFeedControlsBody: HTMLElement,
  state: Pick<AddFeedOptionsState, "getScanInterval" | "setScanInterval">,
): Setting {
  const setting = new Setting(perFeedControlsBody)
    .setName("Auto-refresh interval")
    .setDesc(
      "How often this feed refreshes automatically, in minutes. Use global setting follows the auto-refresh interval in the general settings, off turns automatic refresh off for this feed, and custom lets you enter a number of minutes. Exclude from refresh, below, overrides this and keeps the feed off.",
    );
  renderPresetOrCustomDropdown(setting, {
    options: [
      ["0", "Use global setting"],
      [String(FEED_REFRESH_DISABLED_INTERVAL), "Off"],
      ["5", "5 minutes"],
      ["10", "10 minutes"],
      ["15", "15 minutes"],
      ["30", "30 minutes"],
      ["60", "1 hour"],
      ["120", "2 hours"],
      ["240", "4 hours"],
      ["480", "8 hours"],
      ["720", "12 hours"],
      ["1440", "24 hours"],
    ],
    initialDropdownValue: getPerFeedRefreshIntervalDropdownValue(
      state.getScanInterval(),
    ),
    placeholder: "Enter minutes",
    get: () => state.getScanInterval(),
    set: (value) => state.setScanInterval(value),
  });
  return setting;
}

export function renderExcludeFromRefreshSetting(
  perFeedControlsBody: HTMLElement,
  state: AddFeedOptionsState,
): void {
  new Setting(perFeedControlsBody)
    .setName("Exclude from refresh")
    .setDesc(
      "Skip this feed during automatic refresh and bulk refresh actions. You can still refresh it directly from its feed view.",
    )
    .addToggle((toggle) => {
      toggle.setValue(state.getExcludeFromRefresh()).onChange((value) => {
        state.setExcludeFromRefresh(value);
      });
    });
}

export function renderArticleTemplateSetting(
  perFeedControlsBody: HTMLElement,
  state: AddFeedOptionsState,
  savedTemplates: SavedTemplate[],
): void {
  new Setting(perFeedControlsBody)
    .setName("Article template")
    .setDesc(
      "This feed's template takes precedence over the global default for its saved articles.",
    )
    .addDropdown((dropdown) => {
      dropdown.addOption("", "Use global default template");
      savedTemplates.forEach((template: SavedTemplate) => {
        dropdown.addOption(template.id, template.name);
      });
      dropdown.setValue(state.getCustomTemplate());
      dropdown.onChange((value) => {
        state.setCustomTemplate(value);
      });
    });
}

export function renderAutoTagsSetting(
  perFeedControlsBody: HTMLElement,
  state: AddFeedOptionsState,
  availableTags: Tag[],
  tagAppearanceSettings?: import("../../utils/tag-colors").TagAppearanceSettings,
): void {
  const autoTagSetting = new Setting(perFeedControlsBody)
    .setName("Custom auto-tags")
    .setDesc(
      "Additional tags applied automatically to every article this feed keeps, on each refresh (single feed override)",
    );

  addTagMultiSelectControl({
    setting: autoTagSetting,
    availableTags,
    tagAppearanceSettings,
    selectedTagNames: state.getCustomTags(),
    triggerEmptyLabel: "None",
    menuTitle: "Select auto-tags",
    onChange: (selectedNames) => {
      state.setCustomTags(selectedNames);
    },
  });
}
