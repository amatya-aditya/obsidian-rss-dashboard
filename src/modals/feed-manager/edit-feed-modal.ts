import { Modal, App, Setting, Notice } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import type {
  Feed,
  FeedKeywordRulesSettings,
  SavedTemplate,
} from "../../types/types";
import { FolderSuggest } from "../../components/folder-suggest";
import { renderKeywordFilterEditor } from "../../components/keyword-filter-editor";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { isValidFeedTitle } from "../../utils/validation";
import { renderSupportedFormatBadges } from "./supported-format-badges";
import { formatLatestEntryLabel, resolveAndLoadPreview } from "./feed-preview-loader";
import { MediaService } from "../../services/media-service";

const EMPTY_FEED_VALIDATION_WARNING =
  "Feed validation passed, however no content detected.";

export class EditFeedModal extends Modal {
  feed: Feed;
  plugin: RssDashboardPlugin;
  onSave: () => void;
  constructor(
    app: App,
    plugin: RssDashboardPlugin,
    feed: Feed,
    onSave: () => void,
  ) {
    super(app);
    this.feed = feed;
    this.plugin = plugin;
    this.onSave = onSave;
  }
  onOpen() {
    const { contentEl } = this;
    const isMobile = shouldUseMobileSidebarLayout();

    this.modalEl.className +=
      " rss-dashboard-modal rss-dashboard-modal-container";
    // Add mobile-specific class for proper styling on mobile/tablet
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
      // Hide default close button on mobile in favor of custom header button
      this.modalEl.addClass("hide-default-close-button");
    }

    contentEl.empty();
    new Setting(contentEl).setName("Edit feed").setHeading();

    // Add subtitle
    const subtitle = contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent = "Modify feed settings and configuration";

    const { url: feedUrl, title: feedTitle, folder: feedFolder } = this.feed;
    let url = feedUrl;
    let title = feedTitle;
    let folder = feedFolder;
    let status = "";
    let latestEntry = "-";
    let titleInput: HTMLInputElement;
    let urlInput: HTMLInputElement;
    let folderInput: HTMLInputElement;
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
        text.setValue(url).onChange((v) => (url = v));
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
          window.setTimeout(normalizeNitterUrl, 0);
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Load");
        btn.buttonEl.addClass("rss-dashboard-load-button");
        loadBtn = btn.buttonEl;
        btn.onClick(() => {
          void (async () => {
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

              const conversionNotice = preview.isXConversion
                ? " (X > nitter conversion)"
                : "";

              url = preview.finalUrl;
              if (urlInput) urlInput.value = url;

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
              setActiveBadge(preview.detectedType);
            } catch (e) {
              const errorMsg = e instanceof Error ? e.message : String(e);
              status = "Error loading feed";
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

    const { clearActiveBadge, setActiveBadge } = renderSupportedFormatBadges(
      urlSetting.descEl,
    );

    new Setting(contentEl).setName("Title").addText((text) => {
      text.setValue(title).onChange((v) => (title = v));
      titleInput = text.inputEl;
      titleInput.autocomplete = "off";
      titleInput.spellcheck = false;
      titleInput.addEventListener("focus", () => titleInput.select());
      titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          folderInput?.focus();
        } else if (e.key === "Escape") {
          this.close();
        }
      });
    });

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

    new Setting(contentEl).setName("Folder").addText((text) => {
      text.setValue(folder).setPlaceholder("Type or select folder...");
      folderInput = text.inputEl;
      folderInput.autocomplete = "off";
      folderInput.spellcheck = false;
      folderInput.addEventListener("focus", () => folderInput.select());

      new FolderSuggest(this.app, folderInput, this.plugin.settings.folders);
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

    let autoDeleteDuration = this.feed.autoDeleteDuration || 0;
    let maxItemsLimit =
      this.feed.maxItemsLimit ?? this.plugin.settings.maxItems;
    let scanInterval = this.feed.scanInterval || 0;

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
      .setName("Scan interval")
      .setDesc("Custom scan interval in minutes");

    let scanIntervalCustomInput: HTMLInputElement | null = null;

    scanIntervalSetting.addDropdown((dropdown) => {
      dropdown
        .addOption("0", "Use global setting")
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
          scanInterval === 0
            ? "0"
            : [5, 10, 15, 30, 60, 120, 240, 480, 720, 1440].includes(
                  scanInterval,
                )
              ? scanInterval.toString()
              : "custom",
        )
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
              scanIntervalCustomInput.addEventListener(
                "change",
                (evt: Event) => {
                  const target = evt.target as HTMLInputElement;
                  scanInterval = parseInt(target.value) || 0;
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
            scanInterval = parseInt(value) || 0;
          }
        });
    });

    // Template selection
    let customTemplate = this.feed.customTemplate || "";
    const savedTemplates =
      this.plugin.settings.articleSaving.savedTemplates || [];
    let feedKeywordRules: FeedKeywordRulesSettings = this.feed.keywordRules
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

    const feedFiltersDetails = contentEl.createEl("details", {
      cls: "rss-keyword-filter-details",
    });
    feedFiltersDetails.createEl("summary", {
      cls: "rss-keyword-filter-summary",
      text: "Rules",
    });
    const feedFiltersBody = feedFiltersDetails.createDiv({
      cls: "rss-keyword-filter-details-body",
    });

    const renderFeedFilterEditor = () => {
      renderKeywordFilterEditor({
        containerEl: feedFiltersBody,
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

    const btns = contentEl.createDiv(
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
      normalizeNitterUrl();
      const validation = isValidFeedTitle(title);
      if (!validation.valid) {
        new Notice(validation.error || "Invalid feed title");
        return;
      }

      void (async () => {
        const oldTitle = this.feed.title;
        this.feed.title = title;
        this.feed.url = url;
        const finalFolder = folderInput?.value || folder;
        this.feed.folder = finalFolder;

        if (finalFolder) {
          await this.plugin.ensureFolderExists(finalFolder);
        }
        this.feed.autoDeleteDuration = autoDeleteDuration;

        // Update feedTitle for all articles in this feed when the title changes
        if (oldTitle !== title) {
          for (const item of this.feed.items) {
            item.feedTitle = title;
          }
        }

        const newMaxItemsLimit = Number.isFinite(maxItemsLimit)
          ? maxItemsLimit
          : this.plugin.settings.maxItems;

        this.feed.maxItemsLimit = newMaxItemsLimit;
        this.feed.scanInterval = scanInterval;
        this.feed.customTemplate = customTemplate || undefined;
        this.feed.keywordRules = {
          overrideGlobalRules: feedKeywordRules.overrideGlobalRules,
          includeLogic: feedKeywordRules.includeLogic,
          rules: feedKeywordRules.rules,
        };

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

    window.setTimeout(() => {
      titleInput?.focus();
      titleInput?.select();
    }, 0);
  }
  onClose() {
    this.contentEl.empty();
  }
}

