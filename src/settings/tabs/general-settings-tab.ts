/**
 * General Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderGeneralSettingsTab(containerEl, plugin) — main render function
 *   - REFRESH_INTERVAL_PRESETS, isPresetRefreshInterval  — testable helpers
 *   - MAX_ITEMS_PRESETS, isPresetMaxItems                — testable helpers
 *   - AUTO_DELETE_PRESETS, isPresetAutoDeleteDuration    — testable helpers
 */
import { App, Notice, Platform, Setting, WorkspaceLeaf } from "obsidian";
import { robustFetchDetailed, setCssProps } from "../../utils/platform-utils";
import { addInputClearButton } from "../../utils/input-clear-button";
import {
  isValidUrl,
  normalizeRefreshIntervalMinutes,
} from "../../utils/validation";
import { isPresetRefreshInterval } from "../../utils/refresh-intervals";
import { pageRequestHeaders } from "../../utils/request-headers";
import { RSS_READER_VIEW_TYPE } from "../../views/reader-view";
import { renderProxyCheckControls } from "../proxy-check-controls";
export {
  REFRESH_INTERVAL_PRESETS,
  isPresetRefreshInterval,
} from "../../utils/refresh-intervals";
import {
  getPageSizeOptions,
  PAGE_SIZE_OPTIONS,
} from "../../utils/page-size-options";
import {
  ApplyMaxItemsToExistingFeedsModal,
  RetentionChangeConfirmModal,
} from "../modals/settings-modals";
import type { ImportResult } from "../../services/import-export-service";
import type { RssDashboardSettings } from "../../types/types";
import type { ProxyCheckStore } from "../../utils/proxy-check";
import { CUSTOM_PROXY_OPTION } from "../../utils/proxy-check";
import { AUTO_PROXY_URL, PREDEFINED_PROXIES } from "../../utils/proxy-utils";

export interface GeneralSettingsPlugin {
  app: App;
  settingTab: { display(): void } | null;
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
  } | null>;
  importPortableDataBundleFromFile(file: File): Promise<ImportResult>;
  exportPortableDataBundle(): Promise<void>;
  applyFeedLimitsToAllFeeds(): Promise<void>;
  refreshFeeds(): Promise<void>;
  openShortcutHelp(): void;
  /** Session-only holder for the last proxy check (#1298); never persisted. */
  proxyCheckStore: ProxyCheckStore;
}

// ── Pure preset helpers (exported for testing) ───────────────────────────────

export const MAX_ITEMS_PRESETS = [0, 10, 25, 50, 100, 200, 500, 1000];
export const AUTO_DELETE_PRESETS = [0, 1, 3, 7, 14, 30, 60, 90, 180, 365];

export function isPresetMaxItems(value: number): boolean {
  return MAX_ITEMS_PRESETS.includes(value);
}

export function isPresetAutoDeleteDuration(value: number): boolean {
  return AUTO_DELETE_PRESETS.includes(value);
}

// ── Tab renderer ─────────────────────────────────────────────────────────────

