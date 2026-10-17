import { App, Setting, Notice } from "obsidian";
import { AccessibleModal } from "../../utils/accessible-modal";
import type RssDashboardPlugin from "../../../main";
import type {
  FeedKeywordRulesSettings,
  FeedEncoding,
  Folder,
  Tag,
} from "../../types/types";
import { FolderSuggest } from "../../components/folder-suggest";
import {
  formatLatestEntryLabel,
  type FeedPreviewLoadResult,
  getDefaultFolderForResolvedFeed,
  getPreviewConversionNotice,
  resolveAndLoadPreview,
  shouldAutoAssignFolder,
} from "./feed-preview-loader";
import { renderKeywordFilterEditor } from "../../components/keyword-filter-editor";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { removeNativeModalCloseButton } from "../../utils/modal-close-button";
import { isValidFeedTitle } from "../../utils/validation";
import {
  renderSupportedFormatBadges,
  SupportedFeedType,
} from "./supported-format-badges";
import { decorateFolderSelectorInput } from "./folder-selector-field";
import { addInputClearButton } from "../../utils/input-clear-button";
import {
  renderAutoDeleteSetting,
  renderAutoTagsSetting,
  renderExcludeAndTemplateSettings,
  renderFeedEncodingSetting,
  renderMaxItemsSetting,
  renderScanIntervalSetting,
  type AddFeedOptionsState,
} from "./add-feed-options-section";

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
  feedEncoding?: FeedEncoding;
}

export class AddFeedModal extends AccessibleModal {
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
  private feedEncoding: FeedEncoding = "auto";
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
    this.autoDeleteDuration =
      this.plugin?.settings?.defaultAutoDeleteDuration ?? 30;
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

    window.setTimeout(() => {
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
      " rss-dashboard-modal rss-dashboard-modal-container rss-add-feed-modal";
    // Add mobile-specific class for proper styling on mobile/tablet
    if (shouldUseMobileSidebarLayout()) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
      // Remove Obsidian's default floating close button on mobile
      removeNativeModalCloseButton(this.modalEl);
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
  private async handleLoadFeed() {
    // Validate that URL is not empty
    if (!this.url || this.url.trim() === "") {
      this.showEmptyUrlError();
      return;
    }

    this.beginLoading();

    try {
      const preview = await resolveAndLoadPreview(this.url, {
        corsProxyEnabled: this.plugin?.settings?.corsProxyEnabled,
        corsProxyUrl: this.plugin?.settings?.corsProxyUrl,
        feedEncoding: this.feedEncoding,
      });

      this.applyPreviewFields(preview);
      this.renderPreviewStatus(preview);

      if (this.urlInput) {
        this.urlInput.addClass("loaded");
      }
      // Set the active badge based on detected type
      this.setActiveBadge(preview.detectedType);

      this.autoAssignFolderForPreview(preview);
    } catch (e) {
      this.showLoadError(e);
    } finally {
      // Reset loading state
      this.loadBtn.removeClass("loading");
      this.loadBtn.disabled = false;
    }
  }

  private showEmptyUrlError() {
    this.status = "❌ Please enter a feed URL";
    if (this.statusDiv) {
      this.statusDiv.textContent = this.status;
      this.statusDiv.removeClass("status-loading");
      this.statusDiv.removeClass("status-ok");
      this.statusDiv.addClass("status-error");
    }
  }

  private beginLoading() {
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
  }

  private applyPreviewFields(preview: FeedPreviewLoadResult) {
    this.url = preview.finalUrl;
    if (this.urlInput) this.urlInput.value = preview.finalUrl;

    this.title = preview.title;
    if (this.titleInput) this.titleInput.value = this.title;

    this.latestEntry = formatLatestEntryLabel(preview.latestPubDate);

    if (this.latestEntryDiv) {
      this.latestEntryDiv.textContent = this.latestEntry;
    }
  }

  private renderPreviewStatus(preview: FeedPreviewLoadResult) {
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
  }

  private autoAssignFolderForPreview(preview: FeedPreviewLoadResult) {
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
  }

  private showLoadError(e: unknown) {
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
        addInputClearButton(this.urlInput, {
          fill: true,
          label: "Clear feed URL",
        });
        this.urlInput.addEventListener("focus", () => this.urlInput.select());
        const handleEnter = (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.type === "keydown") {
              void this.handleLoadFeed();
            }
          } else if (e.key === "Escape" && e.type === "keydown") {
            this.close();
          }
        };
        this.urlInput.addEventListener("keydown", handleEnter, {
          capture: true,
        });
        this.urlInput.addEventListener("keypress", handleEnter, {
          capture: true,
        });
        this.urlInput.addEventListener("keyup", handleEnter, { capture: true });
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
        addInputClearButton(this.titleInput, {
          fill: true,
          label: "Clear title",
        });
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

    const state = this.createFeedOptionsState();
    renderFeedEncodingSetting(perFeedControlsBody, state);
    renderAutoDeleteSetting(perFeedControlsBody, state);
    renderMaxItemsSetting(perFeedControlsBody, state);
    renderScanIntervalSetting(perFeedControlsBody, state);

    // Template selection
    const savedTemplates =
      this.plugin?.settings?.articleSaving?.savedTemplates || [];
    renderExcludeAndTemplateSettings(
      perFeedControlsBody,
      state,
      savedTemplates,
    );

    const availableTags: Tag[] = this.plugin?.settings?.availableTags ?? [];
    renderAutoTagsSetting(perFeedControlsBody, state, availableTags);
  }

  private createFeedOptionsState(): AddFeedOptionsState {
    return {
      getFeedEncoding: () => this.feedEncoding,
      setFeedEncoding: (value) => {
        this.feedEncoding = value;
      },
      getAutoDeleteDuration: () => this.autoDeleteDuration,
      setAutoDeleteDuration: (value) => {
        this.autoDeleteDuration = value;
      },
      getMaxItemsLimit: () => this.maxItemsLimit,
      setMaxItemsLimit: (value) => {
        this.maxItemsLimit = value;
      },
      getScanInterval: () => this.scanInterval,
      setScanInterval: (value) => {
        this.scanInterval = value;
      },
      getExcludeFromRefresh: () => this.excludeFromRefresh,
      setExcludeFromRefresh: (value) => {
        this.excludeFromRefresh = value;
      },
      getCustomTemplate: () => this.customTemplate,
      setCustomTemplate: (value) => {
        this.customTemplate = value;
      },
      getCustomTags: () => this.customTags,
      setCustomTags: (value) => {
        this.customTags = value;
      },
    };
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
      cls: "rss-dashboard-modal-buttons rss-dashboard-modal-actions rss-add-feed-actions",
    });
    const saveBtn = btns.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button rss-add-feed-save-button",
    });
    const cancelBtn = btns.createEl("button", {
      text: "Cancel",
      cls: "rss-dashboard-cancel-button rss-add-feed-cancel-button",
    });

    saveBtn.onclick = () => {
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
          feedEncoding:
            this.feedEncoding === "windows-1251"
              ? this.feedEncoding
              : undefined,
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
