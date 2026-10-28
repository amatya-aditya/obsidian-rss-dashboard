import { App, Setting, Notice, setIcon } from "obsidian";
import { AccessibleModal } from "../../utils/accessible-modal";
import type RssDashboardPlugin from "../../../main";
import type {
  Feed,
  FeedEncoding,
  FeedKeywordRulesSettings,
} from "../../types/types";
import { FolderSuggest } from "../../components/folder-suggest";
import { renderKeywordFilterEditor } from "../../components/keyword-filter-editor";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { removeNativeModalCloseButton } from "../../utils/modal-close-button";
import { settingsUiCompatibility } from "../../settings/settings-ui-compat";
import { isValidFeedTitle } from "../../utils/validation";
import { renderSupportedFormatBadges } from "./supported-format-badges";
import type { SupportedFeedType } from "./supported-format-badges";
import { renderFeedErrorKinds } from "../../components/feed-error-section";
import { getFeedErrorDetail } from "../../utils/feed-error";
import { addInputClearButton } from "../../utils/input-clear-button";
import { decorateFolderSelectorInput } from "./folder-selector-field";
import { loadEditFeed } from "./edit-feed-load";
import type { EditFeedLoadHost } from "./edit-feed-load";
import { renderEditFeedOptionsSection } from "./edit-feed-options-section";
import type { EditFeedOptionsHost } from "./edit-feed-options-section";
import { saveEditedFeed } from "./edit-feed-save";
import type { EditFeedSaveHost } from "./edit-feed-save";

/**
 * The edit modal's read-only label for the refresh kind. The dialog uses the
 * shorter `Refresh failed`; this surface names it as the stored last attempt so
 * it reads apart from the live `Status` line above it.
 */
const STORED_REFRESH_FAILURE_LABEL = "Last refresh failed";

export interface EditFeedModalOptions {
  expandSection?: "per-feed" | "rules";
  highlightSection?: "per-feed" | "rules";
  onDelete?: () => void;
}

const PER_FEED_HIGHLIGHT_DURATION_MS = 3000;

export class EditFeedModal extends AccessibleModal {
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
  private feedEncoding: FeedEncoding;
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
    this.feedEncoding = this.feed.feedEncoding ?? "auto";

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
      " rss-dashboard-modal rss-dashboard-modal-container rss-edit-feed-modal";

    if (isMobile) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
      // Remove Obsidian's default floating close button on mobile
      removeNativeModalCloseButton(this.modalEl);
    }

    this.contentEl.empty();
  }

  private renderHeader() {
    new Setting(this.contentEl).setName("Edit feed").setHeading();
    const subtitle = this.contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent = "Modify feed settings and configuration";
  }

  private handleLoadFeed(): Promise<void> {
    return loadEditFeed(this.asLoadHost());
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

    this.renderStoredFeedErrors();

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
    decorateFolderSelectorInput(folderSetting, this.folderInput);
    folderSetting.settingEl.addClass("rss-feed-form-row");
  }

  /**
   * The feed's stored feed errors, exactly as stored. A debugging surface, not
   * a diagnostics runner: it reads persisted state and never re-checks the
   * feed, so it survives a restart without holding the modal on a network
   * round-trip. The Load action above owns the `Status` line; this is separate.
   */
  private renderStoredFeedErrors(): void {
    const detail = getFeedErrorDetail(this.feed);
    if (!detail.refreshError && !detail.importError) return;

    const section = this.contentEl.createDiv({
      cls: "rss-dashboard-feed-error-section",
    });
    renderFeedErrorKinds(section, detail, {
      refreshLabel: STORED_REFRESH_FAILURE_LABEL,
    });
  }

  /* ============================================
   * 4. Feed Options (Per-feed Overrides)
   * Auto-delete, limits, custom auto-tags, templates
   * ============================================ */
  private renderFeedOptionsSection() {
    renderEditFeedOptionsSection(this.contentEl, this.createFeedOptionsHost());
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
      "rss-dashboard-modal-buttons rss-dashboard-modal-actions rss-edit-feed-actions",
    );
    const saveBtn = btns.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button rss-edit-feed-save-button",
    });
    const cancelBtn = btns.createEl("button", {
      text: "Cancel",
      cls: "rss-dashboard-cancel-button rss-edit-feed-cancel-button",
    });
    const deleteBtn = btns.createEl("button", {
      cls: "rss-dashboard-danger-button rss-edit-feed-delete-button",
      attr: { "aria-label": "Delete feed" },
    });
    const deleteIcon = deleteBtn.createSpan({
      cls: "rss-edit-feed-delete-icon",
    });
    setIcon(deleteIcon, "trash");
    deleteBtn.createSpan({ text: "Delete" });

    saveBtn.onclick = () => {
      const validation = isValidFeedTitle(this.title);
      if (!validation.valid) {
        new Notice(validation.error || "Invalid feed title");
        return;
      }
      if (
        this.url !== this.feed.url &&
        this.plugin.settings.feeds.some(
          (other) => other !== this.feed && other.url === this.url,
        )
      ) {
        new Notice("This feed URL already exists");
        return;
      }

      void saveEditedFeed(this.asSaveHost());
    };
    cancelBtn.onclick = () => this.close();
    deleteBtn.onclick = () => this.handleDeleteFeed();
  }

  /**
   * The Load and Save modules read the modal's fields by name. The modal is
   * the host so each read sees the current field, as the inline code did.
   */
  private asLoadHost(): EditFeedLoadHost {
    return this as unknown as EditFeedLoadHost;
  }

  private asSaveHost(): EditFeedSaveHost {
    return this as unknown as EditFeedSaveHost;
  }

  private createFeedOptionsHost(): EditFeedOptionsHost {
    return {
      app: this.app,
      plugin: this.plugin,
      feed: this.feed,
      options: this.options,
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

  private handleDeleteFeed(): void {
    const confirmModal = new AccessibleModal(this.app);
    confirmModal.modalEl.addClass("rss-dashboard-confirm-modal");
    const { contentEl } = confirmModal;
    contentEl.empty();

    new Setting(contentEl).setName("Delete feed").setHeading();
    contentEl.createEl("p", {
      text: `Are you sure you want to delete the feed "${this.feed.title}"?`,
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          confirmModal.close();
        }),
      )
      .addButton((btn) => {
        btn.setButtonText("Delete");
        settingsUiCompatibility.markDestructive(btn);
        btn.onClick(() => {
          confirmModal.close();
          this.close();

          void (async () => {
            if (this.options?.onDelete) {
              this.options.onDelete();
            } else {
              this.plugin.settings.feeds = this.plugin.settings.feeds.filter(
                (f: Feed) => f !== this.feed,
              );
              await this.plugin.removeCachedImagesForDeletedFeed?.(this.feed);
              await this.plugin.saveSettings();
              this.onSave();
            }
            new Notice(`Feed "${this.feed.title}" deleted`);
          })();
        });
      });

    confirmModal.open();
  }

  onClose() {
    this.contentEl.empty();
  }
}
