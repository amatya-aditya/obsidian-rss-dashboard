import { Modal, App, Setting, Notice } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import type {
  FeedKeywordRulesSettings,
  Folder,
  SavedTemplate,
  Tag,
} from "../../types/types";
import { FolderSuggest } from "../../components/folder-suggest";
import {
  formatLatestEntryLabel,
  getDefaultFolderForResolvedFeed,
  getPreviewConversionNotice,
  resolveAndLoadPreview,
  shouldAutoAssignFolder,
} from "./feed-preview-loader";
import { MediaService } from "../../services/media-service";
import { renderKeywordFilterEditor } from "../../components/keyword-filter-editor";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { isValidFeedTitle } from "../../utils/validation";
import {
  FEED_REFRESH_DISABLED_INTERVAL,
  getPerFeedRefreshIntervalDropdownValue,
} from "../../utils/refresh-intervals";
import { renderSupportedFormatBadges, SupportedFeedType } from "./supported-format-badges";
import { decorateFolderSelectorInput } from "./folder-selector-field";
import { addTagMultiSelectControl } from "../../components/tag-multi-select-control";

const EMPTY_FEED_VALIDATION_WARNING =
  "Feed validation passed, however no content detected.";

/** Typed payload emitted by AddFeedModal when the user confirms adding a feed. */
export interface AddFeedRequest {
  title: string;
  url: string;
  folder: string;
  autoDeleteDuration?: number;
  maxItemsLimit?: number;
  scanInterval?: number;
  feedKeywordRules?: FeedKeywordRulesSettings;
  customTemplate?: string;
  excludeFromRefresh?: boolean;
  customTags?: string[];
}

export class AddFeedModal extends Modal {
  folders: Folder[];
  onAdd: (request: AddFeedRequest) => Promise<boolean | void>;
  onSave: () => void;
  defaultFolder: string;
  plugin?: RssDashboardPlugin;
  initialUrl: string;
  initialTitle: string;

  // --- State properties ---
  private url: string;
  private title: string;
  private folder: string;
  private status: string = "";
  private latestEntry: string = "-";
  private customTags: string[] = [];
  private autoDeleteDuration: number;
  private maxItemsLimit: number;
  private scanInterval: number = 0;
  private excludeFromRefresh: boolean = false;
  private customTemplate: string = "";
  private feedKeywordRules: FeedKeywordRulesSettings;

  // --- DOM References ---
  private titleInput!: HTMLInputElement;
  private urlInput!: HTMLInputElement;
  private folderInput!: HTMLInputElement;
  private loadBtn!: HTMLButtonElement;
  private statusDiv?: HTMLDivElement;
  private latestEntryDiv?: HTMLDivElement;
  private setActiveBadge!: (type: SupportedFeedType | null) => void;
  private clearActiveBadge!: () => void;

  constructor(
    app: App,
    folders: Folder[],
    onAdd: (request: AddFeedRequest) => Promise<boolean | void>,
    onSave: () => void,
    defaultFolder = "",
    plugin?: RssDashboardPlugin,
    initialUrl = "",
    initialTitle = "",
  ) {
    super(app);
    this.folders = folders;
    this.onAdd = onAdd;
    this.onSave = onSave;
    this.defaultFolder = defaultFolder;
    this.plugin = plugin || undefined;
    this.initialUrl = initialUrl.trim();
    this.initialTitle = initialTitle.trim();

    this.url = this.initialUrl;
    this.title = this.initialTitle;
    this.folder = this.defaultFolder;
    this.autoDeleteDuration = this.plugin?.settings?.defaultAutoDeleteDuration ?? 30;
    this.maxItemsLimit = this.plugin?.settings?.maxItems ?? 50;
    this.feedKeywordRules = {
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [],
    };
  }

  onOpen() {
    this.setupModalContainer();
    this.renderHeader();
    this.renderUrlAndSourceSection();
    this.renderDetailsSection();
    this.renderFeedOptionsSection();
    this.renderKeywordRulesSection();
    this.renderActionButtons();

    activeWindow.setTimeout(() => {
      this.urlInput?.focus();
      this.urlInput?.select();
    }, 0);
  }

