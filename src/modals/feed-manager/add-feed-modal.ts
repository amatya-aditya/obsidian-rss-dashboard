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
import { renderSupportedFormatBadges } from "./supported-format-badges";
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
  }
  onOpen() {
    const { contentEl } = this;
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
    contentEl.empty();
    new Setting(contentEl).setName("Add feed").setHeading();

    // Add subtitle
    const subtitle = contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent =
      "Add a new RSS, podcast, or YouTube feed to your dashboard";

    let url = this.initialUrl;
    let title = this.initialTitle;
    let status = "";
    let latestEntry = "-";
    let folder = this.defaultFolder;
    let titleInput: HTMLInputElement;
    let urlInput: HTMLInputElement;
    let folderInput!: HTMLInputElement;
    let loadBtn: HTMLButtonElement;
    const refs: {
      statusDiv?: HTMLDivElement;
      latestEntryDiv?: HTMLDivElement;
    } = {};

    const normalizeNitterUrl = (): void => {
      const candidate = (urlInput?.value || url || "").trim();
      const normalized = MediaService.normalizeNitterUrlToRss(candidate);
      if (!normalized) return;

      url = normalized;
      if (urlInput) urlInput.value = normalized;
    };

    const urlSetting = new Setting(contentEl)
      .setName("Feed URL")
      .addText((text) => {
        text.onChange((v) => (url = v));
        text.setValue(url);
        urlInput = text.inputEl;
        urlInput.autocomplete = "off";
        urlInput.spellcheck = false;
        urlInput.placeholder = "https://example.com/feed.xml";
        urlInput.addClass("feed-url-input");
        urlInput.addEventListener("focus", () => urlInput.select());
        urlInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            titleInput?.focus();
          } else if (e.key === "Escape") {
            this.close();
          }
        });
        urlInput.addEventListener("blur", normalizeNitterUrl);
        urlInput.addEventListener("paste", () => {
          activeWindow.setTimeout(normalizeNitterUrl, 0);
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Load");
        btn.buttonEl.addClass("rss-dashboard-load-button");
        loadBtn = btn.buttonEl;
        btn.onClick(() => {
          void (async () => {
            // Validate that URL is not empty
            if (!url || url.trim() === "") {
              status = "\u274C Please enter a feed URL";
              if (refs.statusDiv) {
                refs.statusDiv.textContent = status;
                refs.statusDiv.removeClass("status-loading");
                refs.statusDiv.removeClass("status-ok");
                refs.statusDiv.addClass("status-error");
              }
              return;
            }

            normalizeNitterUrl();

            // Set loading state
            status = "\u23F3 Loading...";
            loadBtn.addClass("loading");
            loadBtn.disabled = true;
            clearActiveBadge(); // Clear any previous active states
            if (refs.statusDiv) {
              refs.statusDiv.textContent = status;
              refs.statusDiv.removeClass("rss-dashboard-status-warning");
              refs.statusDiv.removeClass("status-ok");
              refs.statusDiv.removeClass("status-error");
              refs.statusDiv.addClass("status-loading");
            }
            try {
              const preview = await resolveAndLoadPreview(url, {
                corsProxyEnabled: this.plugin?.settings?.corsProxyEnabled,
                corsProxyUrl: this.plugin?.settings?.corsProxyUrl,
              });

              url = preview.finalUrl;
              if (urlInput) urlInput.value = preview.finalUrl;

              title = preview.title;
              if (titleInput) titleInput.value = title;
              latestEntry = formatLatestEntryLabel(preview.latestPubDate);

              if (refs.latestEntryDiv)
                refs.latestEntryDiv.textContent = latestEntry;

              if (refs.statusDiv) {
                refs.statusDiv.removeClass("status-loading");
                refs.statusDiv.removeClass("status-error");
                refs.statusDiv.removeClass("status-ok");
                refs.statusDiv.removeClass("rss-dashboard-status-warning");

                const conversionNotice = getPreviewConversionNotice(preview);

                if (preview.hasEntries) {
                  status = "OK";
                  refs.statusDiv.textContent = `\u2705 OK${conversionNotice}`;
                  refs.statusDiv.addClass("status-ok");
                } else {
                  status = EMPTY_FEED_VALIDATION_WARNING;
                  refs.statusDiv.textContent = `⚠ ${EMPTY_FEED_VALIDATION_WARNING}${conversionNotice}`;
                  refs.statusDiv.addClass("rss-dashboard-status-warning");
                }
              }

              if (urlInput) {
                urlInput.addClass("loaded");
              }
              // Set the active badge based on detected type
              setActiveBadge(preview.detectedType);

              const currentFolder = folderInput?.value || "";
              if (
                folderInput &&
                shouldAutoAssignFolder(
                  currentFolder,
                  this.plugin?.settings?.media,
                )
              ) {
                const nextFolder = getDefaultFolderForResolvedFeed(
                  preview,
                  this.plugin?.settings?.media,
                );
                folder = nextFolder;
                folderInput.value = nextFolder;
              }
            } catch (e) {
              const errorMsg = e instanceof Error ? e.message : String(e);
              status = `Error: ${errorMsg}`;
              latestEntry = "-";
              if (refs.latestEntryDiv)
                refs.latestEntryDiv.textContent = latestEntry;
              console.error("Feed load error:", e);
              // Error state
              if (refs.statusDiv) {
                refs.statusDiv.textContent = `\u274C ${errorMsg}`;
                refs.statusDiv.removeClass("status-loading");
                refs.statusDiv.removeClass("status-ok");
                refs.statusDiv.removeClass("rss-dashboard-status-warning");
                refs.statusDiv.addClass("status-error");
              }
            } finally {
              // Reset loading state
              loadBtn.removeClass("loading");
              loadBtn.disabled = false;
            }
          })();
        });
      });

    urlSetting.settingEl.addClass("rss-feed-form-row");
    urlSetting.settingEl.addClass("rss-feed-form-row-url");

    const sourceSetting = new Setting(contentEl).setName("Feed Source");
    sourceSetting.settingEl.addClass("rss-feed-form-row");
    sourceSetting.settingEl.addClass("rss-feed-source-row");

    const { clearActiveBadge, setActiveBadge } = renderSupportedFormatBadges(
      sourceSetting.controlEl,
    );

    const titleSetting = new Setting(contentEl)
      .setName("Title")
      .addText((text) => {
        text.setValue(title).onChange((v) => (title = v));
        titleInput = text.inputEl;
        titleInput.autocomplete = "off";
        titleInput.spellcheck = false;
        titleInput.addClass("title-input");
        titleInput.addEventListener("focus", () => titleInput.select());
        titleInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            folderInput?.focus();
          } else if (e.key === "Escape") {
            this.close();
          }
        });
      });
    titleSetting.settingEl.addClass("rss-feed-form-row");

    const latestEntrySetting = new Setting(contentEl).setName("Latest entry");
    refs.latestEntryDiv = latestEntrySetting.controlEl.createDiv({
      text: latestEntry,
      cls: "add-feed-latest-entry",
    });

    const statusSetting = new Setting(contentEl).setName("Status");
    refs.statusDiv = statusSetting.controlEl.createDiv({
      text: status,
      cls: "add-feed-status",
    });

    const folderSetting = new Setting(contentEl)
      .setName("Folder")
      .addText((text) => {
        text.setValue(folder).setPlaceholder("Type or select folder...");
        folderInput = text.inputEl;
        folderInput.autocomplete = "off";
        folderInput.spellcheck = false;
        folderInput.addClass("folder-input");
        folderInput.addEventListener("focus", () => folderInput.select());

        new FolderSuggest(this.app, folderInput, this.folders);
      });
    decorateFolderSelectorInput(folderSetting, folderInput);

    // --- Auto-tag multi-select ---
    let customTags: string[] = [];
    const availableTags: Tag[] = this.plugin?.settings?.availableTags ?? [];

    const autoTagSetting = new Setting(contentEl)
      .setName("Auto-tag")
      .setDesc("Automatically apply these tags to new articles from this feed");

    addTagMultiSelectControl({
      setting: autoTagSetting,
      availableTags,
      selectedTagNames: [],
      triggerEmptyLabel: "None",
      menuTitle: "Select auto-tags",
      onChange: (selectedNames) => {
        customTags = selectedNames;
      },
    });

    const perFeedControlsDetails = contentEl.createEl("details", {
      cls: "rss-keyword-filter-details rss-per-feed-controls-details",
    });
    perFeedControlsDetails.createEl("summary", {
      cls: "rss-keyword-filter-summary",
      text: "Per feed control options",
    });
    const perFeedControlsBody = perFeedControlsDetails.createDiv({
      cls: "rss-keyword-filter-details-body",
    });

    let autoDeleteDuration =
      this.plugin?.settings?.defaultAutoDeleteDuration ?? 30;
    let maxItemsLimit = this.plugin?.settings?.maxItems ?? 50;
    let scanInterval = 0;
    let excludeFromRefresh = false;

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
          autoDeleteDuration === 0
            ? "0"
            : [1, 3, 7, 14, 30, 60, 90, 180, 365].includes(autoDeleteDuration)
              ? autoDeleteDuration.toString()
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
                autoDeleteDuration > 0 ? autoDeleteDuration.toString() : "";
              autoDeleteCustomInput.addEventListener("change", (evt: Event) => {
                const target = evt.target as HTMLInputElement;
                autoDeleteDuration = parseInt(target.value) || 0;
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
            autoDeleteDuration = parseInt(value) || 0;
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
          maxItemsLimit === 0
            ? "0"
            : [10, 25, 50, 100, 200, 500, 1000].includes(maxItemsLimit)
              ? maxItemsLimit.toString()
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
                maxItemsLimit = parseInt(target.value) || 0;
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
            maxItemsLimit = parseInt(value) || 0;
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
        .setValue(getPerFeedRefreshIntervalDropdownValue(scanInterval))
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
                scanInterval > 0 ? scanInterval.toString() : "";
              scanIntervalCustomInput.addEventListener(
                "change",
                (evt: Event) => {
                  const target = evt.target as HTMLInputElement;
                  scanInterval = parseInt(target.value, 10) || 0;
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
            scanInterval = parseInt(value, 10) || 0;
          }
        });
    });

    new Setting(perFeedControlsBody)
      .setName("Exclude from refresh")
      .setDesc(
        "Skip this feed during automatic refresh and bulk refresh actions. You can still refresh it directly from its feed view.",
      )
      .addToggle((toggle) => {
        toggle.setValue(excludeFromRefresh).onChange((value) => {
          excludeFromRefresh = value;
        });
      });

    // Template selection
    let customTemplate = "";
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
        dropdown.setValue(customTemplate);
        dropdown.onChange((value) => {
          customTemplate = value;
        });
      });

    let feedKeywordRules: FeedKeywordRulesSettings = {
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [],
    };

    const feedRulesDetails = contentEl.createEl("details", {
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
          includeLogic: feedKeywordRules.includeLogic,
          rules: feedKeywordRules.rules,
          overrideGlobalRules: feedKeywordRules.overrideGlobalRules,
        },
        showOverrideToggle: true,
        onChange: (nextState) => {
          feedKeywordRules = {
            includeLogic: nextState.includeLogic,
            rules: nextState.rules,
            overrideGlobalRules: !!nextState.overrideGlobalRules,
          };
          renderFeedFilterEditor();
        },
      });
    };
    renderFeedFilterEditor();

    const btns = contentEl.createDiv({
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
      normalizeNitterUrl();
      if (!url) {
        new Notice("Feed URL cannot be empty");
        return;
      }
      const validation = isValidFeedTitle(title);
      if (!validation.valid) {
        new Notice(validation.error || "Invalid feed title");
        return;
      }

      const finalFolder = folderInput?.value || folder;
      void (async () => {
        if (this.plugin && finalFolder) {
          await this.plugin.ensureFolderExists(finalFolder);
        }
        const added = await this.onAdd({
          title,
          url,
          folder: finalFolder,
          autoDeleteDuration,
          maxItemsLimit,
          scanInterval,
          feedKeywordRules,
          customTemplate,
          excludeFromRefresh,
          customTags: customTags.length > 0 ? customTags : undefined,
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

    activeWindow.setTimeout(() => {
      urlInput?.focus();
      urlInput?.select();
    }, 0);
  }
  onClose() {
    this.contentEl.empty();
  }
}
