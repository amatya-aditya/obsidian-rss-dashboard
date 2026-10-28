/** Focused renderers and helpers for the General settings tab. */
import { Notice, Setting } from "obsidian";
import { normalizeRefreshIntervalMinutes } from "../../utils/validation";
import { isPresetRefreshInterval } from "../../utils/refresh-intervals";
import {
  getPageSizeOptions,
  PAGE_SIZE_OPTIONS,
} from "../../utils/page-size-options";
import {
  ApplyMaxItemsToExistingFeedsModal,
  RetentionChangeConfirmModal,
} from "../modals/settings-modals";
import type { GeneralSettingsPlugin } from "./general-settings-plugin";
import { renderGeneralProxySection } from "./general-settings-proxy-section";

// ── Pure preset helpers (exported for testing) ───────────────────────────────

export const MAX_ITEMS_PRESETS = [0, 10, 25, 50, 100, 200, 500, 1000];
export const AUTO_DELETE_PRESETS = [0, 1, 3, 7, 14, 30, 60, 90, 180, 365];

export function isPresetMaxItems(value: number): boolean {
  return MAX_ITEMS_PRESETS.includes(value);
}

export function isPresetAutoDeleteDuration(value: number): boolean {
  return AUTO_DELETE_PRESETS.includes(value);
}

// ── Section renderers ────────────────────────────────────────────────────────

/** Renders the General tab's sections in order; returns the proxy check disposer. */
export function renderGeneralSettingsSections(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): (() => void) | undefined {
  renderViewSettings(containerEl, plugin);
  renderPageSizeSetting(containerEl, plugin);
  renderGlobalFeedsSettings(containerEl, plugin);
  renderDataRetentionSettings(containerEl, plugin);
  return renderGeneralProxySection(containerEl, plugin);
}