export function renderGeneralSettingsTab(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): (() => void) | undefined {
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

  new Setting(containerEl).setName("Global feeds").setHeading();

  // ── Refresh interval ──────────────────────────────────────────────────────
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

  // ── Max items ─────────────────────────────────────────────────────────────
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

  if (Platform.isMobile) {
    new Setting(containerEl).setName("Mobile navigation").setHeading();

    new Setting(containerEl)
      .setName("Swipe between panels")
      .setDesc(
        "Swipe right to open the sidebar and left to return to the article, and swipe right in the reader to go back to the dashboard. This turns off Obsidian's own swipe gestures, such as swipe-to-open-sidebar, inside this plugin's views and relies on Obsidian internals, so an Obsidian update could change it. It does not apply when the reader opens in the left or right sidebar.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.display.swipeBetweenPanels)
          .onChange(async (value) => {
            plugin.settings.display.swipeBetweenPanels = value;
            await plugin.saveSettings();
            // Attach or detach the swipe listeners on the open dashboard.
            (await plugin.getActiveDashboardView())?.render();
            for (const leaf of plugin.app.workspace.getLeavesOfType(
              RSS_READER_VIEW_TYPE,
            )) {
              (
                leaf.view as { syncSwipeNavigation?: () => void }
              ).syncSwipeNavigation?.();
            }
          }),
      );
  }

  new Setting(containerEl).setName("Data retention").setHeading();

  const confirmRetentionChange = (
    applyChange: () => void,
    revertControl: () => void,
  ) => {
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
  };

  const updateRetentionProtection = (
    key: "protectStarred" | "protectSaved" | "protectTagged" | "protectUnread",
    nextValue: boolean,
    revertControl: () => void,
  ) => {
    const previousValue = plugin.settings[key];
    if (previousValue === nextValue) return;

    const applyChange = () => {
      plugin.settings[key] = nextValue;
    };

    if (previousValue && !nextValue) {
      confirmRetentionChange(applyChange, revertControl);
      return;
    }

    void (async () => {
      applyChange();
      await plugin.saveSettings();
    })();
  };

  // ── Auto-delete duration ──────────────────────────────────────────────────
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
      confirmRetentionChange(applyChange, revertControl);
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

  new Setting(containerEl).setName("Protected from auto-deletion").setHeading();

  new Setting(containerEl)
    .setName("Protect starred articles")
    .setDesc("Keep starred articles when retention limits are applied")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.protectStarred)
        .onChange(async (value) => {
          updateRetentionProtection("protectStarred", value, () => {
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
        updateRetentionProtection("protectSaved", value, () => {
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
        updateRetentionProtection("protectTagged", value, () => {
          toggle.setValue(plugin.settings.protectTagged);
        });
      }),
    );

  new Setting(containerEl)
    .setName("Protect unread articles")
    .setDesc("Keep unread articles when retention limits are applied")
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.protectUnread).onChange(async (value) => {
        updateRetentionProtection("protectUnread", value, () => {
          toggle.setValue(plugin.settings.protectUnread);
        });
      }),
    );

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

  // ── Proxy ─────────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Proxy").setHeading();

  new Setting(containerEl)
    .setName("Enable CORS proxy")
    .setDesc(
      "On by default, set to auto. When a direct fetch fails (for example a block on iOS), the plugin retries through a third-party CORS proxy, so the feed or article URL is sent to that proxy. Turn this off to keep fetches direct.",
    )
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.corsProxyEnabled ?? false)
        .onChange(async (value) => {
          plugin.settings.corsProxyEnabled = value;
          await plugin.saveSettings();
          // Re-render the full settings tab to show/hide the URL input.
          // The tab instance calls this renderer so we use a custom event.
          containerEl.dispatchEvent(new CustomEvent("rss-settings-refresh"));
        });
    });

  let disposeProxyCheck: (() => void) | undefined;

  if (plugin.settings.corsProxyEnabled) {
    const proxySetting = new Setting(containerEl)
      .setName("Proxy URL")
      .setDesc(
        "Base URL of the CORS proxy. The default, auto, tries each built-in proxy in turn when a direct fetch fails, relaying the URL to those third-party services. Pick one proxy or enter your own to use only that.",
      );
    proxySetting.settingEl.addClass("rss-proxy-setting-item");

    let textComponent: import("obsidian").TextComponent;
    let saveButton: import("obsidian").ButtonComponent | null = null;
    let dropdownComponent: import("obsidian").DropdownComponent | null = null;
    let lastSavedProxyUrl = (plugin.settings.corsProxyUrl || "").trim();
    let pendingProxyUrl = lastSavedProxyUrl;
    // The dropdown's current value, which the check's availability follows:
    // its empty option means nothing is selected, even though choosing it
    // leaves the configured proxy in place.
    let selectedProxyOption = "";
    // The check controls are built below the dropdown and URL field they read,
    // so the handlers above them only reach them through this callback.
    let refreshProxyCheckSelection: () => void = () => {};

    /**
     * Whether the saved setting names an option the dropdown itself offers:
     * auto, or a built-in proxy. Anything else is a custom URL, which the
     * dropdown shows as the "add new proxy URL" option.
     */
    const isDropdownProxyOption = (url: string): boolean =>
      url === AUTO_PROXY_URL ||
      PREDEFINED_PROXIES.some((proxy) => proxy.url === url);

    /** Shows the save button only for the custom URL field. */
    const setSaveButtonVisible = (visible: boolean): void => {
      if (!saveButton) return;
      setCssProps(saveButton.buttonEl, { display: visible ? "" : "none" });
    };

    /**
     * Brings the dropdown and the save button back in line with the saved
     * setting, for the paths that change it without the dropdown: the URL
     * field's commit and Clear. Choosing an option in the dropdown keeps the
     * setting and the control in step on its own.
     */
    const syncProxyRowToSetting = (): void => {
      const currentUrl = (plugin.settings.corsProxyUrl || "").trim();
      const isOption = isDropdownProxyOption(currentUrl);
      selectedProxyOption = isOption
        ? currentUrl
        : currentUrl
          ? CUSTOM_PROXY_OPTION
          : "";
      dropdownComponent?.setValue(selectedProxyOption);
      setSaveButtonVisible(!isOption && currentUrl !== "");
      refreshProxyCheckSelection();
    };

    const commitProxyUrl = async (rawValue: string): Promise<void> => {
      const value = rawValue.trim();
      if (value === lastSavedProxyUrl) return;

      if (value === "") {
        plugin.settings.corsProxyUrl = "";
        lastSavedProxyUrl = "";
        pendingProxyUrl = "";
        await plugin.saveSettings();
        syncProxyRowToSetting();
        return;
      }

      const validation = isValidUrl(value);
      if (!validation.valid) {
        pendingProxyUrl = lastSavedProxyUrl;
        textComponent.setValue(lastSavedProxyUrl);
        new Notice(validation.error || "Invalid URL");
        refreshProxyCheckSelection();
        return;
      }

      plugin.settings.corsProxyUrl = value;
      lastSavedProxyUrl = value;
      pendingProxyUrl = value;
      await plugin.saveSettings();
      syncProxyRowToSetting();
    };

    proxySetting
      .addDropdown((dropdown) => {
        dropdownComponent = dropdown;
        dropdown.addOption("", "Select a proxy...");
        dropdown.addOption(
          AUTO_PROXY_URL,
          "Auto-cycle (try all proxies on failure)",
        );
        PREDEFINED_PROXIES.forEach((proxy) => {
          dropdown.addOption(proxy.url, proxy.label);
        });
        dropdown.addOption(CUSTOM_PROXY_OPTION, "Add new proxy URL...");

        const currentUrl = (plugin.settings.corsProxyUrl || "").trim();
        if (isDropdownProxyOption(currentUrl)) {
          selectedProxyOption = currentUrl;
        } else if (currentUrl) {
          selectedProxyOption = CUSTOM_PROXY_OPTION;
        } else {
          selectedProxyOption = "";
        }
        dropdown.setValue(selectedProxyOption);

        dropdown.onChange((value: string) => {
          selectedProxyOption = value;
          setSaveButtonVisible(value === CUSTOM_PROXY_OPTION);
          if (value !== CUSTOM_PROXY_OPTION && value !== "") {
            textComponent.setValue(value);
            void (async () => {
              plugin.settings.corsProxyUrl = value;
              lastSavedProxyUrl = value;
              pendingProxyUrl = value;
              await plugin.saveSettings();
            })();
          }
          refreshProxyCheckSelection();
        });
      })
      .addText((text) => {
        textComponent = text;
        text
          .setPlaceholder("https://proxy.com/?url=")
          .setValue(plugin.settings.corsProxyUrl || "")
          .onChange((value) => {
            pendingProxyUrl = value;
            refreshProxyCheckSelection();
          });

        text.inputEl.addEventListener("blur", () => {
          void commitProxyUrl(pendingProxyUrl);
        });
        text.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
          if (evt.key !== "Enter") return;
          void commitProxyUrl(text.getValue());
          text.inputEl.blur();
        });

        addInputClearButton(text.inputEl, {
          label: "Clear proxy URL",
          onClear: () => {
            plugin.settings.corsProxyUrl = "";
            lastSavedProxyUrl = "";
            pendingProxyUrl = "";
            void plugin.saveSettings();
            syncProxyRowToSetting();
          },
        });
        if (text.inputEl.parentElement) {
          setCssProps(text.inputEl.parentElement, {
            flex: "1 1 auto",
            minWidth: "150px",
          });
        }
        setCssProps(text.inputEl, { width: "100%" });
      })
      .addButton((btn) => {
        saveButton = btn;
        btn
          .setIcon("save")
          .setTooltip("Save proxy URL")
          .onClick(async () => {
            const customUrl = textComponent.getValue().trim();
            const validation = isValidUrl(customUrl);
            if (validation.valid) {
              plugin.settings.corsProxyUrl = customUrl;
              lastSavedProxyUrl = customUrl;
              pendingProxyUrl = customUrl;
              await plugin.saveSettings();
              new Notice("Proxy URL saved");
              syncProxyRowToSetting();
              containerEl.dispatchEvent(
                new CustomEvent("rss-settings-refresh"),
              );
            } else {
              new Notice(validation.error || "Invalid URL");
            }
          });

        const currentUrl = (plugin.settings.corsProxyUrl || "").trim();
        setSaveButtonVisible(
          !isDropdownProxyOption(currentUrl) && currentUrl !== "",
        );
      });

    const proxyCheckControls = renderProxyCheckControls(containerEl, {
      readSelectedProxyOption: () => selectedProxyOption,
      readSavedProxyUrl: () => plugin.settings.corsProxyUrl,
      readPendingProxyUrl: () => pendingProxyUrl,
      store: plugin.proxyCheckStore,
      fetchText: (url) =>
        robustFetchDetailed(url, { headers: pageRequestHeaders() }),
    });
    refreshProxyCheckSelection = proxyCheckControls.refreshSelection;
    disposeProxyCheck = proxyCheckControls.dispose;
  }

  return disposeProxyCheck;
}
