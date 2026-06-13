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
import { App, Notice, Setting, WorkspaceLeaf } from "obsidian";
import { setCssProps } from "../../utils/platform-utils";
import { normalizeRefreshIntervalMinutes } from "../../utils/validation";
import { isPresetRefreshInterval } from "../../utils/refresh-intervals";
export {
  REFRESH_INTERVAL_PRESETS,
  isPresetRefreshInterval,
} from "../../utils/refresh-intervals";
import {
  getPageSizeOptions,
  PAGE_SIZE_OPTIONS,
} from "../../utils/page-size-options";
import { ApplyMaxItemsToExistingFeedsModal } from "../modals/settings-modals";
import type { RssDashboardSettings } from "../../types/types";
import { PREDEFINED_PROXIES } from "../../utils/proxy-utils";

export interface GeneralSettingsPlugin {
  app: App;
  settingTab: { display(): void } | null;
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
  } | null>;
  importPortableDataBundleFromFile(file: File): Promise<void>;
  exportPortableDataBundle(): Promise<void>;
  applyFeedLimitsToAllFeeds(): Promise<void>;
  refreshFeeds(): Promise<void>;
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
): void {
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
        .addOption("external-browser", "External browser")
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
    .setDesc("Controls pagination page size across all dashboard views.")
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
    .setName("Auto-Refresh interval")
    .setDesc("How often to auto-refresh feeds (in minutes)");

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
      "Delay before the initial refresh when Obsidian opens, in seconds. " +
        "If your feeds appear empty or stale right after startup, try increasing this value " +
        "to give sync services more time to finish.",
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
      activeWindow.clearTimeout(maxItemsPromptTimer);
    }
    maxItemsPromptTimer = activeWindow.setTimeout(() => {
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
      "Default max item limit for new feeds (and fallback when a feed has no override).",
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

        maxItemsCustomInput?.addClass("hidden");
        maxItemsLimit = parseInt(value, 10) || 0;
        applyMaxItemsValue(maxItemsLimit);
      });
  });

  // ── Auto-delete duration ──────────────────────────────────────────────────
  const defaultAutoDeleteSetting = new Setting(containerEl)
    .setName("Default auto delete duration (new feeds)")
    .setDesc(
      "Default days to keep read articles before auto-delete for new feeds (per-feed override available).",
    );

  let defaultDuration = plugin.settings.defaultAutoDeleteDuration;
  let autoDeleteCustomInput: HTMLInputElement | null = null;

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
              void (async () => {
                const parsed = parseInt(autoDeleteCustomInput?.value || "", 10);
                defaultDuration = Number.isFinite(parsed) ? parsed : 0;
                plugin.settings.defaultAutoDeleteDuration = defaultDuration;
                await plugin.saveSettings();
              })();
            });
          }

          autoDeleteCustomInput.removeClass("hidden");
          autoDeleteCustomInput.addClass("visible");
          return;
        }

        autoDeleteCustomInput?.addClass("hidden");
        defaultDuration = parseInt(value, 10) || 0;
        void (async () => {
          plugin.settings.defaultAutoDeleteDuration = defaultDuration;
          await plugin.saveSettings();
        })();
      });
  });

  // ── Proxy ─────────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Proxy").setHeading();

  new Setting(containerEl)
    .setName("Enable CORS proxy")
    .setDesc(
      "When enabled, article fetches that are blocked by a firewall (e.g. on iOS) will be retried through the proxy URL below",
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

  if (plugin.settings.corsProxyEnabled) {
    const proxySetting = new Setting(containerEl)
      .setName("Proxy URL")
      .setDesc("Base URL of the CORS proxy.");
    proxySetting.settingEl.addClass("rss-proxy-setting-item");

    let textComponent: import("obsidian").TextComponent;
    let saveButton: import("obsidian").ButtonComponent | null = null;
    let lastSavedProxyUrl = (plugin.settings.corsProxyUrl || "").trim();
    let pendingProxyUrl = lastSavedProxyUrl;

    const commitProxyUrl = async (rawValue: string): Promise<void> => {
      const value = rawValue.trim();
      if (value === lastSavedProxyUrl) return;

      if (value === "") {
        plugin.settings.corsProxyUrl = "";
        lastSavedProxyUrl = "";
        pendingProxyUrl = "";
        await plugin.saveSettings();
        return;
      }

      const { isValidUrl } = await import("../../utils/validation");
      const validation = isValidUrl(value);
      if (!validation.valid) {
        pendingProxyUrl = lastSavedProxyUrl;
        textComponent.setValue(lastSavedProxyUrl);
        new Notice(validation.error || "Invalid URL");
        return;
      }

      plugin.settings.corsProxyUrl = value;
      lastSavedProxyUrl = value;
      pendingProxyUrl = value;
      await plugin.saveSettings();
    };

    proxySetting
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select a proxy...");
        dropdown.addOption("auto", "Auto-cycle (try all proxies on failure)");
        PREDEFINED_PROXIES.forEach((proxy) => {
          dropdown.addOption(proxy.url, proxy.label);
        });
        dropdown.addOption("custom", "Add new proxy URL...");

        const currentUrl = plugin.settings.corsProxyUrl || "";
        const isPredefined = PREDEFINED_PROXIES.some(
          (p) => p.url === currentUrl,
        );
        if (isPredefined) {
          dropdown.setValue(currentUrl);
        } else if (currentUrl) {
          dropdown.setValue("custom");
        } else {
          dropdown.setValue("");
        }

        dropdown.onChange((value: string) => {
          if (value === "custom") {
            if (saveButton)
              void import("../../utils/platform-utils").then(
                ({ setCssProps }) =>
                  setCssProps(saveButton!.buttonEl, { display: "" }),
              );
          } else {
            if (saveButton)
              void import("../../utils/platform-utils").then(
                ({ setCssProps }) =>
                  setCssProps(saveButton!.buttonEl, { display: "none" }),
              );
            if (value !== "") {
              textComponent.setValue(value);
              void (async () => {
                plugin.settings.corsProxyUrl = value;
                lastSavedProxyUrl = value;
                pendingProxyUrl = value;
                await plugin.saveSettings();
              })();
            }
          }
        });
      })
      .addText((text) => {
        textComponent = text;
        text
          .setPlaceholder("https://proxy.com/?url=")
          .setValue(plugin.settings.corsProxyUrl || "")
          .onChange((value) => {
            pendingProxyUrl = value;
          });

        text.inputEl.addEventListener("blur", () => {
          void commitProxyUrl(pendingProxyUrl);
        });
        text.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
          if (evt.key !== "Enter") return;
          void commitProxyUrl(text.getValue());
          text.inputEl.blur();
        });

        setCssProps(text.inputEl, {
          flex: "1 1 auto",
          minWidth: "150px",
        });

        proxySetting.addExtraButton((cb) => {
          cb.setIcon("x")
            .setTooltip("Clear")
            .onClick(async () => {
              text.setValue("");
              plugin.settings.corsProxyUrl = "";
              lastSavedProxyUrl = "";
              pendingProxyUrl = "";
              await plugin.saveSettings();
            });
        });
      })
      .addButton((btn) => {
        saveButton = btn;
        btn
          .setIcon("save")
          .setTooltip("Save to list")
          .onClick(async () => {
            const customUrl = textComponent.getValue().trim();
            const { isValidUrl } = await import("../../utils/validation");
            const validation = isValidUrl(customUrl);
            if (validation.valid) {
              plugin.settings.corsProxyUrl = customUrl;
              lastSavedProxyUrl = customUrl;
              pendingProxyUrl = customUrl;
              await plugin.saveSettings();
              new Notice("Proxy URL saved");
              containerEl.dispatchEvent(
                new CustomEvent("rss-settings-refresh"),
              );
            } else {
              new Notice(validation.error || "Invalid URL");
            }
          });

        const currentUrl = plugin.settings.corsProxyUrl || "";
        const isPredefined =
          currentUrl === "auto" ||
          PREDEFINED_PROXIES.some((p) => p.url === currentUrl);
        if (isPredefined || !currentUrl) {
          void import("../../utils/platform-utils").then(({ setCssProps }) =>
            setCssProps(btn.buttonEl, { display: "none" }),
          );
        }
      });
  }
}