function renderViewSettings(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Keyboard shortcuts")
    .setDesc("Open the reference of the plugin's keyboard shortcuts")
    .addButton((button) =>
      button.setButtonText("View").onClick(() => plugin.openShortcutHelp()),
    );

  new Setting(containerEl)
    .setName("View style")
    .setDesc("Choose between list, card, and feed view for articles")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("list", "List view")
        .addOption("card", "Card view")
        .addOption("feed", "Feed view")
        .setValue(plugin.settings.viewStyle)
        .onChange(async (value: string) => {
          plugin.settings.viewStyle = value as "list" | "card" | "feed";
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  new Setting(containerEl)
    .setName("Dashboard view location")
    .setDesc("Choose where to open the RSS dashboard")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("main", "Main view")
        .addOption("right-sidebar", "Right sidebar")
        .addOption("left-sidebar", "Left sidebar")
        .setValue(plugin.settings.viewLocation)
        .onChange(async (value: string) => {
          plugin.settings.viewLocation =
            value as import("../../types/types").ViewLocation;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Reader view location")
    .setDesc("Choose where to open articles/media when clicked")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("main", "Main view (split)")
        .addOption("right-sidebar", "Right sidebar")
        .addOption("left-sidebar", "Left sidebar")
        .addOption("inline", "Inline (inside dashboard)")
        .setValue(plugin.settings.readerViewLocation || "main")
        .onChange(async (value: string) => {
          plugin.settings.readerViewLocation =
            value as import("../../types/types").ViewLocation;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Saved article open location")
    .setDesc("Choose where to open saved article files")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("main", "Main view (split)")
        .addOption("right-sidebar", "Right sidebar")
        .addOption("left-sidebar", "Left sidebar")
        .addOption("inline", "Inline (inside dashboard)")
        .setValue(plugin.settings.savedArticleOpenLocation || "main")
        .onChange(async (value: string) => {
          plugin.settings.savedArticleOpenLocation =
            value as import("../../types/types").ViewLocation;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Use web viewer")
    .setDesc("Use web viewer core plugin for articles when available")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.useWebViewer || false)
        .onChange(async (value) => {
          plugin.settings.useWebViewer = value;
          await plugin.saveSettings();
        }),
    );
}

function renderPageSizeSetting(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Results shown per page")
    .setDesc(
      "Number of articles shown per page across all dashboard views. All shows every article on one page. Mixed appears when the views have different sizes from an earlier version; choosing a size sets them all to it.",
    )
    .addDropdown((dropdown) => {
      const pageSizes = [
        plugin.settings.allArticlesPageSize,
        plugin.settings.unreadArticlesPageSize,
        plugin.settings.readArticlesPageSize,
        plugin.settings.savedArticlesPageSize,
        plugin.settings.starredArticlesPageSize,
      ];
      const uniqueSizes = new Set(pageSizes);
      const isMixed = uniqueSizes.size > 1;

      if (isMixed) {
        dropdown.addOption("mixed", "Mixed (previous per-view values)");
      }

      const options = getPageSizeOptions(plugin.settings.allArticlesPageSize);
      for (const size of options) {
        const label =
          size === 0
            ? "All"
            : PAGE_SIZE_OPTIONS.includes(
                  size as (typeof PAGE_SIZE_OPTIONS)[number],
                )
              ? String(size)
              : `Current (${size})`;
        dropdown.addOption(String(size), label);
      }

      dropdown.setValue(
        isMixed ? "mixed" : String(plugin.settings.allArticlesPageSize),
      );

      dropdown.onChange(async (value) => {
        if (value === "mixed") {
          return;
        }
        const size = Number(value);
        if (!Number.isFinite(size) || size < 0) {
          return;
        }

        plugin.settings.allArticlesPageSize = size;
        plugin.settings.unreadArticlesPageSize = size;
        plugin.settings.readArticlesPageSize = size;
        plugin.settings.savedArticlesPageSize = size;
        plugin.settings.starredArticlesPageSize = size;

        await plugin.saveSettings();
        const view = await plugin.getActiveDashboardView();
        if (view) {
          await plugin.app.workspace.revealLeaf(view.leaf);
          view.render();
        }
      });
    });
}

function renderGlobalFeedsSettings(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  new Setting(containerEl).setName("Global feeds").setHeading();

  renderRefreshIntervalSetting(containerEl, plugin);
  renderStartupDelaySetting(containerEl, plugin);
  renderMaxItemsSetting(containerEl, plugin);
}

// ── Refresh interval ──────────────────────────────────────────────────────

function renderRefreshIntervalSetting(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  const refreshIntervalSetting = new Setting(containerEl)
    .setName("Auto-refresh interval")
    .setDesc(
      "How often to refresh all feeds automatically, in minutes. Off by default. A feed can override this in its edit dialog. On mobile, an interval under 60 minutes is raised to 60 when the plugin loads.",
    );

  let refreshInterval = plugin.settings.refreshInterval;
  let refreshIntervalCustomInput: HTMLInputElement | null = null;

  refreshIntervalSetting.addDropdown((dropdown) => {
    dropdown
      .addOption("0", "Off")
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
      .setValue(
        isPresetRefreshInterval(refreshInterval)
          ? refreshInterval.toString()
          : "custom",
      )
      .onChange((value) => {
        if (value === "custom") {
          if (!refreshIntervalCustomInput) {
            refreshIntervalCustomInput =
              refreshIntervalSetting.controlEl.createEl("input", {
                type: "number",
                placeholder: "Enter minutes",
                cls: "rss-custom-input",
              });
            refreshIntervalCustomInput.min = "0";
            refreshIntervalCustomInput.value =
              refreshInterval > 0 ? refreshInterval.toString() : "";
            refreshIntervalCustomInput.addEventListener("change", () => {
              void (async () => {
                const parsed = parseInt(
                  refreshIntervalCustomInput?.value || "",
                  10,
                );
                refreshInterval = normalizeRefreshIntervalMinutes(
                  Number.isFinite(parsed) ? parsed : 0,
                );
                if (refreshIntervalCustomInput) {
                  refreshIntervalCustomInput.value = refreshInterval.toString();
                }
                plugin.settings.refreshInterval = refreshInterval;
                await plugin.saveSettings();
              })();
            });
          }
          refreshIntervalCustomInput.removeClass("hidden");
          refreshIntervalCustomInput.addClass("visible");
          return;
        }

        refreshIntervalCustomInput?.removeClass("visible");
        refreshIntervalCustomInput?.addClass("hidden");
        refreshInterval = normalizeRefreshIntervalMinutes(parseInt(value, 10));
        void (async () => {
          plugin.settings.refreshInterval = refreshInterval;
          await plugin.saveSettings();
        })();
      });
  });
}

function renderStartupDelaySetting(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Startup refresh delay")
    .setDesc(
      "Delay before the first refresh after Obsidian opens, in seconds. The default is 5. A value that is not a number of zero or more is ignored.",
    )
    .addText((text) =>
      text
        .setValue(String(plugin.settings.startupRefreshDelaySeconds))
        .onChange(async (value) => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 0) return;
          plugin.settings.startupRefreshDelaySeconds = Math.floor(parsed);
          await plugin.saveSettings();
        }),
    );
}

// ── Max items ─────────────────────────────────────────────────────────────

function renderMaxItemsSetting(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  let maxItemsPromptTimer: number | null = null;
  let maxItemsPromptOpen = false;
  let pendingMaxItemsChange: { oldValue: number; newValue: number } | null =
    null;

  const queueMaxItemsApplyPrompt = (oldValue: number, newValue: number) => {
    pendingMaxItemsChange = { oldValue, newValue };
    if (maxItemsPromptOpen) return;
    if (maxItemsPromptTimer) {
      window.clearTimeout(maxItemsPromptTimer);
    }
    maxItemsPromptTimer = window.setTimeout(() => {
      maxItemsPromptTimer = null;
      if (maxItemsPromptOpen) return;
      const change = pendingMaxItemsChange;
      pendingMaxItemsChange = null;
      if (!change || change.newValue === change.oldValue) return;

      maxItemsPromptOpen = true;
      void (async () => {
        const modal = new ApplyMaxItemsToExistingFeedsModal(plugin.app, {
          newLimit: change.newValue,
          increased: change.newValue > change.oldValue,
        });
        modal.open();
        const action = await modal.waitForClose();
        maxItemsPromptOpen = false;

        if (action === "cancel") return;

        for (const feed of plugin.settings.feeds) {
          feed.maxItemsLimit = change.newValue;
        }

        await plugin.applyFeedLimitsToAllFeeds();

        if (action === "apply-refresh") {
          await plugin.refreshFeeds();
        } else if (change.newValue > change.oldValue) {
          new Notice(
            "Max item limit applied to all feeds. Refresh all feeds to fetch additional items.",
          );
        }
      })();
    }, 700);
  };

  const applyMaxItemsValue = (nextValue: number) => {
    void (async () => {
      const oldValue = plugin.settings.maxItems;
      if (oldValue === nextValue) return;

      plugin.settings.maxItems = nextValue;
      await plugin.saveSettings();
      const view = await plugin.getActiveDashboardView();
      if (view) {
        await plugin.app.workspace.revealLeaf(view.leaf);
        view.render();
      }

      queueMaxItemsApplyPrompt(oldValue, nextValue);
    })();
  };

  const maxItemsSetting = new Setting(containerEl)
    .setName("Max item limit")
    .setDesc(
      "Most articles to keep per feed, counted in items. Used for new feeds and as the fallback for feeds without their own limit. The default is 50, and the unlimited option means no limit. Protected articles do not count against it. On mobile, a limit above 50 is lowered to 50 when the plugin loads.",
    );

  let maxItemsLimit = plugin.settings.maxItems;
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
        isPresetMaxItems(maxItemsLimit) ? maxItemsLimit.toString() : "custom",
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
            maxItemsCustomInput.value =
              maxItemsLimit > 0 ? maxItemsLimit.toString() : "";
            maxItemsCustomInput.addEventListener("change", () => {
              const parsed = parseInt(maxItemsCustomInput?.value || "", 10);
              maxItemsLimit = Number.isFinite(parsed) ? parsed : 0;
              applyMaxItemsValue(maxItemsLimit);
            });
          }
          maxItemsCustomInput.removeClass("hidden");
          maxItemsCustomInput.addClass("visible");
          return;
        }

        maxItemsCustomInput?.removeClass("visible");
        maxItemsCustomInput?.addClass("hidden");
        maxItemsLimit = parseInt(value, 10) || 0;
        applyMaxItemsValue(maxItemsLimit);
      });
  });
}