  /* ============================================
   * 1. Modal Setup & Header
   * Initializes modal container and renders titles
   * ============================================ */
  private setupModalContainer() {
    this.modalEl.className +=
      " rss-dashboard-modal rss-dashboard-modal-container";
    // Add mobile-specific class for proper styling on mobile/tablet
    if (shouldUseMobileSidebarLayout()) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
      // Remove Obsidian's default floating close button on mobile
      const closeBtn = this.modalEl.querySelector(".modal-close-button");
      if (closeBtn) {
        closeBtn.remove();
      }
    }
    this.contentEl.empty();
  }

  private renderHeader() {
    new Setting(this.contentEl).setName("Add feed").setHeading();
    const subtitle = this.contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent =
      "Add a new RSS, podcast, or YouTube feed to your dashboard";
  }

  /* ============================================
   * 2. URL & Feed Source
   * Handles input parsing, live loading, and format detection
   * ============================================ */
  private normalizeNitterUrl = (): void => {
    const candidate = (this.urlInput?.value || this.url || "").trim();
    const normalized = MediaService.normalizeNitterUrlToRss(candidate);
    if (!normalized) return;

    this.url = normalized;
    if (this.urlInput) this.urlInput.value = normalized;
  };

  private async handleLoadFeed() {
    // Validate that URL is not empty
    if (!this.url || this.url.trim() === "") {
      this.status = "\u274C Please enter a feed URL";
      if (this.statusDiv) {
        this.statusDiv.textContent = this.status;
        this.statusDiv.removeClass("status-loading");
        this.statusDiv.removeClass("status-ok");
        this.statusDiv.addClass("status-error");
      }
      return;
    }

    this.normalizeNitterUrl();

    // Set loading state
    this.status = "\u23F3 Loading...";
    this.loadBtn.addClass("loading");
    this.loadBtn.disabled = true;
    this.clearActiveBadge(); // Clear any previous active states
    
    if (this.statusDiv) {
      this.statusDiv.textContent = this.status;
      this.statusDiv.removeClass("rss-dashboard-status-warning");
      this.statusDiv.removeClass("status-ok");
      this.statusDiv.removeClass("status-error");
      this.statusDiv.addClass("status-loading");
    }

    try {
      const preview = await resolveAndLoadPreview(this.url, {
        corsProxyEnabled: this.plugin?.settings?.corsProxyEnabled,
        corsProxyUrl: this.plugin?.settings?.corsProxyUrl,
      });

      this.url = preview.finalUrl;
      if (this.urlInput) this.urlInput.value = preview.finalUrl;

      this.title = preview.title;
      if (this.titleInput) this.titleInput.value = this.title;
      
      this.latestEntry = formatLatestEntryLabel(preview.latestPubDate);

      if (this.latestEntryDiv) {
        this.latestEntryDiv.textContent = this.latestEntry;
      }

      if (this.statusDiv) {
        this.statusDiv.removeClass("status-loading");
        this.statusDiv.removeClass("status-error");
        this.statusDiv.removeClass("status-ok");
        this.statusDiv.removeClass("rss-dashboard-status-warning");

        const conversionNotice = getPreviewConversionNotice(preview);

        if (preview.hasEntries) {
          this.status = "OK";
          this.statusDiv.textContent = `\u2705 OK${conversionNotice}`;
          this.statusDiv.addClass("status-ok");
        } else {
          this.status = EMPTY_FEED_VALIDATION_WARNING;
          this.statusDiv.textContent = `⚠ ${EMPTY_FEED_VALIDATION_WARNING}${conversionNotice}`;
          this.statusDiv.addClass("rss-dashboard-status-warning");
        }
      }

      if (this.urlInput) {
        this.urlInput.addClass("loaded");
      }
      // Set the active badge based on detected type
      this.setActiveBadge(preview.detectedType);

      const currentFolder = this.folderInput?.value || "";
      if (
        this.folderInput &&
        shouldAutoAssignFolder(
          currentFolder,
          this.plugin?.settings?.media,
        )
      ) {
        const nextFolder = getDefaultFolderForResolvedFeed(
          preview,
          this.plugin?.settings?.media,
        );
        this.folder = nextFolder;
        this.folderInput.value = nextFolder;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.status = `Error: ${errorMsg}`;
      this.latestEntry = "-";
      if (this.latestEntryDiv) {
        this.latestEntryDiv.textContent = this.latestEntry;
      }
      console.error("Feed load error:", e);
      // Error state
      if (this.statusDiv) {
        this.statusDiv.textContent = `\u274C ${errorMsg}`;
        this.statusDiv.removeClass("status-loading");
        this.statusDiv.removeClass("status-ok");
        this.statusDiv.removeClass("rss-dashboard-status-warning");
        this.statusDiv.addClass("status-error");
      }
    } finally {
      // Reset loading state
      this.loadBtn.removeClass("loading");
      this.loadBtn.disabled = false;
    }
  }

  private renderUrlAndSourceSection() {
    const urlSetting = new Setting(this.contentEl)
      .setName("Feed URL")
      .addText((text) => {
        text.onChange((v) => (this.url = v));
        text.setValue(this.url);
        this.urlInput = text.inputEl;
        this.urlInput.autocomplete = "off";
        this.urlInput.spellcheck = false;
        this.urlInput.placeholder = "https://example.com/feed.xml";
        this.urlInput.addClass("feed-url-input");
        this.urlInput.addEventListener("focus", () => this.urlInput.select());
        this.urlInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            this.titleInput?.focus();
          } else if (e.key === "Escape") {
            this.close();
          }
        });
        this.urlInput.addEventListener("blur", this.normalizeNitterUrl);
        this.urlInput.addEventListener("paste", () => {
          activeWindow.setTimeout(this.normalizeNitterUrl, 0);
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Load");
        btn.buttonEl.addClass("rss-dashboard-load-button");
        this.loadBtn = btn.buttonEl;
        btn.onClick(() => {
          void this.handleLoadFeed();
        });
      });

    urlSetting.settingEl.addClass("rss-feed-form-row");
    urlSetting.settingEl.addClass("rss-feed-form-row-url");

    const sourceSetting = new Setting(this.contentEl).setName("Feed Source");
    sourceSetting.settingEl.addClass("rss-feed-form-row");
    sourceSetting.settingEl.addClass("rss-feed-source-row");

    const { clearActiveBadge, setActiveBadge } = renderSupportedFormatBadges(
      sourceSetting.controlEl,
    );
    this.clearActiveBadge = clearActiveBadge;
    this.setActiveBadge = setActiveBadge;
  }

  /* ============================================
   * 3. Feed Details
   * Title, folder selection, and parsing status
   * ============================================ */
  private renderDetailsSection() {
    const titleSetting = new Setting(this.contentEl)
      .setName("Title")
      .addText((text) => {
        text.setValue(this.title).onChange((v) => (this.title = v));
        this.titleInput = text.inputEl;
        this.titleInput.autocomplete = "off";
        this.titleInput.spellcheck = false;
        this.titleInput.addClass("title-input");
        this.titleInput.addEventListener("focus", () => this.titleInput.select());
        this.titleInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            this.folderInput?.focus();
          } else if (e.key === "Escape") {
            this.close();
          }
        });
      });
    titleSetting.settingEl.addClass("rss-feed-form-row");

    const latestEntrySetting = new Setting(this.contentEl).setName("Latest entry");
    this.latestEntryDiv = latestEntrySetting.controlEl.createDiv({
      text: this.latestEntry,
      cls: "add-feed-latest-entry",
    });

    const statusSetting = new Setting(this.contentEl).setName("Status");
    this.statusDiv = statusSetting.controlEl.createDiv({
      text: this.status,
      cls: "add-feed-status",
    });

    const folderSetting = new Setting(this.contentEl)
      .setName("Folder")
      .addText((text) => {
        text.setValue(this.folder).setPlaceholder("Type or select folder...");
        this.folderInput = text.inputEl;
        this.folderInput.autocomplete = "off";
        this.folderInput.spellcheck = false;
        this.folderInput.addClass("folder-input");
        this.folderInput.addEventListener("focus", () => this.folderInput.select());

        new FolderSuggest(this.app, this.folderInput, this.folders);
      });
    decorateFolderSelectorInput(folderSetting, this.folderInput);
  }

  /* ============================================
   * 4. Feed Options (Per-feed Overrides)
   * Auto-delete, limits, custom auto-tags, templates
   * ============================================ */
  private renderFeedOptionsSection() {
    const perFeedControlsDetails = this.contentEl.createEl("details", {
      cls: "rss-keyword-filter-details rss-per-feed-controls-details",
    });
    perFeedControlsDetails.createEl("summary", {
      cls: "rss-keyword-filter-summary",
      text: "Feed options",
    });
    const perFeedControlsBody = perFeedControlsDetails.createDiv({
      cls: "rss-keyword-filter-details-body",
    });

    const autoDeleteSetting = new Setting(perFeedControlsBody)
      .setName("Auto delete articles duration")
      .setDesc("Days to keep articles before auto-delete");

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
          this.autoDeleteDuration === 0
            ? "0"
            : [1, 3, 7, 14, 30, 60, 90, 180, 365].includes(this.autoDeleteDuration)
              ? this.autoDeleteDuration.toString()
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
                this.autoDeleteDuration > 0 ? this.autoDeleteDuration.toString() : "";
              autoDeleteCustomInput.addEventListener("change", (evt: Event) => {
                const target = evt.target as HTMLInputElement;
                this.autoDeleteDuration = parseInt(target.value) || 0;
              });
            }
            if (autoDeleteCustomInput) {
              autoDeleteCustomInput.removeClass("hidden");
              autoDeleteCustomInput.addClass("visible");
            }
          } else {
            if (autoDeleteCustomInput) {
              autoDeleteCustomInput.addClass("hidden");
            }
            this.autoDeleteDuration = parseInt(value) || 0;
          }
        });
    });

    const maxItemsSetting = new Setting(perFeedControlsBody)
      .setName("Max items limit")
      .setDesc("Maximum number of items to keep per feed");

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
          this.maxItemsLimit === 0
            ? "0"
            : [10, 25, 50, 100, 200, 500, 1000].includes(this.maxItemsLimit)
              ? this.maxItemsLimit.toString()
              : "custom",
        )
        .onChange((value) => {
          if (value === "custom") {
            if (!maxItemsCustomInput) {
              maxItemsCustomInput = maxItemsSetting.controlEl.createEl(
                "input",
                {
                  type: "number",
                  placeholder: "Enter number",
                  cls: "rss-custom-input",
                },
              );
              maxItemsCustomInput.min = "1";
              maxItemsCustomInput.addEventListener("change", (evt: Event) => {
                const target = evt.target as HTMLInputElement;
                this.maxItemsLimit = parseInt(target.value) || 0;
              });
            }
            if (maxItemsCustomInput) {
              maxItemsCustomInput.removeClass("hidden");
              maxItemsCustomInput.addClass("visible");
            }
          } else {
            if (maxItemsCustomInput) {
              maxItemsCustomInput.addClass("hidden");
            }
            this.maxItemsLimit = parseInt(value) || 0;
          }
        });
    });

    const scanIntervalSetting = new Setting(perFeedControlsBody)
      .setName("Auto-refresh interval")
      .setDesc("Custom auto-refresh interval in minutes");

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
        .setValue(getPerFeedRefreshIntervalDropdownValue(this.scanInterval))
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
                this.scanInterval > 0 ? this.scanInterval.toString() : "";
              scanIntervalCustomInput.addEventListener(
                "change",
                (evt: Event) => {
                  const target = evt.target as HTMLInputElement;
                  this.scanInterval = parseInt(target.value, 10) || 0;
                },
              );
            }
            if (scanIntervalCustomInput) {
              scanIntervalCustomInput.removeClass("hidden");
              scanIntervalCustomInput.addClass("visible");
            }
          } else {
            if (scanIntervalCustomInput) {
              scanIntervalCustomInput.addClass("hidden");
            }
            this.scanInterval = parseInt(value, 10) || 0;
          }
        });
    });

    new Setting(perFeedControlsBody)
      .setName("Exclude from refresh")
      .setDesc(
        "Skip this feed during automatic refresh and bulk refresh actions. You can still refresh it directly from its feed view.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.excludeFromRefresh).onChange((value) => {
          this.excludeFromRefresh = value;
        });
      });

    // Template selection
    const savedTemplates =
      this.plugin?.settings?.articleSaving?.savedTemplates || [];

    new Setting(perFeedControlsBody)
      .setName("Article template")
      .setDesc("Select a template to use when saving articles from this feed")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Use default template");
        savedTemplates.forEach((template: SavedTemplate) => {
          dropdown.addOption(template.id, template.name);
        });
        dropdown.setValue(this.customTemplate);
        dropdown.onChange((value) => {
          this.customTemplate = value;
        });
      });

    const autoTagSetting = new Setting(perFeedControlsBody)
      .setName("Custom auto-tags")
      .setDesc(
        "Additional tags applied automatically to new articles from this feed (Single Feed Override)",
      );

    const availableTags: Tag[] = this.plugin?.settings?.availableTags ?? [];

    addTagMultiSelectControl({
      setting: autoTagSetting,
      availableTags,
      selectedTagNames: this.customTags,
      triggerEmptyLabel: "None",
      menuTitle: "Select auto-tags",
      onChange: (selectedNames) => {
        this.customTags = selectedNames;
      },
    });
  }

  /* ============================================
   * 5. Keyword Rules
   * Rendering the keyword filter editor
   * ============================================ */
  private renderKeywordRulesSection() {
    const feedRulesDetails = this.contentEl.createEl("details", {
      cls: "rss-keyword-filter-details",
    });
    feedRulesDetails.createEl("summary", {
      cls: "rss-keyword-filter-summary",
      text: "Rules",
    });
    const feedRulesBody = feedRulesDetails.createDiv({
      cls: "rss-keyword-filter-details-body",
    });

    const renderFeedFilterEditor = () => {
      renderKeywordFilterEditor({
        containerEl: feedRulesBody,
        state: {
          includeLogic: this.feedKeywordRules.includeLogic,
          rules: this.feedKeywordRules.rules,
          overrideGlobalRules: this.feedKeywordRules.overrideGlobalRules,
        },
        showOverrideToggle: true,
        onChange: (nextState) => {
          this.feedKeywordRules = {
            includeLogic: nextState.includeLogic,
            rules: nextState.rules,
            overrideGlobalRules: !!nextState.overrideGlobalRules,
          };
          renderFeedFilterEditor();
        },
      });
    };
    renderFeedFilterEditor();
  }

  /* ============================================
   * 6. Action Buttons
   * Save and Cancel actions
   * ============================================ */
  private renderActionButtons() {
    const btns = this.contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons rss-dashboard-modal-actions",
    });
    const saveBtn = btns.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button",
    });
    const cancelBtn = btns.createEl("button", {
      text: "Cancel",
      cls: "rss-dashboard-danger-button rss-dashboard-cancel-button",
    });

    saveBtn.onclick = () => {
      this.normalizeNitterUrl();
      if (!this.url) {
        new Notice("Feed URL cannot be empty");
        return;
      }
      const validation = isValidFeedTitle(this.title);
      if (!validation.valid) {
        new Notice(validation.error || "Invalid feed title");
        return;
      }

      const finalFolder = this.folderInput?.value || this.folder;
      void (async () => {
        if (this.plugin && finalFolder) {
          await this.plugin.ensureFolderExists(finalFolder);
        }
        const added = await this.onAdd({
          title: this.title,
          url: this.url,
          folder: finalFolder,
          autoDeleteDuration: this.autoDeleteDuration,
          maxItemsLimit: this.maxItemsLimit,
          scanInterval: this.scanInterval,
          feedKeywordRules: this.feedKeywordRules,
          customTemplate: this.customTemplate,
          excludeFromRefresh: this.excludeFromRefresh,
          customTags: this.customTags.length > 0 ? this.customTags : undefined,
        }).catch(() => {
          return false;
        });

        if (added !== false) {
          this.onSave();
          this.close();
        }
      })();
    };
    cancelBtn.onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
