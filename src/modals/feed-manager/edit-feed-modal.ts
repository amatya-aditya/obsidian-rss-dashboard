import { Modal, App, Setting, Notice, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import type {
  Feed,
  FeedKeywordRulesSettings,
  SavedTemplate,
  Tag,
} from "../../types/types";
import { FolderSuggest } from "../../components/folder-suggest";
import { renderKeywordFilterEditor } from "../../components/keyword-filter-editor";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { isValidFeedTitle } from "../../utils/validation";
import {
  FEED_REFRESH_DISABLED_INTERVAL,
  getPerFeedRefreshIntervalDropdownValue,
} from "../../utils/refresh-intervals";
import {
  renderSupportedFormatBadges,
  SupportedFeedType,
} from "./supported-format-badges";
import {
  formatLatestEntryLabel,
  getDefaultFolderForResolvedFeed,
  getPreviewConversionNotice,
  resolveAndLoadPreview,
  shouldAutoAssignFolder,
} from "./feed-preview-loader";
import { MediaService } from "../../services/media-service";
import { copyTextToClipboard } from "../../utils/export-utils";
import { addTagMultiSelectControl } from "../../components/tag-multi-select-control";
import { TagApplicationConfirmModal } from "./tag-application-confirm-modal";
import {
  applyTagsToItems,
  removeTagsFromItemsByName,
} from "../../services/tag-applier";
import { resolveTagObjects } from "../../utils/tag-resolver";

const EMPTY_FEED_VALIDATION_WARNING =
  "Feed validation passed, however no content detected.";

interface EditFeedModalOptions {
  expandSection?: "per-feed" | "rules";
  highlightSection?: "per-feed" | "rules";
}

const PER_FEED_HIGHLIGHT_DURATION_MS = 3000;

export class EditFeedModal extends Modal {
  feed: Feed;
  plugin: RssDashboardPlugin;
  onSave: () => void;

  // --- State properties ---
  private url: string;
  private title: string;
  private folder: string;
  private status: string = "";
  private latestEntry: string = "-";
  private customTags: string[];
  private originalCustomTags: string[];
  private autoDeleteDuration: number;
  private maxItemsLimit: number;
  private scanInterval: number;
  private excludeFromRefresh: boolean;
  private customTemplate: string;
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
    plugin: RssDashboardPlugin,
    feed: Feed,
    onSave: () => void,
    private options?: EditFeedModalOptions,
  ) {
    super(app);
    this.feed = feed;
    this.plugin = plugin;
    this.onSave = onSave;

    // Initialize state from feed
    this.url = this.feed.url;
    this.title = this.feed.title;
    this.folder = this.feed.folder;

    this.originalCustomTags = [...(this.feed.customTags ?? [])];
    this.customTags = [...(this.feed.customTags ?? [])];

    this.autoDeleteDuration = this.feed.autoDeleteDuration || 0;
    this.maxItemsLimit =
      this.feed.maxItemsLimit ?? this.plugin.settings.maxItems;
    this.scanInterval = this.feed.scanInterval ?? 0;
    this.excludeFromRefresh = !!this.feed.excludeFromRefresh;
    this.customTemplate = this.feed.customTemplate || "";

    this.feedKeywordRules = this.feed.keywordRules
      ? {
          overrideGlobalRules: this.feed.keywordRules.overrideGlobalRules,
          includeLogic: this.feed.keywordRules.includeLogic,
          rules: [...this.feed.keywordRules.rules],
        }
      : {
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

    window.setTimeout(() => {
      this.titleInput?.focus();
      this.titleInput?.select();
    }, 0);
  }

  /* ============================================
   * 1. Modal Setup & Header
   * Initializes modal container and renders titles
   * ============================================ */
  private setupModalContainer() {
    const isMobile = shouldUseMobileSidebarLayout();
    this.modalEl.className +=
      " rss-dashboard-modal rss-dashboard-modal-container";

    if (isMobile) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
      this.modalEl.addClass("hide-default-close-button");
    }

    this.contentEl.empty();
  }

  private renderHeader() {
    new Setting(this.contentEl).setName("Edit feed").setHeading();
    const subtitle = this.contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent = "Modify feed settings and configuration";
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
    this.normalizeNitterUrl();

    // Set loading state
    this.status = "\u23F3 Loading...";
    this.loadBtn.addClass("loading");
    this.loadBtn.disabled = true;
    this.clearActiveBadge();

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

      const conversionNotice = getPreviewConversionNotice(preview);

      this.url = preview.finalUrl;
      if (this.urlInput) this.urlInput.value = this.url;

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
      this.setActiveBadge(preview.detectedType);

      const currentFolder = this.folderInput?.value || "";
      if (
        this.folderInput &&
        shouldAutoAssignFolder(currentFolder, this.plugin?.settings?.media)
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
      this.status = "Error loading feed";
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
        text.setValue(this.url).onChange((v) => (this.url = v));
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
          window.setTimeout(this.normalizeNitterUrl, 0);
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

    const sourceSetting = new Setting(this.contentEl).setName("Feed source");
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
        this.titleInput.addEventListener("focus", () =>
          this.titleInput.select(),
        );
        this.titleInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            this.folderInput?.focus();
          } else if (e.key === "Escape") {
            this.close();
          }
        });
      });
    titleSetting.settingEl.addClass("rss-feed-form-row");

    const latestEntrySetting = new Setting(this.contentEl).setName(
      "Latest entry",
    );
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
        this.folderInput.addEventListener("focus", () =>
          this.folderInput.select(),
        );

        new FolderSuggest(
          this.app,
          this.folderInput,
          this.plugin.settings.folders,
        );
      });
    folderSetting.settingEl.addClass("rss-feed-form-row");
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

    const highlightElement = (el: HTMLElement, className: string): void => {
      el.addClass(className);
      window.setTimeout(() => {
        el.removeClass(className);
      }, PER_FEED_HIGHLIGHT_DURATION_MS);
    };

    if (this.options?.expandSection === "per-feed") {
      perFeedControlsDetails.open = true;
    }
    if (this.options?.highlightSection === "per-feed") {
      highlightElement(
        perFeedControlsDetails,
        "rss-per-feed-controls-highlight",
      );
      window.requestAnimationFrame(() => {
        perFeedControlsDetails.scrollIntoView({ block: "nearest" });
      });
    }

    const availableTags: Tag[] = this.plugin?.settings.availableTags ?? [];

    const inheritedTags = MediaService.getInheritedTagsAndCategory(
      this.feed,
      availableTags,
      this.plugin?.settings.media,
    ).tags;

    if (inheritedTags.length > 0) {
      const inheritedTagsSetting = new Setting(perFeedControlsBody)
        .setName("Inherited auto-tags")
        .setDesc(
          "Global tags applied automatically based on the feed type and settings. Configure these in the 'auto tagging' settings tab.",
        );

      const tagsList = inheritedTagsSetting.controlEl.createDiv({
        cls: "rss-dashboard-inherited-tags",
      });

      inheritedTags.forEach((tag) => {
        const tagEl = tagsList.createSpan({
          cls: "rss-dashboard-tag-badge",
          text: tag.name,
        });
        tagEl.setCssProps({ "--tag-color": tag.color });
      });
    }

    const localStorageAddressResult = this.plugin.getFeedLocalStorageAddress?.(
      this.feed,
    ) ?? {
      mode: this.plugin.settings.storageMode,
      address: "data.json",
    };
    const hasResolvedLocalAddress =
      localStorageAddressResult.address.length > 0;
    const storageDescription = "Shows where this feed is stored.";
    const feedIdText = this.feed.feedId?.trim()
      ? this.feed.feedId
      : "Not assigned";
    const storageStatusText =
      localStorageAddressResult.mode !== "legacy-json"
        ? hasResolvedLocalAddress
          ? "Stored in shard storage"
          : "Shard storage selected (address unavailable)"
        : "Stored in legacy data.json";

    const localAddressSetting = new Setting(perFeedControlsBody)
      .setName("Local storage address")
      .setDesc(storageDescription);
    const localAddressRow = localAddressSetting.controlEl.createDiv({
      cls: "rss-edit-feed-storage-address-row",
    });
    const localAddressTextGroup = localAddressRow.createDiv({
      cls: "rss-edit-feed-storage-address-text",
    });
    localAddressTextGroup.createDiv({
      cls: "rss-edit-feed-storage-status",
      text: storageStatusText,
    });
    localAddressTextGroup.createDiv({
      cls: "rss-edit-feed-storage-feed-id",
      text: `Feed ID: ${feedIdText}`,
    });

    const copyStorageAddressButton = localAddressRow.createDiv({
      cls: "clickable-icon rss-edit-feed-storage-copy-button",
      attr: {
        role: "button",
        tabindex: "0",
        title: "Copy local storage address",
        "aria-label": "Copy local storage address",
      },
    });
    setIcon(copyStorageAddressButton, "copy");

    const copyLocalAddress = () => {
      if (!hasResolvedLocalAddress) {
        new Notice("Storage address unavailable for this feed.");
        return;
      }

      void (async () => {
        const result = await copyTextToClipboard(
          localStorageAddressResult.address,
        );
        if (result === "copied") {
          new Notice("Copied local storage address.");
          return;
        }

        new Notice("Failed to copy local storage address.");
      })();
    };

    copyStorageAddressButton.addEventListener("click", copyLocalAddress);
    copyStorageAddressButton.addEventListener(
      "keydown",
      (evt: KeyboardEvent) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          copyLocalAddress();
        }
      },
    );

    const autoDeleteSetting = new Setting(perFeedControlsBody)
      .setName("Auto delete articles duration")
      .setDesc(
        "Days to keep articles before auto-delete. This will also limit the timeframe window for shown articles.",
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
          this.autoDeleteDuration === 0
            ? "0"
            : [1, 3, 7, 14, 30, 60, 90, 180, 365].includes(
                  this.autoDeleteDuration,
                )
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
                this.autoDeleteDuration > 0
                  ? this.autoDeleteDuration.toString()
                  : "";
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
              autoDeleteCustomInput.removeClass("visible");
              autoDeleteCustomInput.addClass("hidden");
            }
            this.autoDeleteDuration = parseInt(value) || 0;
          }
        });
    });

    if (this.options?.highlightSection === "per-feed") {
      highlightElement(
        autoDeleteSetting.settingEl,
        "rss-per-feed-auto-delete-highlight",
      );
      window.requestAnimationFrame(() => {
        autoDeleteSetting.settingEl.scrollIntoView({ block: "nearest" });
      });
    }

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
              maxItemsCustomInput.removeClass("visible");
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
              scanIntervalCustomInput.removeClass("visible");
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
      this.plugin.settings.articleSaving.savedTemplates || [];

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
        "Additional tags applied automatically to new articles from this feed (single feed override)",
      );

    addTagMultiSelectControl({
      setting: autoTagSetting,
      availableTags,
      selectedTagNames: this.customTags,
      triggerEmptyLabel: "None",
      menuTitle: "Select auto-tags",
      onChange: (selected) => {
        this.customTags = selected;
      },
    });
  }

  /* ============================================
   * 5. Keyword Rules
   * Rendering the keyword filter editor
   * ============================================ */
  private renderKeywordRulesSection() {
    const feedFiltersDetails = this.contentEl.createEl("details", {
      cls: "rss-keyword-filter-details",
    });
    feedFiltersDetails.createEl("summary", {
      cls: "rss-keyword-filter-summary",
      text: "Rules",
    });
    const feedFiltersBody = feedFiltersDetails.createDiv({
      cls: "rss-keyword-filter-details-body",
    });

    const highlightElement = (el: HTMLElement, className: string): void => {
      el.addClass(className);
      window.setTimeout(() => {
        el.removeClass(className);
      }, PER_FEED_HIGHLIGHT_DURATION_MS);
    };

    if (this.options?.expandSection === "rules") {
      feedFiltersDetails.open = true;
    }
    if (this.options?.highlightSection === "rules") {
      highlightElement(feedFiltersDetails, "rss-per-feed-controls-highlight");
      window.requestAnimationFrame(() => {
        feedFiltersDetails.scrollIntoView({ block: "nearest" });
      });
    }

    const renderFeedFilterEditor = () => {
      renderKeywordFilterEditor({
        containerEl: feedFiltersBody,
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
    const btns = this.contentEl.createDiv(
      "rss-dashboard-modal-buttons rss-dashboard-modal-actions",
    );
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
      const validation = isValidFeedTitle(this.title);
      if (!validation.valid) {
        new Notice(validation.error || "Invalid feed title");
        return;
      }

      void (async () => {
        // --- Determine if customTags changed ---
        const tagsChanged =
          this.customTags.length !== this.originalCustomTags.length ||
          this.customTags.some((t, i) => t !== this.originalCustomTags[i]);

        if (tagsChanged) {
          const confirmModal = new TagApplicationConfirmModal(this.app);
          const choice = confirmModal.waitForClose();
          confirmModal.open();
          const result = await choice;

          if (result === "cancel_save") {
            return;
          }

          if (result === "apply_existing") {
            const oldSet = new Set(this.originalCustomTags);
            const newSet = new Set(this.customTags);
            const removedNames = this.originalCustomTags.filter(
              (n) => !newSet.has(n),
            );
            const addedNames = this.customTags.filter((n) => !oldSet.has(n));
            removeTagsFromItemsByName(this.feed.items, removedNames);
            const availableTags = this.plugin.settings.availableTags ?? [];
            const addedTags = resolveTagObjects(addedNames, availableTags);
            applyTagsToItems(this.feed.items, addedTags);
          }

          this.feed.customTags = this.customTags;
        }

        const oldTitle = this.feed.title;
        const previousAutoDeleteDuration =
          typeof this.feed.autoDeleteDuration === "number"
            ? this.feed.autoDeleteDuration
            : 0;
        this.feed.title = this.title;
        this.feed.url = this.url;
        const finalFolder = this.folderInput?.value || this.folder;
        this.feed.folder = finalFolder;

        if (finalFolder) {
          await this.plugin.ensureFolderExists(finalFolder);
        }
        this.feed.autoDeleteDuration = this.autoDeleteDuration;

        // Update feedTitle for all articles in this feed when the title changes
        if (oldTitle !== this.title) {
          for (const item of this.feed.items) {
            item.feedTitle = this.title;
          }
        }

        const newMaxItemsLimit = Number.isFinite(this.maxItemsLimit)
          ? this.maxItemsLimit
          : this.plugin.settings.maxItems;

        this.feed.maxItemsLimit = newMaxItemsLimit;
        this.feed.scanInterval = this.scanInterval;
        this.feed.excludeFromRefresh = this.excludeFromRefresh;
        this.feed.customTemplate = this.customTemplate || undefined;
        this.feed.keywordRules = {
          overrideGlobalRules: this.feedKeywordRules.overrideGlobalRules,
          includeLogic: this.feedKeywordRules.includeLogic,
          rules: this.feedKeywordRules.rules,
        };
        const didAutoDeleteDurationChange =
          previousAutoDeleteDuration !== this.autoDeleteDuration;

        if (newMaxItemsLimit > 0 && this.feed.items.length > newMaxItemsLimit) {
          this.feed.items.sort(
            (a, b) =>
              new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
          );
          this.feed.items = this.feed.items.slice(0, newMaxItemsLimit);
          new Notice(
            `Feed updated and trimmed to ${newMaxItemsLimit} articles`,
          );
        } else {
          new Notice("Feed updated");
        }
        await this.plugin.saveSettings();
        if (didAutoDeleteDurationChange) {
          await this.plugin.refreshSelectedFeed?.(this.feed);
        }
        this.plugin.notifyFiltersUpdated({
          source: "edit-feed-modal",
          feedUrl: this.feed.url,
          timestamp: Date.now(),
        });
        this.close();
        this.onSave();
      })();
    };
    cancelBtn.onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