// ── Data retention ────────────────────────────────────────────────────────

function renderDataRetentionSettings(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  new Setting(containerEl).setName("Data retention").setHeading();

  renderAutoDeleteDurationSetting(containerEl, plugin);
  renderRetentionProtectionSettings(containerEl, plugin);
  renderFirstSeenDateSetting(containerEl, plugin);
}

function confirmRetentionChange(
  plugin: GeneralSettingsPlugin,
  applyChange: () => void,
  revertControl: () => void,
) {
  void (async () => {
    const modal = new RetentionChangeConfirmModal(plugin.app);
    const actionPromise = modal.waitForClose();
    modal.open();
    const action = await actionPromise;

    if (action === "cancel") {
      revertControl();
      return;
    }

    applyChange();
    await plugin.saveSettings();

    if (action === "apply-now") {
      await plugin.applyFeedLimitsToAllFeeds();
    }
  })();
}

function updateRetentionProtection(
  plugin: GeneralSettingsPlugin,
  key: "protectStarred" | "protectSaved" | "protectTagged" | "protectUnread",
  nextValue: boolean,
  revertControl: () => void,
) {
  const previousValue = plugin.settings[key];
  if (previousValue === nextValue) return;

  const applyChange = () => {
    plugin.settings[key] = nextValue;
  };

  if (previousValue && !nextValue) {
    confirmRetentionChange(plugin, applyChange, revertControl);
    return;
  }

  void (async () => {
    applyChange();
    await plugin.saveSettings();
  })();
}

// ── Auto-delete duration ──────────────────────────────────────────────────

