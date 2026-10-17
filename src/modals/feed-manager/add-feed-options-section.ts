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

export function renderAutoDeleteSetting(
  perFeedControlsBody: HTMLElement,
  state: AddFeedOptionsState,
): void {
  const autoDeleteSetting = new Setting(perFeedControlsBody)
    .setName("Auto delete articles duration")
    .setDesc(
      "Days to keep articles before auto-delete. Articles are dated by their publish date, or by the date first seen for undated items when that general setting is on. Articles covered by a retention protection in the general settings are never deleted. This also limits the timeframe window for shown articles.",
    );

  let autoDeleteCustomInput: HTMLInputElement | null = null;

  autoDeleteSetting.addDropdown((dropdown) => {
    dropdown
      .addOption("0", "Disabled")
      .addOption("1", "1 day")
      .addOption("3", "3 days")
      .addOption("7", "1 week")
      .addOption("14", "2 weeks")
      .addOption("30", "1 month")
      .addOption("60", "2 months")
      .addOption("90", "3 months")
      .addOption("180", "6 months")
      .addOption("365", "1 year")
      .addOption("custom", "Custom...")
      .setValue(
        state.getAutoDeleteDuration() === 0
          ? "0"
          : [1, 3, 7, 14, 30, 60, 90, 180, 365].includes(
                state.getAutoDeleteDuration(),
              )
            ? state.getAutoDeleteDuration().toString()
            : "custom",
      )
      .onChange((value) => {
        if (value === "custom") {
          if (!autoDeleteCustomInput) {
            autoDeleteCustomInput = autoDeleteSetting.controlEl.createEl(
              "input",
              {
                type: "number",
                placeholder: "Enter days",
                cls: "rss-custom-input",
              },
            );
            autoDeleteCustomInput.min = "1";
            autoDeleteCustomInput.value =
              state.getAutoDeleteDuration() > 0
                ? state.getAutoDeleteDuration().toString()
                : "";
            autoDeleteCustomInput.addEventListener("change", (evt: Event) => {
              const target = evt.target as HTMLInputElement;
              state.setAutoDeleteDuration(parseInt(target.value) || 0);
            });
          }
          if (autoDeleteCustomInput) {
            autoDeleteCustomInput.removeClass("hidden");
            autoDeleteCustomInput.addClass("visible");
          }
        } else {
          if (autoDeleteCustomInput) {
            autoDeleteCustomInput.removeClass("visible");
            autoDeleteCustomInput.addClass("hidden");
          }
          state.setAutoDeleteDuration(parseInt(value) || 0);
        }
      });
  });
}

export function renderMaxItemsSetting(
  perFeedControlsBody: HTMLElement,
  state: AddFeedOptionsState,
): void {
  const maxItemsSetting = new Setting(perFeedControlsBody)
    .setName("Max items limit")
    .setDesc(
      "Maximum number of items to keep per feed. Articles covered by a retention protection in the general settings are kept and do not count toward the limit.",
    );

  let maxItemsCustomInput: HTMLInputElement | null = null;

  maxItemsSetting.addDropdown((dropdown) => {
    dropdown
      .addOption("0", "Unlimited")
      .addOption("10", "10 items")
      .addOption("25", "25 items")
      .addOption("50", "50 items")
      .addOption("100", "100 items")
      .addOption("200", "200 items")
      .addOption("500", "500 items")
      .addOption("1000", "1000 items")
      .addOption("custom", "Custom...")
      .setValue(
        state.getMaxItemsLimit() === 0
          ? "0"
          : [10, 25, 50, 100, 200, 500, 1000].includes(state.getMaxItemsLimit())
            ? state.getMaxItemsLimit().toString()
            : "custom",
      )
      .onChange((value) => {
        if (value === "custom") {
          if (!maxItemsCustomInput) {
            maxItemsCustomInput = maxItemsSetting.controlEl.createEl("input", {
              type: "number",
              placeholder: "Enter number",
              cls: "rss-custom-input",
            });
            maxItemsCustomInput.min = "1";
            maxItemsCustomInput.addEventListener("change", (evt: Event) => {
              const target = evt.target as HTMLInputElement;
              state.setMaxItemsLimit(parseInt(target.value) || 0);
            });
          }
          if (maxItemsCustomInput) {
            maxItemsCustomInput.removeClass("hidden");
            maxItemsCustomInput.addClass("visible");
          }
        } else {
          if (maxItemsCustomInput) {
            maxItemsCustomInput.removeClass("visible");
            maxItemsCustomInput.addClass("hidden");
          }
          state.setMaxItemsLimit(parseInt(value) || 0);
        }
      });
  });
}

export function renderScanIntervalSetting(
  perFeedControlsBody: HTMLElement,
  state: AddFeedOptionsState,
): void {
  const scanIntervalSetting = new Setting(perFeedControlsBody)
    .setName("Auto-refresh interval")
    .setDesc(
      "How often this feed refreshes automatically, in minutes. Use global setting follows the auto-refresh interval in the general settings, off turns automatic refresh off for this feed, and custom lets you enter a number of minutes. Exclude from refresh, below, overrides this and keeps the feed off.",
    );

  let scanIntervalCustomInput: HTMLInputElement | null = null;

  scanIntervalSetting.addDropdown((dropdown) => {
    dropdown
      .addOption("0", "Use global setting")
      .addOption(String(FEED_REFRESH_DISABLED_INTERVAL), "Off")
      .addOption("5", "5 minutes")
      .addOption("10", "10 minutes")
      .addOption("15", "15 minutes")
      .addOption("30", "30 minutes")
      .addOption("60", "1 hour")
      .addOption("120", "2 hours")
      .addOption("240", "4 hours")
      .addOption("480", "8 hours")
      .addOption("720", "12 hours")
      .addOption("1440", "24 hours")
      .addOption("custom", "Custom...")
      .setValue(getPerFeedRefreshIntervalDropdownValue(state.getScanInterval()))
      .onChange((value) => {
        if (value === "custom") {
          if (!scanIntervalCustomInput) {
            scanIntervalCustomInput = scanIntervalSetting.controlEl.createEl(
              "input",
              {
                type: "number",
                placeholder: "Enter minutes",
                cls: "rss-custom-input",
              },
            );
            scanIntervalCustomInput.min = "1";
            scanIntervalCustomInput.value =
              state.getScanInterval() > 0
                ? state.getScanInterval().toString()
                : "";
            scanIntervalCustomInput.addEventListener("change", (evt: Event) => {
              const target = evt.target as HTMLInputElement;
              state.setScanInterval(parseInt(target.value, 10) || 0);
            });
          }
          if (scanIntervalCustomInput) {
            scanIntervalCustomInput.removeClass("hidden");
            scanIntervalCustomInput.addClass("visible");
          }
        } else {
          if (scanIntervalCustomInput) {
            scanIntervalCustomInput.removeClass("visible");
            scanIntervalCustomInput.addClass("hidden");
          }
          state.setScanInterval(parseInt(value, 10) || 0);
        }
      });
  });
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
): void {
  const autoTagSetting = new Setting(perFeedControlsBody)
    .setName("Custom auto-tags")
    .setDesc(
      "Additional tags applied automatically to every article this feed keeps, on each refresh (single feed override)",
    );

  addTagMultiSelectControl({
    setting: autoTagSetting,
    availableTags,
    selectedTagNames: state.getCustomTags(),
    triggerEmptyLabel: "None",
    menuTitle: "Select auto-tags",
    onChange: (selectedNames) => {
      state.setCustomTags(selectedNames);
    },
  });
}
