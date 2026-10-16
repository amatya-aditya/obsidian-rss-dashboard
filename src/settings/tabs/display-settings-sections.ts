/**
 * Section renderers for the Display settings tab.
 *
 * Extracted from display-settings-tab.ts (#1251, umbrella #1094). Each
 * renderer is a verbatim slice of the old `renderDisplaySettingsTab` body,
 * in the same order.
 */
import { Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import { AccessibleModal } from "../../utils/accessible-modal";
import {
  DEFAULT_SETTINGS,
  IMAGE_CACHE_LIMIT_MAX_MIB,
  IMAGE_CACHE_LIMIT_MIN_MIB,
} from "../../types/types";
import type { RssDashboardSettings } from "../../types/types";
import {
  loadLeftHandedLayout,
  saveLeftHandedLayout,
} from "../../utils/left-handed-layout";
import { formatDateWithRelative } from "../../utils/platform-utils";
import { settingsUiCompatibility } from "../settings-ui-compat";

/** The slice of the plugin the Display tab sections read and call. */
export interface DisplaySectionsPlugin {
  app: App;
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  setImageCachingEnabled(enabled: boolean): Promise<void>;
  setImageCacheLimit(value: number, unlimited: boolean): Promise<void>;
  clearImageCache(): Promise<{ cleared: number; failed: number }>;
  getImageCacheSizeBytes?(): number;
  onImageCacheChanged?(listener: () => void): () => void;
  versionStatusBar?: { renderSetting(containerEl: HTMLElement): void };
  getActiveDashboardView(): Promise<{
    leaf: import("obsidian").WorkspaceLeaf;
    render(): void;
  } | null>;
}

/** A sample of the absolute article date format, so the example cannot drift from it. */
const ABSOLUTE_DATE_EXAMPLE = formatDateWithRelative(
  new Date(2026, 4, 9, 11, 39),
).title;

class ClearImageCacheConfirmModal extends AccessibleModal {
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Clear image cache?" });
    this.contentEl.createEl("p", {
      text: "This removes only cached dashboard preview images. Feed data, settings, and saved articles are unchanged.",
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => this.close()),
      )
      .addButton((button) => {
        button.setButtonText("Clear image cache");
        settingsUiCompatibility.markDestructive(button);
        button.onClick(() => {
          this.confirmed = true;
          this.close();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolvePromise?.(this.confirmed);
  }

  waitForClose(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

function formatByteSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function renderImageCachingSettings(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
  onRefresh: () => void,
  rerenderActiveDashboardView: () => Promise<void>,
): void {
  new Setting(containerEl)
    .setName("Show cover images")
    .setDesc(
      "Display cover-image previews in dashboard card and feed views. Turning this off reduces remote image loading and can improve browsing performance.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.showCoverImage)
        .onChange(async (value) => {
          plugin.settings.display.showCoverImage = value;
          await plugin.saveSettings();
          await rerenderActiveDashboardView();
        }),
    );

  new Setting(containerEl)
    .setName("Allow image caching")
    .setDesc(
      "Store card and feed preview images locally to improve browsing performance. Each image is limited to one megabyte and uses additional vault storage. RSS dashboard does not include this cache in feed or settings sync, but a sync tool that copies plugin files may copy it.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.allowImageCaching)
        .onChange(async (value) => {
          await plugin.setImageCachingEnabled(value);
          await rerenderActiveDashboardView();
          onRefresh();
        }),
    );
}

export function renderImageCacheLimitSettings(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
  onRefresh: () => void,
): void {
  let isSyncingImageCacheLimitControls = false;
  let imageCacheLimitSlider: { setValue: (value: number) => void } | null =
    null;
  let imageCacheLimitInput: import("obsidian").TextComponent | null = null;
  const applyImageCacheLimit = async (value: number): Promise<void> => {
    await plugin.setImageCacheLimit(value, false);
  };

  const cacheLimitSetting = new Setting(containerEl)
    .setName("Image cache limit")
    .setDesc(
      "Maximum storage for cached dashboard preview images, in MiB. Lowering this limit removes least-recently-used cached images immediately.",
    )
    .addSlider((slider) => {
      imageCacheLimitSlider = slider;
      slider
        .setLimits(IMAGE_CACHE_LIMIT_MIN_MIB, IMAGE_CACHE_LIMIT_MAX_MIB, 1)
        .setValue(plugin.settings.display.imageCacheLimitMiB)
        .onChange(async (value) => {
          if (isSyncingImageCacheLimitControls) return;
          isSyncingImageCacheLimitControls = true;
          imageCacheLimitInput?.setValue(String(value));
          isSyncingImageCacheLimitControls = false;
          await applyImageCacheLimit(value);
        });
      settingsUiCompatibility.presentSliderValue(
        slider,
        (value) => `${value} MiB`,
      );
      slider.sliderEl.disabled = plugin.settings.display.imageCacheUnlimited;
    })
    .addText((text) => {
      imageCacheLimitInput = text;
      text
        .setValue(String(plugin.settings.display.imageCacheLimitMiB))
        .setPlaceholder("100");
      text.inputEl.type = "number";
      text.inputEl.min = String(IMAGE_CACHE_LIMIT_MIN_MIB);
      text.inputEl.max = String(IMAGE_CACHE_LIMIT_MAX_MIB);
      text.inputEl.step = "1";
      text.inputEl.disabled = plugin.settings.display.imageCacheUnlimited;
      text.inputEl.addClass("rss-dashboard-settings-number-input");
      text.inputEl.addEventListener("blur", () => {
        const value = Number(text.getValue());
        if (
          !Number.isInteger(value) ||
          value < IMAGE_CACHE_LIMIT_MIN_MIB ||
          value > IMAGE_CACHE_LIMIT_MAX_MIB
        ) {
          text.setValue(String(plugin.settings.display.imageCacheLimitMiB));
          return;
        }
        isSyncingImageCacheLimitControls = true;
        imageCacheLimitSlider?.setValue(value);
        isSyncingImageCacheLimitControls = false;
        void applyImageCacheLimit(value);
      });
    });
  cacheLimitSetting.settingEl.addClass("rss-dashboard-settings-two-row");

  new Setting(containerEl)
    .setName("No cache size limit")
    .setDesc(
      "Do not limit total image-cache storage. The one-megabyte limit for each image still applies.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.imageCacheUnlimited)
        .onChange(async (value) => {
          await plugin.setImageCacheLimit(
            plugin.settings.display.imageCacheLimitMiB,
            value,
          );
          onRefresh();
        }),
    );
}

export function renderClearImageCacheSetting(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
  onRefresh: () => void,
): () => void {
  const clearImageCacheSetting = new Setting(containerEl)
    .setName("Clear image cache")
    .setDesc(
      `Cached image storage: ${formatByteSize(plugin.getImageCacheSizeBytes?.() ?? 0)}.`,
    );
  const cacheSizeDescriptionEl = clearImageCacheSetting.descEl;
  const settingsWindow = containerEl.ownerDocument.defaultView;
  let cacheSizeUpdateTimer: number | null = null;
  const refreshCacheSize = (): void => {
    if (!settingsWindow || cacheSizeUpdateTimer !== null) return;
    cacheSizeUpdateTimer = settingsWindow.setTimeout(() => {
      cacheSizeUpdateTimer = null;
      cacheSizeDescriptionEl.setText(
        `Cached image storage: ${formatByteSize(plugin.getImageCacheSizeBytes?.() ?? 0)}.`,
      );
    }, 250);
  };
  const unregisterImageCacheChange =
    plugin.onImageCacheChanged?.(refreshCacheSize) ?? (() => {});

  clearImageCacheSetting.addButton((button) =>
    button.setButtonText("Clear image cache").onClick(async () => {
      const modal = new ClearImageCacheConfirmModal(plugin.app);
      const confirmation = modal.waitForClose();
      modal.open();
      if (!(await confirmation)) return;

      const result = await plugin.clearImageCache();
      new Notice(
        result.failed === 0
          ? "Image cache cleared."
          : `Cleared ${result.cleared} cached images; ${result.failed} could not be removed.`,
      );
      onRefresh();
    }),
  );

  return () => {
    unregisterImageCacheChange();
    if (settingsWindow && cacheSizeUpdateTimer !== null) {
      settingsWindow.clearTimeout(cacheSizeUpdateTimer);
    }
  };
}

export function renderShowSummarySetting(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
  rerenderActiveDashboardView: () => Promise<void>,
): void {
  new Setting(containerEl)
    .setName("Show summary")
    .setDesc("Display the content summary in card view and feed view")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.showSummary)
        .onChange(async (value) => {
          plugin.settings.display.showSummary = value;
          await plugin.saveSettings();
          await rerenderActiveDashboardView();
        }),
    );
}

export function renderCardsPerRowSetting(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
): void {
  // Cards per row (slider + text input, synced)
  const cardsPerRowSetting = new Setting(containerEl)
    .setName("Cards per row")
    .setDesc("Set card columns in dashboard card view (0 = auto)");
  const cardsPerRowMin = 0;
  const cardsPerRowMax = 6;
  const cardsPerRowStep = 1;
  let isSyncingCardsPerRowControls = false;
  let cardsPerRowSlider: { setValue: (value: number) => void } | null = null;
  let cardsPerRowInput: import("obsidian").TextComponent | null = null;

  const applyCardsPerRow = async (value: number): Promise<void> => {
    plugin.settings.display.cardColumnsPerRow = value;
    await plugin.saveSettings();
    const view = await plugin.getActiveDashboardView();
    if (view) {
      await plugin.app.workspace.revealLeaf(view.leaf);
      view.render();
    }
  };

  cardsPerRowSetting
    .addSlider((slider) => {
      cardsPerRowSlider = slider;
      slider
        .setLimits(cardsPerRowMin, cardsPerRowMax, cardsPerRowStep)
        .setValue(plugin.settings.display.cardColumnsPerRow ?? 0)
        .onChange(async (value) => {
          if (isSyncingCardsPerRowControls) return;
          isSyncingCardsPerRowControls = true;
          cardsPerRowInput?.setValue(String(value));
          isSyncingCardsPerRowControls = false;
          await applyCardsPerRow(value);
        });
      settingsUiCompatibility.presentSliderValue(slider, (value) => {
        if (value === 0) return "Auto";
        return `${value} ${value === 1 ? "column" : "columns"}`;
      });
    })
    .addText((text) => {
      const initialValue = plugin.settings.display.cardColumnsPerRow ?? 0;
      cardsPerRowInput = text;
      text.setValue(String(initialValue)).onChange(async (value) => {
        if (isSyncingCardsPerRowControls) return;
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return;
        const clamped = Math.max(
          cardsPerRowMin,
          Math.min(cardsPerRowMax, parsed),
        );
        isSyncingCardsPerRowControls = true;
        text.setValue(String(clamped));
        cardsPerRowSlider?.setValue(clamped);
        isSyncingCardsPerRowControls = false;
        await applyCardsPerRow(clamped);
      });
      text.inputEl.type = "number";
      text.inputEl.min = String(cardsPerRowMin);
      text.inputEl.max = String(cardsPerRowMax);
      text.inputEl.step = String(cardsPerRowStep);
      text.inputEl.addClass("rss-dashboard-settings-number-input");
    });
  cardsPerRowSetting.settingEl.addClass("rss-dashboard-settings-two-row");
}

export function renderCardSpacingSetting(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
): void {
  // Card spacing (slider + text input, synced)
  const cardSpacingSetting = new Setting(containerEl)
    .setName("Card spacing")
    .setDesc("Adjust the spacing between cards in dashboard card view");
  const cardSpacingMin = 0;
  const cardSpacingMax = 40;
  const cardSpacingStep = 1;
  let isSyncingCardSpacingControls = false;
  let cardSpacingSlider: { setValue: (value: number) => void } | null = null;
  let cardSpacingInput: import("obsidian").TextComponent | null = null;

  const applyCardSpacing = async (value: number): Promise<void> => {
    plugin.settings.display.cardSpacing = value;
    await plugin.saveSettings();
    const view = await plugin.getActiveDashboardView();
    if (view) {
      await plugin.app.workspace.revealLeaf(view.leaf);
      view.render();
    }
  };

  cardSpacingSetting
    .addSlider((slider) => {
      cardSpacingSlider = slider;
      slider
        .setLimits(cardSpacingMin, cardSpacingMax, cardSpacingStep)
        .setValue(plugin.settings.display.cardSpacing ?? 15)
        .onChange(async (value) => {
          if (isSyncingCardSpacingControls) return;
          isSyncingCardSpacingControls = true;
          cardSpacingInput?.setValue(String(value));
          isSyncingCardSpacingControls = false;
          await applyCardSpacing(value);
        });
      settingsUiCompatibility.presentSliderValue(
        slider,
        (value) => `${value}px`,
      );
    })
    .addText((text) => {
      const initialValue = plugin.settings.display.cardSpacing ?? 15;
      cardSpacingInput = text;
      text.setValue(String(initialValue)).onChange(async (value) => {
        if (isSyncingCardSpacingControls) return;
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return;
        const clamped = Math.max(
          cardSpacingMin,
          Math.min(cardSpacingMax, parsed),
        );
        isSyncingCardSpacingControls = true;
        text.setValue(String(clamped));
        cardSpacingSlider?.setValue(clamped);
        isSyncingCardSpacingControls = false;
        await applyCardSpacing(clamped);
      });
      text.inputEl.type = "number";
      text.inputEl.min = String(cardSpacingMin);
      text.inputEl.max = String(cardSpacingMax);
      text.inputEl.step = String(cardSpacingStep);
      text.inputEl.addClass("rss-dashboard-settings-number-input");
    });
  cardSpacingSetting.settingEl.addClass("rss-dashboard-settings-two-row");
}

export function renderDashboardBehaviorSettings(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
  rerenderActiveDashboardView: () => Promise<void>,
): void {
  new Setting(containerEl)
    .setName("Show filter status bar")
    .setDesc(
      "Show the dashboard status bar with retrieved and filtered article counts",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.display.showFilterStatusBar ?? true)
        .onChange(async (value) => {
          plugin.settings.display.showFilterStatusBar = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  plugin.versionStatusBar?.renderSetting(containerEl);

  new Setting(containerEl)
    .setName("Pagination position")
    .setDesc(
      "Choose whether dashboard pagination appears above or below the articles",
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOption("bottom", "Bottom")
        .addOption("top", "Top")
        .setValue(plugin.settings.display.paginationPosition ?? "bottom")
        .onChange(async (value) => {
          plugin.settings.display.paginationPosition = value as
            "top" | "bottom";
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  new Setting(containerEl)
    .setName('Automatically mark article "read" upon opening')
    .setDesc(
      "When an article is opened, it will be automatically marked as read",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display.autoMarkReadOnOpen)
        .onChange(async (value) => {
          plugin.settings.display.autoMarkReadOnOpen = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Article date display")
    .setDesc(
      `Choose whether article dates are shown as relative ('2 days ago') or absolute ('${ABSOLUTE_DATE_EXAMPLE}').`,
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOption("relative", "Relative (e.g. '2 days ago')")
        .addOption("absolute", `Absolute (e.g. '${ABSOLUTE_DATE_EXAMPLE}')`)
        .setValue(plugin.settings.display.articleDateStyle ?? "relative")
        .onChange(async (value: string) => {
          plugin.settings.display.articleDateStyle = value as
            "relative" | "absolute";
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  new Setting(containerEl)
    .setName("Left-handed layout")
    .setDesc(
      "Mirror the article footer in card and feed view so the read action sits within left-thumb reach on the right. This setting is per device. Turning it on here does not change your other devices.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(loadLeftHandedLayout(plugin.app))
        .onChange(async (value) => {
          saveLeftHandedLayout(plugin.app, value);
          await rerenderActiveDashboardView();
        }),
    );
}

export function renderReaderSettings(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
  onRefresh: () => void,
  targetSection: string | undefined,
  persistReaderFormat: () => Promise<void>,
): void {
  // ── Reader ───────────────────────────────────────────────────────────────
  const readerHeading = new Setting(containerEl).setName("Reader").setHeading();
  readerHeading.settingEl.dataset.rssSettingsSection = "reader";
  if (targetSection === "Reader") {
    window.setTimeout(() => {
      readerHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  new Setting(containerEl)
    .setName("Font size")
    .setDesc("Choose the reader body font size preset")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("80", "80%")
        .addOption("90", "90%")
        .addOption("100", "100%")
        .addOption("110", "110%")
        .addOption("120", "120%")
        .addOption("130", "130%")
        .addOption("150", "150%")
        .addOption("175", "175%")
        .addOption("200", "200%")
        .setValue(String(plugin.settings.readerFormat.fontScalePct))
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.fontScalePct = Number.parseInt(
            value,
            10,
          );
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Line height")
    .setDesc("Choose the reader line height preset")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("100", "100%")
        .addOption("110", "110%")
        .addOption("120", "120%")
        .addOption("130", "130%")
        .addOption("140", "140%")
        .addOption("150", "150%")
        .addOption("160", "160%")
        .addOption("180", "180%")
        .addOption("200", "200%")
        .setValue(String(plugin.settings.readerFormat.lineHeightPct))
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.lineHeightPct = Number.parseInt(
            value,
            10,
          );
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Font")
    .setDesc("Choose the reader font family")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("default", "Theme default")
        .addOption("serif", "Serif")
        .addOption("sans", "Sans")
        .addOption("mono", "Mono")
        .setValue(plugin.settings.readerFormat.fontFamily)
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.fontFamily = value as
            "default" | "serif" | "sans" | "mono";
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Alignment")
    .setDesc("Choose how reader paragraphs align")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("justify", "Justify")
        .addOption("left", "Left")
        .setValue(plugin.settings.readerFormat.textAlign)
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.textAlign = value as "justify" | "left";
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Paragraph spacing")
    .setDesc("Choose the spacing between reader paragraphs")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("default", "Theme default")
        .addOption("tight", "Tight")
        .addOption("normal", "Normal")
        .addOption("loose", "Loose")
        .setValue(plugin.settings.readerFormat.paragraphSpacing)
        .onChange(async (value: string) => {
          plugin.settings.readerFormat.paragraphSpacing = value as
            "default" | "tight" | "normal" | "loose";
          await persistReaderFormat();
        }),
    );

  new Setting(containerEl)
    .setName("Reset reader format")
    .setDesc("Restore the reader format defaults")
    .addButton((btn) =>
      btn.setButtonText("Reset").onClick(() => {
        void (async () => {
          plugin.settings.readerFormat = { ...DEFAULT_SETTINGS.readerFormat };
          await persistReaderFormat();
          onRefresh();
        })();
      }),
    );
}

export function renderMobileToolbarSettings(
  containerEl: HTMLElement,
  plugin: DisplaySectionsPlugin,
  targetSection: string | undefined,
): void {
  // ── Mobile toolbar ────────────────────────────────────────────────────────
  const mobileHeading = new Setting(containerEl)
    .setName("Mobile toolbar")
    .setHeading();
  mobileHeading.settingEl.dataset.rssSettingsSection = "mobile-toolbar";
  if (targetSection === "Mobile toolbar") {
    window.setTimeout(() => {
      mobileHeading.settingEl.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 0);
  }

  new Setting(containerEl)
    .setName("Show toolbar in card view (mobile)")
    .setDesc("Show per-article action buttons in card view on mobile")
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display.mobileShowCardToolbar)
        .onChange(async (value) => {
          plugin.settings.display.mobileShowCardToolbar = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  new Setting(containerEl)
    .setName("Show toolbar in list view")
    .setDesc("Show per-article action buttons in list view")
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display.mobileShowListToolbar)
        .onChange(async (value) => {
          plugin.settings.display.mobileShowListToolbar = value;
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );

  const mobileListToolbarStyleSetting = new Setting(containerEl)
    .setName("List toolbar style")
    .setDesc(
      "Choose how action buttons are laid out in list view, on desktop and mobile. Minimal shows only the read toggle; save, star, and tags stay in the right-click menu and the article header.",
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOption("left-grid", "Left grid (2x2)")
        .addOption("bottom-row", "Bottom row")
        .addOption("minimal", "Minimal (read/unread only)")
        .setValue(plugin.settings.display.mobileListToolbarStyle || "minimal")
        .onChange(async (value: string) => {
          plugin.settings.display.mobileListToolbarStyle = value as
            "left-grid" | "bottom-row" | "minimal";
          await plugin.saveSettings();
          const view = await plugin.getActiveDashboardView();
          if (view) {
            await plugin.app.workspace.revealLeaf(view.leaf);
            view.render();
          }
        }),
    );
  mobileListToolbarStyleSetting.settingEl.addClass(
    "rss-dashboard-settings-two-row",
  );
}