function renderAutoDeleteDurationSetting(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  const defaultAutoDeleteSetting = new Setting(containerEl)
    .setName("Default auto delete duration (new feeds)")
    .setDesc(
      "Days to keep articles before auto-delete, for new feeds. The default is 30, and a feed can override it. Auto-delete removes every article older than this cutoff, read or unread, unless a retention protection below applies. This also limits the timeframe window for shown articles.",
    );

  let defaultDuration = plugin.settings.defaultAutoDeleteDuration;
  let autoDeleteCustomInput: HTMLInputElement | null = null;

  const updateDefaultAutoDeleteDuration = (
    nextDuration: number,
    revertControl: () => void,
  ) => {
    const previousDuration = defaultDuration;
    if (previousDuration === nextDuration) return;

    const applyChange = () => {
      defaultDuration = nextDuration;
      plugin.settings.defaultAutoDeleteDuration = nextDuration;
    };
    const isDestructive =
      nextDuration > 0 &&
      (previousDuration === 0 || nextDuration < previousDuration);

    if (isDestructive) {
      confirmRetentionChange(plugin, applyChange, revertControl);
      return;
    }

    void (async () => {
      applyChange();
      await plugin.saveSettings();
    })();
  };

  defaultAutoDeleteSetting.addDropdown((dropdown) => {
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
        isPresetAutoDeleteDuration(defaultDuration)
          ? defaultDuration.toString()
          : "custom",
      )
      .onChange((value) => {
        if (value === "custom") {
          if (!autoDeleteCustomInput) {
            autoDeleteCustomInput = defaultAutoDeleteSetting.controlEl.createEl(
              "input",
              {
                type: "number",
                placeholder: "Enter days",
                cls: "rss-custom-input",
              },
            );
            autoDeleteCustomInput.min = "1";
            autoDeleteCustomInput.value =
              defaultDuration > 0 ? defaultDuration.toString() : "";
            autoDeleteCustomInput.addEventListener("change", () => {
              const parsed = parseInt(autoDeleteCustomInput?.value || "", 10);
              const nextDuration = Number.isFinite(parsed) ? parsed : 0;
              updateDefaultAutoDeleteDuration(nextDuration, () => {
                if (autoDeleteCustomInput) {
                  autoDeleteCustomInput.value =
                    defaultDuration > 0 ? defaultDuration.toString() : "";
                }
              });
            });
          }

          autoDeleteCustomInput.removeClass("hidden");
          autoDeleteCustomInput.addClass("visible");
          return;
        }

        autoDeleteCustomInput?.removeClass("visible");
        autoDeleteCustomInput?.addClass("hidden");
        const nextDuration = parseInt(value, 10) || 0;
        updateDefaultAutoDeleteDuration(nextDuration, () => {
          dropdown.setValue(
            isPresetAutoDeleteDuration(defaultDuration)
              ? defaultDuration.toString()
              : "custom",
          );
        });
      });
  });
}

function renderRetentionProtectionSettings(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  new Setting(containerEl).setName("Protected from auto-deletion").setHeading();

  new Setting(containerEl)
    .setName("Protect starred articles")
    .setDesc("Keep starred articles when retention limits are applied")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.protectStarred)
        .onChange(async (value) => {
          updateRetentionProtection(plugin, "protectStarred", value, () => {
            toggle.setValue(plugin.settings.protectStarred);
          });
        }),
    );

  new Setting(containerEl)
    .setName("Protect saved articles")
    .setDesc(
      "Keep articles saved to your vault when retention limits are applied",
    )
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.protectSaved).onChange(async (value) => {
        updateRetentionProtection(plugin, "protectSaved", value, () => {
          toggle.setValue(plugin.settings.protectSaved);
        });
      }),
    );

  new Setting(containerEl)
    .setName("Protect tagged articles")
    .setDesc(
      "Keep articles that have at least one tag when retention limits are applied",
    )
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.protectTagged).onChange(async (value) => {
        updateRetentionProtection(plugin, "protectTagged", value, () => {
          toggle.setValue(plugin.settings.protectTagged);
        });
      }),
    );

  new Setting(containerEl)
    .setName("Protect unread articles")
    .setDesc("Keep unread articles when retention limits are applied")
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.protectUnread).onChange(async (value) => {
        updateRetentionProtection(plugin, "protectUnread", value, () => {
          toggle.setValue(plugin.settings.protectUnread);
        });
      }),
    );
}

function renderFirstSeenDateSetting(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Use first-seen date for undated items")
    .setDesc(
      "When an article has no publish date (common with some proxied feeds), use the date it was first seen instead of hiding it from sorting and auto-delete. Off by default. Display and filters follow the setting right away; auto-delete uses it on the next feed refresh.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.useFirstSeenDateFallback)
        .onChange(async (value) => {
          plugin.settings.useFirstSeenDateFallback = value;
          await plugin.saveSettings();
        }),
    );
}
