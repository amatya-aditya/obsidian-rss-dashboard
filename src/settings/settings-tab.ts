import {
  App,
  PluginSettingTab,
  Setting,
  Notice,
  normalizePath,
  Modal,
  TextComponent,
} from "obsidian";
import RssDashboardPlugin from "./../../main";
import {
  ViewLocation,
  RssDashboardSettings,
  SavedTemplate,
  DEFAULT_SETTINGS,
  PodcastTheme,
} from "../types/types";
import {
  FolderSuggest,
  VaultFolderSuggest,
} from "../components/folder-suggest";
import { ImportOpmlModal } from "../modals/import-opml-modal";
import { renderKeywordFilterEditor } from "../components/keyword-filter-editor";

class TemplateNameModal extends Modal {
  private result: string | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Save template" });
    contentEl.createEl("p", { text: "Enter a name for this template:" });

    let inputComponent: TextComponent;
    new Setting(contentEl).setName("Template name").addText((text) => {
      inputComponent = text;
      text.setPlaceholder("My template");
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.result = text.getValue().trim() || null;
          this.close();
        }
      });
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.result = null;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.result = inputComponent.getValue().trim() || null;
            this.close();
          }),
      );

    // Focus the input after a short delay
    setTimeout(() => {
      inputComponent.inputEl.focus();
    }, 50);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(this.result);
    }
  }

  waitForClose(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

class HighlightWordEditModal extends Modal {
  private value: string;
  private result: string | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  constructor(app: App, initialValue: string) {
    super(app);
    this.value = initialValue;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Edit highlight word" });

    let inputComponent: TextComponent;
    new Setting(contentEl).setName("Word or phrase").addText((text) => {
      inputComponent = text;
      text.setValue(this.value);
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.result = text.getValue();
          this.close();
        }
      });
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.result = null;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.result = inputComponent.getValue();
            this.close();
          }),
      );

    setTimeout(() => {
      inputComponent.inputEl.focus();
      inputComponent.inputEl.select();
    }, 50);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(this.result);
    }
  }

  waitForClose(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

class ConfirmDeleteModal extends Modal {
  private targetLabel: string;
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(app: App, targetLabel: string) {
    super(app);
    this.targetLabel = targetLabel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Delete highlight word?" });
    contentEl.createEl("p", {
      text: `Are you sure you want to delete "${this.targetLabel}"?`,
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.confirmed = false;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Delete")
          .setWarning()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(this.confirmed);
    }
  }

  waitForClose(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

export class RssDashboardSettingTab extends PluginSettingTab {
  plugin: RssDashboardPlugin;
  private currentTab = "General";
  private tabNames = [
    "General",
    "Display",
    "Media",
    "Article saving",
    "Filters",
    "Highlights",
    "Import/Export",
    "Tags",
    "About",
  ];

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public activateTab(tabName: string): void {
    if (this.tabNames.includes(tabName)) {
      this.currentTab = tabName;
      this.display();
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const tabBar = containerEl.createDiv("rss-dashboard-settings-tab-bar");
    this.tabNames.forEach((tab) => {
      const tabBtn = tabBar.createEl("button", {
        text: tab,
        cls:
          "rss-dashboard-settings-tab-btn" +
          (this.currentTab === tab ? " active" : ""),
      });
      tabBtn.onclick = () => {
        this.currentTab = tab;
        this.display();
      };
    });

    const tabContent = containerEl.createDiv(
      "rss-dashboard-settings-tab-content",
    );
    switch (this.currentTab) {
      case "General":
        this.createGeneralSettings(tabContent);
        break;
      case "Display":
        this.createDisplaySettings(tabContent);
        break;
      case "Media":
        this.createMediaSettings(tabContent);
        break;
      case "Article saving":
        this.createArticleSavingSettings(tabContent);
        break;
      case "Filters":
        this.createFiltersSettings(tabContent);
        break;
      case "Highlights":
        this.createHighlightsSettings(tabContent);
        break;
      case "Import/Export":
        this.createImportExportTab(tabContent);
        break;
      case "Tags":
        this.createTagsSettings(tabContent);
        break;
      case "About":
        this.createAboutTab(tabContent);
        break;
    }
  }

  private createGeneralSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("View style")
      .setDesc("Choose between list and card view for articles")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("list", "List view")
          .addOption("card", "Card view")
          .setValue(this.plugin.settings.viewStyle)
          .onChange(async (value: string) => {
            this.plugin.settings.viewStyle = value as "list" | "card";
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view) {
              await this.app.workspace.revealLeaf(view.leaf);
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
          .setValue(this.plugin.settings.viewLocation)
          .onChange(async (value: string) => {
            this.plugin.settings.viewLocation = value as ViewLocation;
            await this.plugin.saveSettings();
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
          .setValue(this.plugin.settings.readerViewLocation || "main")
          .onChange(async (value: string) => {
            this.plugin.settings.readerViewLocation = value as ViewLocation;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Use web viewer")
      .setDesc("Use web viewer core plugin for articles when available")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useWebViewer || false)
          .onChange(async (value) => {
            this.plugin.settings.useWebViewer = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Refresh interval")
      .setDesc("How often to refresh feeds (in minutes)")
      .addSlider((slider) =>
        slider
          .setLimits(5, 120, 5)
          .setValue(this.plugin.settings.refreshInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.refreshInterval = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Maximum items")
      .setDesc("Maximum number of items to display per feed")
      .addSlider((slider) =>
        slider
          .setLimits(10, 500, 10)
          .setValue(this.plugin.settings.maxItems)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxItems = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.render();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Page size for 'all articles'")
      .setDesc(
        "Number of articles to load at a time in the 'all articles' view.",
      )
      .addSlider((slider) => {
        slider
          .setLimits(20, 200, 10)
          .setValue(this.plugin.settings.allArticlesPageSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.allArticlesPageSize = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Page size for 'unread items'")
      .setDesc("Number of unread articles to load at a time.")
      .addSlider((slider) => {
        slider
          .setLimits(20, 200, 10)
          .setValue(this.plugin.settings.unreadArticlesPageSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.unreadArticlesPageSize = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Page size for 'read items'")
      .setDesc("Number of read articles to load at a time.")
      .addSlider((slider) => {
        slider
          .setLimits(20, 200, 10)
          .setValue(this.plugin.settings.readArticlesPageSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.readArticlesPageSize = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Page size for 'saved items'")
      .setDesc("Number of saved articles to load at a time.")
      .addSlider((slider) => {
        slider
          .setLimits(20, 200, 10)
          .setValue(this.plugin.settings.savedArticlesPageSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.savedArticlesPageSize = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Page size for 'starred items'")
      .setDesc("Number of starred articles to load at a time.")
      .addSlider((slider) => {
        slider
          .setLimits(20, 200, 10)
          .setValue(this.plugin.settings.starredArticlesPageSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.starredArticlesPageSize = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private createDisplaySettings(containerEl: HTMLElement): void {
    const normalizeHexColor = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) return null;

      const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) {
        return null;
      }

      return withHash.toLowerCase();
    };

    new Setting(containerEl).setName("Dashboard").setHeading();

    new Setting(containerEl)
      .setName("Show cover images")
      .setDesc("Display cover images for articles in reader view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showCoverImage)
          .onChange(async (value) => {
            this.plugin.settings.display.showCoverImage = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Show summary")
      .setDesc("Display content summary in card view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showSummary)
          .onChange(async (value) => {
            this.plugin.settings.display.showSummary = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view && this.plugin.settings.viewStyle === "card") {
              await this.app.workspace.revealLeaf(view.leaf);
              view.render();
            }
          }),
      );

    const cardsPerRowSetting = new Setting(containerEl)
      .setName("Cards per row")
      .setDesc("Set card columns in dashboard card view (0 = auto)");
    const cardsPerRowMin = 0;
    const cardsPerRowMax = 6;
    const cardsPerRowStep = 1;
    let isSyncingCardsPerRowControls = false;
    let cardsPerRowSlider: { setValue: (value: number) => void } | null = null;
    let cardsPerRowInput: TextComponent | null = null;

    const applyCardsPerRow = async (value: number): Promise<void> => {
      // Mirrors the dashboard hamburger control so both surfaces update
      // the same persisted display setting.
      this.plugin.settings.display.cardColumnsPerRow = value;
      await this.plugin.saveSettings();
      const view = await this.plugin.getActiveDashboardView();
      if (view) {
        await this.app.workspace.revealLeaf(view.leaf);
        view.render();
      }
    };

    cardsPerRowSetting
      .addSlider((slider) => {
        cardsPerRowSlider = slider;
        slider
          .setLimits(cardsPerRowMin, cardsPerRowMax, cardsPerRowStep)
          .setValue(this.plugin.settings.display.cardColumnsPerRow ?? 0)
          .setDynamicTooltip()
          .onChange(async (value) => {
            if (isSyncingCardsPerRowControls) return;
            isSyncingCardsPerRowControls = true;
            cardsPerRowInput?.setValue(String(value));
            isSyncingCardsPerRowControls = false;
            await applyCardsPerRow(value);
          });
      })
      .addText((text) => {
        const initialValue =
          this.plugin.settings.display.cardColumnsPerRow ?? 0;
        cardsPerRowInput = text;
        text.setValue(String(initialValue)).onChange(async (value) => {
          if (isSyncingCardsPerRowControls) return;

          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;

          const clampedValue = Math.max(
            cardsPerRowMin,
            Math.min(cardsPerRowMax, parsed),
          );
          isSyncingCardsPerRowControls = true;
          text.setValue(String(clampedValue));
          cardsPerRowSlider?.setValue(clampedValue);
          isSyncingCardsPerRowControls = false;
          await applyCardsPerRow(clampedValue);
        });
        text.inputEl.type = "number";
        text.inputEl.min = String(cardsPerRowMin);
        text.inputEl.max = String(cardsPerRowMax);
        text.inputEl.step = String(cardsPerRowStep);
        text.inputEl.addClass("rss-dashboard-settings-number-input");
      });
    cardsPerRowSetting.settingEl.addClass("rss-dashboard-settings-two-row");

    const cardSpacingSetting = new Setting(containerEl)
      .setName("Card spacing")
      .setDesc("Adjust the spacing between cards in dashboard card view");
    const cardSpacingMin = 0;
    const cardSpacingMax = 40;
    const cardSpacingStep = 1;
    let isSyncingCardSpacingControls = false;
    let cardSpacingSlider: { setValue: (value: number) => void } | null = null;
    let cardSpacingInput: TextComponent | null = null;

    const applyCardSpacing = async (value: number): Promise<void> => {
      // Mirrors the dashboard hamburger control and feeds card-view grid gap.
      this.plugin.settings.display.cardSpacing = value;
      await this.plugin.saveSettings();
      const view = await this.plugin.getActiveDashboardView();
      if (view) {
        await this.app.workspace.revealLeaf(view.leaf);
        view.render();
      }
    };

    cardSpacingSetting
      .addSlider((slider) => {
        cardSpacingSlider = slider;
        slider
          .setLimits(cardSpacingMin, cardSpacingMax, cardSpacingStep)
          .setValue(this.plugin.settings.display.cardSpacing ?? 15)
          .setDynamicTooltip()
          .onChange(async (value) => {
            if (isSyncingCardSpacingControls) return;
            isSyncingCardSpacingControls = true;
            cardSpacingInput?.setValue(String(value));
            isSyncingCardSpacingControls = false;
            await applyCardSpacing(value);
          });
      })
      .addText((text) => {
        const initialValue = this.plugin.settings.display.cardSpacing ?? 15;
        cardSpacingInput = text;
        text.setValue(String(initialValue)).onChange(async (value) => {
          if (isSyncingCardSpacingControls) return;

          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;

          const clampedValue = Math.max(
            cardSpacingMin,
            Math.min(cardSpacingMax, parsed),
          );
          isSyncingCardSpacingControls = true;
          text.setValue(String(clampedValue));
          cardSpacingSlider?.setValue(clampedValue);
          isSyncingCardSpacingControls = false;
          await applyCardSpacing(clampedValue);
        });
        text.inputEl.type = "number";
        text.inputEl.min = String(cardSpacingMin);
        text.inputEl.max = String(cardSpacingMax);
        text.inputEl.step = String(cardSpacingStep);
        text.inputEl.addClass("rss-dashboard-settings-number-input");
      });
    cardSpacingSetting.settingEl.addClass("rss-dashboard-settings-two-row");

    new Setting(containerEl)
      .setName("Show filter status bar")
      .setDesc(
        "Show the dashboard status bar with retrieved and filtered article counts",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showFilterStatusBar ?? true)
          .onChange(async (value) => {
            this.plugin.settings.display.showFilterStatusBar = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view) {
              await this.app.workspace.revealLeaf(view.leaf);
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
          .setValue(!!this.plugin.settings.display.autoMarkReadOnOpen)
          .onChange(async (value) => {
            this.plugin.settings.display.autoMarkReadOnOpen = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Default filter")
      .setDesc(
        "Choose which filter to show by default when opening the dashboard",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("all", "All items")
          .addOption("starred", "Starred items")
          .addOption("unread", "Unread items")
          .addOption("read", "Read items")
          .addOption("saved", "Saved items")
          .addOption("videos", "Videos")
          .addOption("podcasts", "Podcasts")
          .setValue(this.plugin.settings.display.defaultFilter)
          .onChange(async (value: string) => {
            this.plugin.settings.display.defaultFilter = value as
              | "all"
              | "starred"
              | "unread"
              | "read"
              | "saved"
              | "videos"
              | "podcasts";

            // If the new default filter is hidden, show a warning
            const hiddenFilters =
              this.plugin.settings.display.hiddenFilters || [];
            if (hiddenFilters.includes(value)) {
              new Notice(
                `Warning: "${value}" filter is currently hidden. Consider showing it first.`,
              );
            }

            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      );

    new Setting(containerEl).setName("Sidebar").setHeading();

    new Setting(containerEl)
      .setName("Show sidebar scrollbar")
      .setDesc("Show the scrollbar in the sidebar feed list")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showSidebarScrollbar ?? true)
          .onChange(async (value) => {
            this.plugin.settings.display.showSidebarScrollbar = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Use domain favicons")
      .setDesc(
        "Show domain-specific favicons instead of generic RSS icons for feeds",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.useDomainFavicons)
          .onChange(async (value) => {
            this.plugin.settings.display.useDomainFavicons = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Hide default RSS icon")
      .setDesc("Hide the default RSS icon for regular feeds in the sidebar")
      .addToggle((toggle) =>
        toggle
          .setValue(!!this.plugin.settings.display.hideDefaultRssIcon)
          .onChange(async (value) => {
            this.plugin.settings.display.hideDefaultRssIcon = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      );

    new Setting(containerEl)
      .setName("All feeds badge")
      .setDesc("Enabled | color picker | hex input")
      .setClass("rss-dashboard-settings-two-row")
      .setClass("rss-dashboard-sidebar-badge-setting")
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.display.showAllFeedsUnreadBadges ?? true,
          )
          .onChange(async (value) => {
            this.plugin.settings.display.showAllFeedsUnreadBadges = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      )
      .addColorPicker((colorPicker) =>
        colorPicker
          .setValue(this.plugin.settings.display.allFeedsUnreadBadgeColor)
          .onChange(async (value) => {
            this.plugin.settings.display.allFeedsUnreadBadgeColor = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      )
      .addText((text) => {
        text
          .setPlaceholder("#8e44ad")
          .setValue(this.plugin.settings.display.allFeedsUnreadBadgeColor)
          .onChange(async (value) => {
            const normalized = normalizeHexColor(value);
            if (!normalized) return;
            this.plugin.settings.display.allFeedsUnreadBadgeColor = normalized;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          });
        text.inputEl.addClass("rss-dashboard-color-hex-input");
      });

    new Setting(containerEl)
      .setName("Folders badge")
      .setDesc("Enabled | color picker | hex input")
      .setClass("rss-dashboard-settings-two-row")
      .setClass("rss-dashboard-sidebar-badge-setting")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showFolderUnreadBadges ?? true)
          .onChange(async (value) => {
            this.plugin.settings.display.showFolderUnreadBadges = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      )
      .addColorPicker((colorPicker) =>
        colorPicker
          .setValue(this.plugin.settings.display.folderUnreadBadgeColor)
          .onChange(async (value) => {
            this.plugin.settings.display.folderUnreadBadgeColor = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      )
      .addText((text) => {
        text
          .setPlaceholder("#d85b9f")
          .setValue(this.plugin.settings.display.folderUnreadBadgeColor)
          .onChange(async (value) => {
            const normalized = normalizeHexColor(value);
            if (!normalized) return;
            this.plugin.settings.display.folderUnreadBadgeColor = normalized;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          });
        text.inputEl.addClass("rss-dashboard-color-hex-input");
      });

    new Setting(containerEl)
      .setName("Feeds badge")
      .setDesc("Enabled | color picker | hex input")
      .setClass("rss-dashboard-settings-two-row")
      .setClass("rss-dashboard-sidebar-badge-setting")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showFeedUnreadBadges ?? true)
          .onChange(async (value) => {
            this.plugin.settings.display.showFeedUnreadBadges = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      )
      .addColorPicker((colorPicker) =>
        colorPicker
          .setValue(this.plugin.settings.display.feedUnreadBadgeColor)
          .onChange(async (value) => {
            this.plugin.settings.display.feedUnreadBadgeColor = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          }),
      )
      .addText((text) => {
        text
          .setPlaceholder("#8e44ad")
          .setValue(this.plugin.settings.display.feedUnreadBadgeColor)
          .onChange(async (value) => {
            const normalized = normalizeHexColor(value);
            if (!normalized) return;
            this.plugin.settings.display.feedUnreadBadgeColor = normalized;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view?.sidebar) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.sidebar.render();
            }
          });
        text.inputEl.addClass("rss-dashboard-color-hex-input");
      });

    new Setting(containerEl).setName("Sidebar padding").setHeading();

    const sidebarLeftPaddingSetting = new Setting(containerEl)
      .setName("Left padding")
      .setDesc("Adjust left padding for sidebar rows");
    const sidebarPaddingMin = 0;
    const sidebarPaddingMax = 40;
    const sidebarPaddingStep = 1;
    let isSyncingLeftPaddingControls = false;
    let sidebarLeftPaddingSlider: { setValue: (value: number) => void } | null =
      null;
    let sidebarLeftPaddingInput: TextComponent | null = null;

    const applySidebarLeftPadding = async (value: number): Promise<void> => {
      this.plugin.settings.display.sidebarItemPaddingLeft = value;
      await this.plugin.saveSettings();
      const view = await this.plugin.getActiveDashboardView();
      if (view?.sidebar) {
        view.sidebar.render();
      }
    };

    sidebarLeftPaddingSetting
      .addSlider((slider) => {
        sidebarLeftPaddingSlider = slider;
        slider
          .setLimits(sidebarPaddingMin, sidebarPaddingMax, sidebarPaddingStep)
          .setValue(this.plugin.settings.display.sidebarItemPaddingLeft ?? 2)
          .setDynamicTooltip()
          .onChange(async (value) => {
            if (isSyncingLeftPaddingControls) return;
            isSyncingLeftPaddingControls = true;
            sidebarLeftPaddingInput?.setValue(String(value));
            isSyncingLeftPaddingControls = false;
            await applySidebarLeftPadding(value);
          });
      })
      .addText((text) => {
        const initialValue =
          this.plugin.settings.display.sidebarItemPaddingLeft ?? 2;
        sidebarLeftPaddingInput = text;
        text.setValue(String(initialValue)).onChange(async (value) => {
          if (isSyncingLeftPaddingControls) return;

          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;

          const clampedValue = Math.max(
            sidebarPaddingMin,
            Math.min(sidebarPaddingMax, parsed),
          );
          isSyncingLeftPaddingControls = true;
          text.setValue(String(clampedValue));
          sidebarLeftPaddingSlider?.setValue(clampedValue);
          isSyncingLeftPaddingControls = false;
          await applySidebarLeftPadding(clampedValue);
        });
        text.inputEl.type = "number";
        text.inputEl.min = String(sidebarPaddingMin);
        text.inputEl.max = String(sidebarPaddingMax);
        text.inputEl.step = String(sidebarPaddingStep);
        text.inputEl.addClass("rss-dashboard-settings-number-input");
      });
    sidebarLeftPaddingSetting.settingEl.addClass(
      "rss-dashboard-settings-two-row",
    );

    const sidebarRightPaddingSetting = new Setting(containerEl)
      .setName("Right padding")
      .setDesc("Adjust right padding for sidebar rows");
    let isSyncingRightPaddingControls = false;
    let sidebarRightPaddingSlider: {
      setValue: (value: number) => void;
    } | null = null;
    let sidebarRightPaddingInput: TextComponent | null = null;

    const applySidebarRightPadding = async (value: number): Promise<void> => {
      this.plugin.settings.display.sidebarItemPaddingRight = value;
      await this.plugin.saveSettings();
      const view = await this.plugin.getActiveDashboardView();
      if (view?.sidebar) {
        view.sidebar.render();
      }
    };

    sidebarRightPaddingSetting
      .addSlider((slider) => {
        sidebarRightPaddingSlider = slider;
        slider
          .setLimits(sidebarPaddingMin, sidebarPaddingMax, sidebarPaddingStep)
          .setValue(this.plugin.settings.display.sidebarItemPaddingRight ?? 2)
          .setDynamicTooltip()
          .onChange(async (value) => {
            if (isSyncingRightPaddingControls) return;
            isSyncingRightPaddingControls = true;
            sidebarRightPaddingInput?.setValue(String(value));
            isSyncingRightPaddingControls = false;
            await applySidebarRightPadding(value);
          });
      })
      .addText((text) => {
        const initialValue =
          this.plugin.settings.display.sidebarItemPaddingRight ?? 2;
        sidebarRightPaddingInput = text;
        text.setValue(String(initialValue)).onChange(async (value) => {
          if (isSyncingRightPaddingControls) return;

          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;

          const clampedValue = Math.max(
            sidebarPaddingMin,
            Math.min(sidebarPaddingMax, parsed),
          );
          isSyncingRightPaddingControls = true;
          text.setValue(String(clampedValue));
          sidebarRightPaddingSlider?.setValue(clampedValue);
          isSyncingRightPaddingControls = false;
          await applySidebarRightPadding(clampedValue);
        });
        text.inputEl.type = "number";
        text.inputEl.min = String(sidebarPaddingMin);
        text.inputEl.max = String(sidebarPaddingMax);
        text.inputEl.step = String(sidebarPaddingStep);
        text.inputEl.addClass("rss-dashboard-settings-number-input");
      });
    sidebarRightPaddingSetting.settingEl.addClass(
      "rss-dashboard-settings-two-row",
    );

    const sidebarRowSpacingSetting = new Setting(containerEl)
      .setName("Sidebar row spacing")
      .setDesc("Adjust the height between rows in the sidebar feed list");
    const spacingMin = 0;
    const spacingMax = 44;
    const spacingStep = 1;
    let isSyncingSpacingControls = false;
    let sidebarRowSpacingSlider: { setValue: (value: number) => void } | null =
      null;
    let sidebarRowSpacingInput: TextComponent | null = null;

    const applySidebarRowSpacing = async (value: number): Promise<void> => {
      this.plugin.settings.display.sidebarRowSpacing = value;
      await this.plugin.saveSettings();
      // Apply the new spacing to the sidebar by re-rendering.
      const view = await this.plugin.getActiveDashboardView();
      if (view?.sidebar) {
        view.sidebar.render();
      }
    };

    sidebarRowSpacingSetting
      .addSlider((slider) => {
        sidebarRowSpacingSlider = slider;
        slider
          .setLimits(spacingMin, spacingMax, spacingStep)
          .setValue(this.plugin.settings.display.sidebarRowSpacing ?? 10)
          .setDynamicTooltip()
          .onChange(async (value) => {
            if (isSyncingSpacingControls) return;
            isSyncingSpacingControls = true;
            sidebarRowSpacingInput?.setValue(String(value));
            isSyncingSpacingControls = false;
            await applySidebarRowSpacing(value);
          });
      })
      .addText((text) => {
        const initialValue =
          this.plugin.settings.display.sidebarRowSpacing ?? 10;
        sidebarRowSpacingInput = text;
        text.setValue(String(initialValue)).onChange(async (value) => {
          if (isSyncingSpacingControls) return;

          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;

          const clampedValue = Math.max(
            spacingMin,
            Math.min(spacingMax, parsed),
          );
          isSyncingSpacingControls = true;
          text.setValue(String(clampedValue));
          sidebarRowSpacingSlider?.setValue(clampedValue);
          isSyncingSpacingControls = false;
          await applySidebarRowSpacing(clampedValue);
        });
        text.inputEl.type = "number";
        text.inputEl.min = String(spacingMin);
        text.inputEl.max = String(spacingMax);
        text.inputEl.step = String(spacingStep);
        text.inputEl.addClass("rss-dashboard-settings-number-input");
      });
    sidebarRowSpacingSetting.settingEl.addClass(
      "rss-dashboard-settings-two-row",
    );

    const sidebarRowIndentationSetting = new Setting(containerEl)
      .setName("Sidebar row indentation")
      .setDesc("Adjust the indentation of nested items in the sidebar");
    const indentationMin = 0;
    const indentationMax = 50;
    const indentationStep = 1;
    let isSyncingIndentationControls = false;
    let sidebarRowIndentationSlider: {
      setValue: (value: number) => void;
    } | null = null;
    let sidebarRowIndentationInput: TextComponent | null = null;

    const applySidebarRowIndentation = async (value: number): Promise<void> => {
      this.plugin.settings.display.sidebarRowIndentation = value;
      await this.plugin.saveSettings();
      // Apply the new indentation to the sidebar by re-rendering.
      const view = await this.plugin.getActiveDashboardView();
      if (view?.sidebar) {
        view.sidebar.render();
      }
    };

    sidebarRowIndentationSetting
      .addSlider((slider) => {
        sidebarRowIndentationSlider = slider;
        slider
          .setLimits(indentationMin, indentationMax, indentationStep)
          .setValue(this.plugin.settings.display.sidebarRowIndentation ?? 20)
          .setDynamicTooltip()
          .onChange(async (value) => {
            if (isSyncingIndentationControls) return;
            isSyncingIndentationControls = true;
            sidebarRowIndentationInput?.setValue(String(value));
            isSyncingIndentationControls = false;
            await applySidebarRowIndentation(value);
          });
      })
      .addText((text) => {
        const initialValue =
          this.plugin.settings.display.sidebarRowIndentation ?? 20;
        sidebarRowIndentationInput = text;
        text.setValue(String(initialValue)).onChange(async (value) => {
          if (isSyncingIndentationControls) return;

          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;

          const clampedValue = Math.max(
            indentationMin,
            Math.min(indentationMax, parsed),
          );
          isSyncingIndentationControls = true;
          text.setValue(String(clampedValue));
          sidebarRowIndentationSlider?.setValue(clampedValue);
          isSyncingIndentationControls = false;
          await applySidebarRowIndentation(clampedValue);
        });
        text.inputEl.type = "number";
        text.inputEl.min = String(indentationMin);
        text.inputEl.max = String(indentationMax);
        text.inputEl.step = String(indentationStep);
        text.inputEl.addClass("rss-dashboard-settings-number-input");
      });
    sidebarRowIndentationSetting.settingEl.addClass(
      "rss-dashboard-settings-two-row",
    );

    new Setting(containerEl).setName("Mobile toolbar").setHeading();

    new Setting(containerEl)
      .setName("Show toolbar in card view (mobile)")
      .setDesc("Show per-article action buttons in card view on mobile")
      .addToggle((toggle) =>
        toggle
          .setValue(!!this.plugin.settings.display.mobileShowCardToolbar)
          .onChange(async (value) => {
            this.plugin.settings.display.mobileShowCardToolbar = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.render();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Show toolbar in list view (mobile)")
      .setDesc("Show per-article action buttons in list view on mobile")
      .addToggle((toggle) =>
        toggle
          .setValue(!!this.plugin.settings.display.mobileShowListToolbar)
          .onChange(async (value) => {
            this.plugin.settings.display.mobileShowListToolbar = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.render();
            }
          }),
      );

    const mobileListToolbarStyleSetting = new Setting(containerEl)
      .setName("List toolbar style (mobile)")
      .setDesc("Choose how action buttons are laid out in mobile list view")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("left-grid", "Left grid (2x2)")
          .addOption("bottom-row", "Bottom row")
          .addOption("minimal", "Minimal (read/unread only)")
          .setValue(
            this.plugin.settings.display.mobileListToolbarStyle || "minimal",
          )
          .onChange(async (value: string) => {
            this.plugin.settings.display.mobileListToolbarStyle = value as
              | "left-grid"
              | "bottom-row"
              | "minimal";
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.render();
            }
          }),
      );
    mobileListToolbarStyleSetting.settingEl.addClass(
      "rss-dashboard-settings-two-row",
    );

    // new Setting(containerEl)
    //   .setName("Filter display style")
    //   .setDesc("Choose how to display the filter buttons in the sidebar")
    //   .addDropdown((dropdown) =>
    //     dropdown
    //       .addOption("vertical", "Vertical list")
    //       .addOption("inline", "Inline icons")
    //       .setValue(this.plugin.settings.display.filterDisplayStyle)
    //       .onChange(async (value: string) => {
    //         this.plugin.settings.display.filterDisplayStyle = value as
    //           | "vertical"
    //           | "inline";
    //         await this.plugin.saveSettings();
    //         const view = await this.plugin.getActiveDashboardView();
    //         if (view?.sidebar) {
    //           await this.app.workspace.revealLeaf(view.leaf);
    //           view.sidebar.render();
    //         }
    //       }),
    //   );

    // Add separator
    containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

    //   // Filter visibility settings
    //   new Setting(containerEl).setName("Filter visibility").setHeading();
    //   containerEl.createEl("p", {
    //     text: "Choose which filter items to show or hide in the sidebar:",
    //     cls: "rss-dashboard-settings-description",
    //   });

    //   const filterOptions = [
    //     { key: "starred", label: "Starred items", icon: "star" },
    //     { key: "unread", label: "Unread items", icon: "circle" },
    //     { key: "read", label: "Read items", icon: "check-circle" },
    //     { key: "saved", label: "Saved items", icon: "save" },
    //     { key: "videos", label: "Videos", icon: "play" },
    //     { key: "podcasts", label: "Podcasts", icon: "mic" },
    //   ];

    //   filterOptions.forEach((filter) => {
    //     // Ensure hiddenFilters array exists and initialize if needed
    //     if (!this.plugin.settings.display.hiddenFilters) {
    //       this.plugin.settings.display.hiddenFilters = [];
    //     }

    //     const isHidden = this.plugin.settings.display.hiddenFilters.includes(
    //       filter.key,
    //     );
    //     new Setting(containerEl)
    //       .setName(filter.label)
    //       .setDesc(`${isHidden ? "Hidden" : "Visible"} in sidebar`)
    //       .addToggle((toggle) =>
    //         toggle.setValue(!isHidden).onChange(async (value) => {
    //           // Ensure hiddenFilters array exists
    //           if (!this.plugin.settings.display.hiddenFilters) {
    //             this.plugin.settings.display.hiddenFilters = [];
    //           }

    //           if (value) {
    //             // Show filter - remove from hidden list
    //             this.plugin.settings.display.hiddenFilters =
    //               this.plugin.settings.display.hiddenFilters.filter(
    //                 (f) => f !== filter.key,
    //               );
    //           } else {
    //             // Hide filter - add to hidden list
    //             if (
    //               !this.plugin.settings.display.hiddenFilters.includes(filter.key)
    //             ) {
    //               this.plugin.settings.display.hiddenFilters.push(filter.key);
    //             }

    //             // If we're hiding the currently selected filter, reset to "all"
    //             const view = await this.plugin.getActiveDashboardView();
    //             if (view?.sidebar && view.currentFolder === filter.key) {
    //               view.currentFolder = null;
    //             }
    //           }
    //           await this.plugin.saveSettings();
    //           const view = await this.plugin.getActiveDashboardView();
    //           if (view?.sidebar) {
    //             await this.app.workspace.revealLeaf(view.leaf);
    //             view.sidebar.render();
    //           }
    //         }),
    //       );
    //   });

    //   containerEl.createEl("p", {
    //     text: "The 'all items' filter cannot be hidden as it's always required.",
    //     cls: "rss-dashboard-settings-note",
    //   });
  }

  private createMediaSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("YouTube").setHeading();

    new Setting(containerEl)
      .setName("Default YouTube folder")
      .setDesc("Default folder for YouTube feeds")
      .addText((text) => {
        text
          .setValue(
            this.plugin.settings.media.defaultYouTubeFolder || "YouTube",
          )
          .onChange(async (value) => {
            this.plugin.settings.media.defaultYouTubeFolder =
              normalizePath(value);
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl, this.plugin.settings.folders);
      });

    new Setting(containerEl)
      .setName("Default YouTube tag")
      .setDesc("Default tag for YouTube videos")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.media.defaultYouTubeTag || "youtube")
          .onChange(async (value) => {
            this.plugin.settings.media.defaultYouTubeTag = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Detect and auto-tag YouTube shorts")
      .setDesc("Automatically tag detected YouTube shorts from feed XML.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.media.detectYouTubeShorts || true)
          .onChange(async (value) => {
            this.plugin.settings.media.detectYouTubeShorts = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Podcast").setHeading();

    new Setting(containerEl)
      .setName("Default podcast folder")
      .setDesc("Default folder for podcast feeds")
      .addText((text) => {
        text
          .setValue(
            this.plugin.settings.media.defaultPodcastFolder || "Podcast",
          )
          .onChange(async (value) => {
            this.plugin.settings.media.defaultPodcastFolder =
              normalizePath(value);
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl, this.plugin.settings.folders);
      });

    new Setting(containerEl)
      .setName("Default podcast tag")
      .setDesc("Default tag for podcast episodes")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.media.defaultPodcastTag || "podcast")
          .onChange(async (value) => {
            this.plugin.settings.media.defaultPodcastTag = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("RSS").setHeading();

    new Setting(containerEl)
      .setName("Default RSS folder")
      .setDesc("Default folder for RSS feeds")
      .addText((text) => {
        text
          .setValue(this.plugin.settings.media.defaultRssFolder || "RSS")
          .onChange(async (value) => {
            this.plugin.settings.media.defaultRssFolder = normalizePath(value);
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl, this.plugin.settings.folders);
      });

    new Setting(containerEl)
      .setName("Default RSS tag")
      .setDesc("Default tag for RSS articles")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.media.defaultRssTag || "rss")
          .onChange(async (value) => {
            this.plugin.settings.media.defaultRssTag = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Kagi smallweb").setHeading();

    new Setting(containerEl)
      .setName("Default smallweb folder")
      .setDesc("Default folder for smallweb feeds")
      .addText((text) => {
        text
          .setValue(
            this.plugin.settings.media.defaultSmallwebFolder || "Smallweb",
          )
          .onChange(async (value) => {
            this.plugin.settings.media.defaultSmallwebFolder =
              normalizePath(value);
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl, this.plugin.settings.folders);
      });

    new Setting(containerEl)
      .setName("Default smallweb tag")
      .setDesc("Default tag for smallweb articles")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.media.defaultSmallwebTag || "smallweb")
          .onChange(async (value) => {
            this.plugin.settings.media.defaultSmallwebTag = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Podcast player").setHeading();

    new Setting(containerEl)
      .setName("Player theme")
      .setDesc("Choose a visual theme for the podcast player")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("obsidian", "Default")
          .addOption("minimal", "Minimal")
          .addOption("gradient", "Gradient")
          .addOption("spotify", "Spotify")
          .addOption("nord", "Nord")
          .addOption("dracula", "Dracula")
          .addOption("solarized", "Solarized dark")
          .addOption("catppuccin", "Catppuccin mocha")
          .addOption("gruvbox", "Gruvbox")
          .addOption("tokyonight", "Tokyo night")
          .setValue(this.plugin.settings.media.podcastTheme)
          .onChange(async (value) => {
            this.plugin.settings.media.podcastTheme = value as PodcastTheme;
            await this.plugin.saveSettings();
            const readerView = await this.plugin.getActiveReaderView();
            if (readerView) {
              readerView.updatePodcastTheme(value);
            }
          }),
      );
  }

  private createArticleSavingSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Save path")
      .setDesc("Default folder to save articles")
      .addText((text) => {
        text
          .setValue(this.plugin.settings.articleSaving.defaultFolder)
          .onChange(async (value) => {
            this.plugin.settings.articleSaving.defaultFolder =
              normalizePath(value);
            await this.plugin.saveSettings();
          });
        new VaultFolderSuggest(this.app, text.inputEl);
      });

    new Setting(containerEl)
      .setName("Add 'saved' tag")
      .setDesc("Automatically add a 'saved' tag to saved articles")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.articleSaving.addSavedTag)
          .onChange(async (value) => {
            this.plugin.settings.articleSaving.addSavedTag = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Save full content")
      .setDesc(
        "Fetch and save the full article content from the web (instead of just the RSS summary)",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.articleSaving.saveFullContent)
          .onChange(async (value) => {
            this.plugin.settings.articleSaving.saveFullContent = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Fetch timeout")
      .setDesc(
        "Timeout in seconds for fetching full article content (prevents hanging)",
      )
      .addSlider((slider) => {
        slider
          .setLimits(5, 30, 1)
          .setValue(this.plugin.settings.articleSaving.fetchTimeout || 10)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.articleSaving.fetchTimeout = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName("Default template").setHeading();

    const templateContainer = containerEl.createDiv();

    new Setting(templateContainer)
      .setName("Default article template")
      .setDesc(
        "Template for saved articles. Use variables like {{title}}, {{content}}, {{link}}, etc.",
      );

    const templateInput = templateContainer.createEl("textarea", {
      attr: { rows: "10" },
      cls: "rss-dashboard-template-input",
    });
    templateInput.value = this.plugin.settings.articleSaving.defaultTemplate;
    templateInput.addEventListener("change", () => {
      void (async () => {
        this.plugin.settings.articleSaving.defaultTemplate =
          templateInput.value;
        await this.plugin.saveSettings();
      })();
    });

    templateContainer.appendChild(templateInput);

    containerEl.createEl("div", {
      cls: "setting-item-description",
      text: "Available variables: {{title}}, {{content}}, {{link}}, {{date}}, {{isoDate}}, {{source}}, {{author}}, {{summary}}, {{tags}}, {{feedTitle}}, {{guid}}",
    });

    // Template action buttons
    const templateBtnRow = containerEl.createDiv({
      cls: "rss-dashboard-template-btn-row",
    });

    const resetBtn = templateBtnRow.createEl("button", {
      text: "Reset to default",
      cls: "rss-dashboard-template-btn",
    });
    resetBtn.onclick = async () => {
      templateInput.value = DEFAULT_SETTINGS.articleSaving.defaultTemplate;
      this.plugin.settings.articleSaving.defaultTemplate =
        DEFAULT_SETTINGS.articleSaving.defaultTemplate;
      await this.plugin.saveSettings();
      new Notice("Template reset to default");
    };

    const saveAsTemplateBtn = templateBtnRow.createEl("button", {
      text: "Save as template",
      cls: "rss-dashboard-template-btn",
    });
    saveAsTemplateBtn.onclick = async () => {
      const name = await this.promptForTemplateName();
      if (name) {
        const newTemplate: SavedTemplate = {
          id: `template-${Date.now()}`,
          name: name,
          template: this.plugin.settings.articleSaving.defaultTemplate,
        };
        if (!this.plugin.settings.articleSaving.savedTemplates) {
          this.plugin.settings.articleSaving.savedTemplates = [];
        }
        this.plugin.settings.articleSaving.savedTemplates.push(newTemplate);
        await this.plugin.saveSettings();
        new Notice(`Template "${name}" saved`);
        this.display();
      }
    };

    // Saved templates section
    new Setting(containerEl).setName("Saved templates").setHeading();

    const savedTemplates =
      this.plugin.settings.articleSaving.savedTemplates || [];

    if (savedTemplates.length === 0) {
      containerEl.createEl("p", {
        text: "No saved templates yet. Save the current template using the button above.",
        cls: "rss-dashboard-settings-note",
      });
    } else {
      const templatesContainer = containerEl.createDiv({
        cls: "rss-dashboard-saved-templates",
      });

      savedTemplates.forEach((template, index) => {
        new Setting(templatesContainer)
          .setName(template.name)
          .addButton((button) =>
            button
              .setButtonText("Load")
              .setTooltip("Load this template into the editor")
              .onClick(async () => {
                templateInput.value = template.template;
                this.plugin.settings.articleSaving.defaultTemplate =
                  template.template;
                await this.plugin.saveSettings();
                new Notice(`Template "${template.name}" loaded`);
              }),
          )
          .addButton((button) =>
            button
              .setButtonText("Update")
              .setTooltip("Update this template with current editor content")
              .onClick(async () => {
                this.plugin.settings.articleSaving.savedTemplates[
                  index
                ].template = this.plugin.settings.articleSaving.defaultTemplate;
                await this.plugin.saveSettings();
                new Notice(`Template "${template.name}" updated`);
              }),
          )
          .addButton((button) =>
            button
              .setIcon("trash")
              .setTooltip("Delete this template")
              .onClick(async () => {
                this.plugin.settings.articleSaving.savedTemplates.splice(
                  index,
                  1,
                );
                await this.plugin.saveSettings();
                new Notice(`Template "${template.name}" deleted`);
                this.display();
              }),
          );
      });
    }
  }

  private createFiltersSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Keyword filters").setHeading();
    containerEl.createEl("p", {
      cls: "rss-dashboard-settings-description",
      text: "Create global include/exclude keyword rules. Rules are case-insensitive, and per-feed settings can optionally override these global rules.",
    });

    if (!this.plugin.settings.filters) {
      this.plugin.settings.filters = {
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
        includeLogic: this.plugin.settings.filters.includeLogic,
        rules: this.plugin.settings.filters.rules,
      },
      onChange: (nextState) => {
        this.plugin.settings.filters.includeLogic = nextState.includeLogic;
        this.plugin.settings.filters.rules = nextState.rules;
        void (async () => {
          await this.plugin.saveSettings();
          this.plugin.notifyFiltersUpdated({
            source: "settings-filters-tab",
            timestamp: Date.now(),
          });
        })();
        this.display();
      },
    });
  }

  private createHighlightsSettings(containerEl: HTMLElement): void {
    const refreshHighlightStatusBarOnly = async (): Promise<void> => {
      const dashboardView = await this.plugin.getActiveDashboardView();
      dashboardView?.refreshFilterStatusBarOnly();
    };

    const rerenderHighlightViews = async (): Promise<void> => {
      const dashboardView = await this.plugin.getActiveDashboardView();
      if (dashboardView) {
        await this.app.workspace.revealLeaf(dashboardView.leaf);
        dashboardView.render();
      }

      const readerView = await this.plugin.getActiveReaderView();
      if (readerView) {
        try {
          const viewState = readerView as unknown as {
            currentItem?: unknown;
            relatedItems?: unknown[];
            displayItem?: (
              item: unknown,
              relatedItems?: unknown[],
            ) => Promise<void>;
          };

          if (
            viewState.currentItem &&
            typeof viewState.displayItem === "function"
          ) {
            await viewState.displayItem(
              viewState.currentItem,
              viewState.relatedItems ?? [],
            );
          }
        } catch {
          // Best-effort refresh: avoid surfacing non-critical reader rerender errors.
        }
      }
    };

    new Setting(containerEl)
      .setName("Enable word highlighting")
      .setDesc(
        "Highlight specified words in article titles, summaries, and content",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.highlights?.enabled ?? false)
          .onChange(async (value) => {
            if (!this.plugin.settings.highlights) {
              this.plugin.settings.highlights = {
                enabled: false,
                defaultColor: "#ffd700",
                highlightInContent: true,
                highlightInTitles: true,
                highlightInSummaries: true,
                words: [],
              };
            }
            this.plugin.settings.highlights.enabled = value;
            await this.plugin.saveSettings();
            await rerenderHighlightViews();
          }),
      );

    // Highlight location settings
    new Setting(containerEl).setName("Highlight locations").setHeading();
    containerEl.createEl("p", {
      text: "Choose where to apply highlights:",
      cls: "rss-dashboard-settings-description",
    });

    new Setting(containerEl)
      .setName("Highlight in titles")
      .setDesc("Apply highlights to article titles in the list/card view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.highlights?.highlightInTitles ?? true)
          .onChange(async (value) => {
            if (!this.plugin.settings.highlights) {
              this.plugin.settings.highlights = {
                enabled: false,
                defaultColor: "#ffd700",
                highlightInContent: true,
                highlightInTitles: true,
                highlightInSummaries: true,
                words: [],
              };
            }
            this.plugin.settings.highlights.highlightInTitles = value;
            await this.plugin.saveSettings();
            await rerenderHighlightViews();
          }),
      );

    new Setting(containerEl)
      .setName("Highlight in summaries")
      .setDesc("Apply highlights to article summaries in card view")
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.highlights?.highlightInSummaries ?? true,
          )
          .onChange(async (value) => {
            if (!this.plugin.settings.highlights) {
              this.plugin.settings.highlights = {
                enabled: false,
                defaultColor: "#ffd700",
                highlightInContent: true,
                highlightInTitles: true,
                highlightInSummaries: true,
                words: [],
              };
            }
            this.plugin.settings.highlights.highlightInSummaries = value;
            await this.plugin.saveSettings();
            await rerenderHighlightViews();
          }),
      );

    new Setting(containerEl)
      .setName("Highlight in content")
      .setDesc("Apply highlights to article content in reader view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.highlights?.highlightInContent ?? true)
          .onChange(async (value) => {
            if (!this.plugin.settings.highlights) {
              this.plugin.settings.highlights = {
                enabled: false,
                defaultColor: "#ffd700",
                highlightInContent: true,
                highlightInTitles: true,
                highlightInSummaries: true,
                words: [],
              };
            }
            this.plugin.settings.highlights.highlightInContent = value;
            await this.plugin.saveSettings();
            await rerenderHighlightViews();
          }),
      );

    // Highlight words list
    new Setting(containerEl).setName("Highlight words").setHeading();
    containerEl.createEl("p", {
      text: "Words and phrases to highlight in articles:",
      cls: "rss-dashboard-settings-description",
    });

    const wordsContainer = containerEl.createDiv({
      cls: "rss-dashboard-highlights-words-container",
    });

    const words = this.plugin.settings.highlights?.words ?? [];
    if (words.length === 0) {
      wordsContainer.createEl("p", {
        text: "No highlight words configured. Add words below to highlight them in articles.",
        cls: "rss-dashboard-settings-note",
      });
    } else {
      words.forEach((word, index) => {
        const matchMode = word.wholeWord ? "Whole word" : "Partial match";
        const enabledState = word.enabled ? "Enabled" : "Disabled";
        const statusParts = [matchMode, enabledState];
        if (word.caseSensitive) {
          statusParts.push("Case sensitive");
        }

        const editWord = () => {
          void (async () => {
            const nextTextRaw = await this.promptForHighlightWordEdit(
              word.text,
            );
            if (nextTextRaw === null) return;
            const nextText = nextTextRaw.trim();
            if (!nextText) {
              new Notice("Please enter a word to highlight");
              return;
            }
            if (
              this.plugin.settings.highlights?.words.some(
                (w, i) => i !== index && w.text === nextText,
              )
            ) {
              new Notice("This word is already in the list");
              return;
            }
            if (!this.plugin.settings.highlights) return;
            this.plugin.settings.highlights.words[index].text = nextText;
            await this.plugin.saveSettings();
            this.display();
            await rerenderHighlightViews();
          })();
        };

        const wordSetting = new Setting(wordsContainer)
          .setName(word.text)
          .setClass("rss-dashboard-highlight-word-setting")
          .setDesc(statusParts.join(" | "))
          .addColorPicker((colorPicker) =>
            colorPicker
              .setValue(
                word.color ||
                  this.plugin.settings.highlights?.defaultColor ||
                  "#ffd700",
              )
              .onChange(async (value) => {
                if (!this.plugin.settings.highlights) return;
                this.plugin.settings.highlights.words[index].color = value;
                await this.plugin.saveSettings();
                await rerenderHighlightViews();
              }),
          )
          .addToggle((toggle) =>
            toggle.setValue(word.enabled).onChange(async (value) => {
              if (!this.plugin.settings.highlights) return;
              this.plugin.settings.highlights.words[index].enabled = value;
              await this.plugin.saveSettings();
              this.display();
              await rerenderHighlightViews();
            }),
          )
          .addButton((button) =>
            button
              .setButtonText(word.wholeWord ? "Whole" : "Partial")
              .setTooltip("Toggle whole-word matching")
              .onClick(async () => {
                if (!this.plugin.settings.highlights) return;
                this.plugin.settings.highlights.words[index].wholeWord =
                  !word.wholeWord;
                await this.plugin.saveSettings();
                this.display();
                await rerenderHighlightViews();
              }),
          )
          .addButton((button) => {
            button.setButtonText("Case").setTooltip("Toggle case sensitivity");
            if (word.caseSensitive) {
              button.setCta();
            }
            return button.onClick(async () => {
              if (!this.plugin.settings.highlights) return;
              this.plugin.settings.highlights.words[index].caseSensitive =
                !word.caseSensitive;
              await this.plugin.saveSettings();
              this.display();
              await rerenderHighlightViews();
            });
          })
          .addExtraButton((button) =>
            button
              .setIcon("pencil")
              .setTooltip(`Edit "${word.text}"`)
              .onClick(editWord),
          )
          .addExtraButton((button) =>
            button
              .setIcon("trash")
              .setTooltip(`Delete "${word.text}"`)
              .onClick(async () => {
                const shouldDelete =
                  await this.promptForHighlightWordDeleteConfirm(word.text);
                if (!shouldDelete) return;
                if (!this.plugin.settings.highlights) return;
                this.plugin.settings.highlights.words.splice(index, 1);
                await this.plugin.saveSettings();
                new Notice(
                  `Deleted highlight word "${word.text}". Refresh the dashboard to apply highlight changes.`,
                );
                this.display();
                await refreshHighlightStatusBarOnly();
              }),
          );
        wordSetting.nameEl.addClass("rss-dashboard-highlight-word-name-click");
        wordSetting.nameEl.setAttr("title", `Edit "${word.text}"`);
        wordSetting.nameEl.addEventListener("click", editWord);
      });
    }

    // Add new word section
    new Setting(containerEl).setName("Add new word").setHeading();

    const newWordContainer = containerEl.createDiv();

    const wordInputSetting = new Setting(newWordContainer)
      .setName("Word or phrase")
      .addText((text) => text.setPlaceholder("Enter word to highlight"));

    const wholeWordSetting = new Setting(newWordContainer)
      .setName("Whole word only")
      .setDesc("Only highlight complete words (not partial matches)")
      .addToggle((toggle) => toggle.setValue(false));

    const caseSensitiveSetting = new Setting(newWordContainer)
      .setName("Case sensitive")
      .setDesc("Only match this word/phrase with exact letter case")
      .addToggle((toggle) => toggle.setValue(false));

    const colorSetting = new Setting(newWordContainer)
      .setName("Highlight color")
      .addColorPicker((colorPicker) =>
        colorPicker.setValue(
          this.plugin.settings.highlights?.defaultColor ?? "#ffd700",
        ),
      );

    new Setting(newWordContainer).addButton((button) =>
      button.setButtonText("Add word").onClick(async () => {
        const textInput = wordInputSetting.components[0] as unknown as {
          inputEl: HTMLInputElement;
        };
        const colorPicker = colorSetting.components[0] as unknown as {
          getValue: () => string;
        };
        const wholeWordToggle = wholeWordSetting.components[0] as unknown as {
          getValue: () => boolean;
        };
        const caseSensitiveToggle = caseSensitiveSetting
          .components[0] as unknown as {
          getValue: () => boolean;
        };

        const text = textInput.inputEl.value.trim();
        const color = colorPicker.getValue();
        const wholeWord = wholeWordToggle.getValue();
        const caseSensitive = caseSensitiveToggle.getValue();

        if (!text) {
          new Notice("Please enter a word to highlight");
          return;
        }

        if (!this.plugin.settings.highlights) {
          this.plugin.settings.highlights = {
            enabled: false,
            defaultColor: "#ffd700",
            highlightInContent: true,
            highlightInTitles: true,
            highlightInSummaries: true,
            words: [],
          };
        }

        // Check for duplicates
        if (
          this.plugin.settings.highlights.words.some((w) => w.text === text)
        ) {
          new Notice("This word is already in the list");
          return;
        }

        this.plugin.settings.highlights.words.push({
          id: `highlight-${Date.now()}`,
          text,
          color,
          enabled: true,
          wholeWord,
          caseSensitive,
          createdAt: Date.now(),
        });

        await this.plugin.saveSettings();
        this.display();
        await refreshHighlightStatusBarOnly();
      }),
    );
  }

  private async promptForTemplateName(): Promise<string | null> {
    const modal = new TemplateNameModal(this.app);
    modal.open();
    return modal.waitForClose();
  }

  private async promptForHighlightWordEdit(
    initialValue: string,
  ): Promise<string | null> {
    const modal = new HighlightWordEditModal(this.app, initialValue);
    modal.open();
    return modal.waitForClose();
  }

  private async promptForHighlightWordDeleteConfirm(
    wordText: string,
  ): Promise<boolean> {
    const modal = new ConfirmDeleteModal(this.app, wordText);
    modal.open();
    return modal.waitForClose();
  }

  private createImportExportTab(containerEl: HTMLElement): void {
    const dataSection = containerEl.createDiv();
    new Setting(dataSection)
      .setName("Backup & restore (data.json)")
      .setDesc(
        "Import or export your full dashboard dataset, including preferences, folders, feeds, and stored article retrievals.",
      )
      .setHeading();

    const dataActionsSetting = new Setting(dataSection);
    dataActionsSetting.settingEl.addClass(
      "rss-dashboard-import-export-actions",
    );
    dataActionsSetting
      .addButton((button) =>
        button
          .setIcon("upload")
          .setButtonText("Import data.json")
          .onClick(() => {
            const input = document.body.createEl("input", {
              attr: {
                type: "file",
                accept: ".json,application/json",
              },
            });
            input.onchange = () => {
              void (async () => {
                const file = input.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                  const data = JSON.parse(
                    text,
                  ) as Partial<RssDashboardSettings>;
                  this.plugin.settings = Object.assign(
                    {},
                    this.plugin.settings,
                    data,
                  );
                  await this.plugin.saveSettings();
                  const view = await this.plugin.getActiveDashboardView();
                  if (view) {
                    await this.app.workspace.revealLeaf(view.leaf);
                    view.render();
                  }
                  new Notice("Data imported successfully!");
                } catch {
                  new Notice("Invalid data.json file");
                }
              })();
            };
            input.click();
          }),
      )
      .addButton((button) =>
        button
          .setIcon("download")
          .setButtonText("Export data.json")
          .onClick(() => {
            void this.plugin.exportDataJson();
          }),
      )
      .addButton((button) =>
        button
          .setIcon("copy")
          .setTooltip("Copy data.json to clipboard")
          .onClick(() => {
            void this.plugin.copyDataJsonToClipboard();
          }),
      );

    const userSettingsSection = containerEl.createDiv();
    new Setting(userSettingsSection)
      .setName("User preferences file")
      .setDesc("Import or export plugin preferences.")
      .setHeading();

    const userSettingsActions = new Setting(userSettingsSection);
    userSettingsActions.settingEl.addClass(
      "rss-dashboard-import-export-actions",
    );
    userSettingsActions
      .addButton((button) =>
        button
          .setIcon("upload")
          .setButtonText("Import usersettings.json")
          .onClick(() => {
            this.plugin.importUserSettingsJson();
          }),
      )
      .addButton((button) =>
        button
          .setIcon("download")
          .setButtonText("Export usersettings.json")
          .onClick(() => {
            void this.plugin.exportUserSettingsJson();
          }),
      )
      .addButton((button) =>
        button
          .setIcon("copy")
          .setTooltip("Copy usersettings.json to clipboard")
          .onClick(() => {
            void this.plugin.copyUserSettingsJsonToClipboard();
          }),
      );

    const opmlSection = containerEl.createDiv();
    new Setting(opmlSection)
      .setName("OPML")
      .setDesc(
        "Import or export an opml subscription list containing your configured feed addresses.",
      )
      .setHeading();

    const opmlActionsSetting = new Setting(opmlSection);
    opmlActionsSetting.settingEl.addClass(
      "rss-dashboard-import-export-actions",
    );
    opmlActionsSetting
      .addButton((button) =>
        button
          .setIcon("upload")
          .setButtonText("Import opml")
          .onClick(() => {
            new ImportOpmlModal(this.app, this.plugin).open();
          }),
      )
      .addButton((button) =>
        button
          .setIcon("download")
          .setButtonText("Export opml")
          .onClick(() => this.plugin.exportOpml()),
      )
      .addButton((button) =>
        button
          .setIcon("copy")
          .setTooltip("Copy feeds.opml to clipboard")
          .onClick(() => {
            void this.plugin.copyOpmlToClipboard();
          }),
      );
  }

  private createTagsSettings(containerEl: HTMLElement): void {
    const tagsContainer = containerEl.createDiv({
      cls: "rss-dashboard-tags-container",
    });

    for (let i = 0; i < this.plugin.settings.availableTags.length; i++) {
      const tag = this.plugin.settings.availableTags[i];

      new Setting(tagsContainer)
        .setName(tag.name)
        .addColorPicker((colorPicker) =>
          colorPicker.setValue(tag.color).onChange(async (value) => {
            this.plugin.settings.availableTags[i].color = value;
            await this.plugin.saveSettings();
            const view = await this.plugin.getActiveDashboardView();
            if (view) {
              await this.app.workspace.revealLeaf(view.leaf);
              view.render();
            }
          }),
        )
        .addButton((button) =>
          button
            .setIcon("trash")
            .setTooltip("Delete tag")
            .onClick(async () => {
              this.plugin.settings.availableTags.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    }

    new Setting(containerEl).setName("Add new tag").setHeading();

    const newTagContainer = containerEl.createDiv();

    const tagNameSetting = new Setting(newTagContainer)
      .setName("Tag name")
      .addText((text) => text.setPlaceholder("Enter tag name"));

    const tagColorSetting = new Setting(newTagContainer)
      .setName("Tag color")
      .addColorPicker((colorPicker) => colorPicker.setValue("#3498db"));

    new Setting(newTagContainer).addButton((button) =>
      button.setButtonText("Add tag").onClick(async () => {
        const nameInput = tagNameSetting.components[0] as unknown as {
          inputEl: HTMLInputElement;
        };
        const name = nameInput.inputEl.value;
        const colorPicker = tagColorSetting.components[0] as unknown as {
          getValue: () => string;
        };
        const color = colorPicker.getValue();

        if (!name) {
          return;
        }

        this.plugin.settings.availableTags.push({
          name,
          color,
        });

        await this.plugin.saveSettings();
        this.display();
      }),
    );
  }

  private createAboutTab(containerEl: HTMLElement): void {
    const aboutContainer = containerEl.createDiv({
      cls: "rss-dashboard-about-tab",
    });

    aboutContainer.createDiv({
      cls: "rss-dashboard-about-title",
      text: this.plugin.manifest.name,
    });
    aboutContainer.createDiv({
      cls: "rss-dashboard-about-version",
      text: `v${this.plugin.manifest.version}`,
    });

    const createLinkButton = (
      parent: HTMLElement,
      label: string,
      href: string,
    ): void => {
      const link = parent.createEl("a", {
        text: label,
        href,
        cls: "rss-dashboard-about-btn",
      });
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    };

    const actionsRow = aboutContainer.createDiv({
      cls: "rss-dashboard-about-btn-row",
    });
    createLinkButton(
      actionsRow,
      "GitHub",
      "https://github.com/amatya-aditya/obsidian-rss-dashboard",
    );
    createLinkButton(
      actionsRow,
      "Report issue",
      "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues",
    );
    createLinkButton(actionsRow, "Discord", "https://discord.gg/9bu7V9BBbs");

    aboutContainer.createDiv({
      cls: "rss-dashboard-about-section-title",
      text: "Support development",
    });
    const supportRow = aboutContainer.createDiv({
      cls: "rss-dashboard-about-btn-row",
    });
    createLinkButton(
      supportRow,
      "Buy me a coffee",
      "https://www.buymeacoffee.com/amatya_aditya",
    );
    createLinkButton(supportRow, "Ko-fi", "https://ko-fi.com/Y8Y41FV4WI");

    aboutContainer.createDiv({
      cls: "rss-dashboard-about-section-title",
      text: "Other plugins",
    });
    const otherPluginsRow = aboutContainer.createDiv({
      cls: "rss-dashboard-about-btn-row",
    });
    createLinkButton(
      otherPluginsRow,
      "Advanced Multi Column",
      "https://github.com/amatya-aditya/advanced-multi-column",
    );
    createLinkButton(
      otherPluginsRow,
      "Media Slider",
      "https://github.com/amatya-aditya/obsidian-media-slider",
    );
    createLinkButton(
      otherPluginsRow,
      "Zen Space",
      "https://github.com/amatya-aditya/obsidian-zen-space",
    );
  }
}
