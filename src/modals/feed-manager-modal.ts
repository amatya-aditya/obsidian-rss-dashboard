import { Modal, App, Setting, Notice, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type {
  Feed,
  FeedFilterSettings,
  Folder,
  SavedTemplate,
} from "../types/types";
import { DEFAULT_SETTINGS } from "../types/types";
import { FolderSuggest } from "../components/folder-suggest";
import {
  resolvePodcastPlatformUrl,
  loadFeedForPreview,
} from "../services/feed-parser";
import { detectPodcastPlatform } from "../utils/podcast-platforms";
import { MediaService } from "../services/media-service";
import { ImportOpmlModal } from "./import-opml-modal";
import { renderKeywordFilterEditor } from "../components/keyword-filter-editor";
import { shouldUseMobileSidebarLayout } from "../utils/platform-utils";

/**
 * Helper function to collect all folder paths from a folder hierarchy
 */
function collectAllFolders(folders: Folder[], base = ""): string[] {
  const paths: string[] = [];
  for (const f of folders) {
    const path = base ? `${base}/${f.name}` : f.name;
    paths.push(path);
    if (f.subfolders && f.subfolders.length > 0) {
      paths.push(...collectAllFolders(f.subfolders, path));
    }
  }
  return paths;
}

/**
 * Check if URL is a YouTube page URL that should use the Add Youtube channel feature.
 * Returns false for YouTube RSS feed URLs (which are valid RSS feeds).
 */
function isYouTubePageUrl(url: string): boolean {
  if (!url) return false;

  // Check if it matches YouTube patterns
  if (!MediaService.isYouTubeFeed(url)) return false;

  // Exclude YouTube RSS feed URLs - these are valid RSS feeds
  if (url.includes("youtube.com/feeds/videos.xml")) return false;

  return true;
}

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
      })
      .addButton((btn) => {
        btn.setButtonText("Load");
        btn.buttonEl.addClass("rss-dashboard-load-button");
        loadBtn = btn.buttonEl;
        btn.onClick(() => {
          void (async () => {
            // Set loading state
            status = "⏳ Loading...";
            loadBtn.addClass("loading");
            loadBtn.disabled = true;
            clearBadgeActiveStates(); // Clear any previous active states
            if (refs.statusDiv) {
              refs.statusDiv.textContent = status;
              refs.statusDiv.removeClass("rss-dashboard-status-warning");
              refs.statusDiv.removeClass("status-ok");
              refs.statusDiv.removeClass("status-error");
              refs.statusDiv.addClass("status-loading");
            }
            try {
              let feedUrl = url;
              let detectedType: "rss" | "podcast" | "youtube" = "rss";

              // Check for YouTube page URLs and convert to RSS feed
              if (isYouTubePageUrl(url)) {
                detectedType = "youtube";
                status = "⏳ Resolving YouTube channel...";
                if (refs.statusDiv) refs.statusDiv.textContent = status;

                const rssUrl = await MediaService.getYouTubeRssFeed(url);
                if (!rssUrl) {
                  throw new Error(
                    "Could not resolve YouTube channel. Please check the URL.",
                  );
                }
                feedUrl = rssUrl;
                url = rssUrl;
                if (urlInput) urlInput.value = rssUrl;
                status = "⏳ Loading YouTube feed...";
                if (refs.statusDiv) refs.statusDiv.textContent = status;
              } else {
                // Check for podcast platform URLs
                const platform = detectPodcastPlatform(url);
                if (platform) {
                  detectedType = "podcast";
                  status = `⏳ Resolving ${platform.name} URL...`;
                  if (refs.statusDiv) refs.statusDiv.textContent = status;
                  const resolvedUrl = await resolvePodcastPlatformUrl(url);
                  if (!resolvedUrl) {
                    throw new Error("Could not resolve podcast feed URL");
                  }
                  feedUrl = resolvedUrl;
                  url = resolvedUrl;
                  if (urlInput) urlInput.value = feedUrl;
                  status = "⏳ Loading feed...";
                  if (refs.statusDiv) refs.statusDiv.textContent = status;
                }
              }

              // Use loadFeedForPreview which has CORS proxy fallbacks
              const feedData = await loadFeedForPreview(feedUrl);
              title = feedData.title;
              if (titleInput) titleInput.value = title;
              if (feedData.latestPubDate) {
                const date = new Date(feedData.latestPubDate);
                const daysAgo = Math.floor(
                  (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
                );
                latestEntry = daysAgo === 0 ? "Today" : `${daysAgo} days ago`;
              } else {
                latestEntry = "N/A";
              }
              
              if (refs.latestEntryDiv)
                refs.latestEntryDiv.textContent = latestEntry;
              
              if (refs.statusDiv) {
                refs.statusDiv.removeClass("status-loading");
                refs.statusDiv.removeClass("status-error");
                refs.statusDiv.removeClass("status-ok");
                refs.statusDiv.removeClass("rss-dashboard-status-warning");

                if (feedData.hasEntries) {
                  status = "OK";
                  refs.statusDiv.textContent = "✅ OK";
                  refs.statusDiv.addClass("status-ok");
                } else {
                  status = EMPTY_FEED_VALIDATION_WARNING;
                  refs.statusDiv.textContent = `⚠ ${EMPTY_FEED_VALIDATION_WARNING}`;
                  refs.statusDiv.addClass("rss-dashboard-status-warning");
                }
              }

              if (urlInput) {
                urlInput.addClass("loaded");
              }
              setActiveBadge(detectedType);
            } catch (e) {
              const errorMsg = e instanceof Error ? e.message : String(e);
              status = "Error loading feed";
              latestEntry = "-";
              if (refs.latestEntryDiv)
                refs.latestEntryDiv.textContent = latestEntry;
              console.error("Feed load error:", e);
              // Error state
              if (refs.statusDiv) {
                refs.statusDiv.textContent = `❌ ${errorMsg}`;
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

    // Add supported formats badges with SVG icons
    const formatsDesc = urlSetting.descEl.createDiv({
      cls: "supported-formats",
    });

    // RSS badge - traditional RSS feed icon (radio waves)
    const rssBadge = formatsDesc.createSpan({ cls: "format-badge rss" });
    const rssSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    rssSvg.setAttribute("viewBox", "0 0 448 512");
    rssSvg.setAttribute("width", "14");
    rssSvg.setAttribute("height", "14");
    const rssPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    rssPath.setAttribute("fill", "currentColor");
    rssPath.setAttribute(
      "d",
      "M0 64C0 46.3 14.3 32 32 32c229.8 0 416 186.2 416 416c0 17.7-14.3 32-32 32s-32-14.3-32-32C384 253.6 230.4 96 32 96C14.3 96 0 81.7 0 64zM0 416a64 64 0 1 1 128 0A64 64 0 1 1 0 416zM32 160c159.1 0 288 128.9 288 288c0 17.7-14.3 32-32 32s-32-14.3-32-32c0-123.7-100.3-224-224-224c-17.7 0-32-14.3-32-32s14.3-32 32-32z",
    );
    rssSvg.appendChild(rssPath);
    rssBadge.appendChild(rssSvg);
    rssBadge.appendText(" RSS");

    // Apple Podcasts badge
    const podcastBadge = formatsDesc.createSpan({
      cls: "format-badge podcast",
    });
    const podcastSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    podcastSvg.setAttribute("viewBox", "0 0 24 24");
    podcastSvg.setAttribute("width", "14");
    podcastSvg.setAttribute("height", "14");
    const podcastPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    podcastPath.setAttribute("fill", "currentColor");
    podcastPath.setAttribute(
      "d",
      "M5.34 0A5.328 5.328 0 0 0 0 5.34v13.32A5.328 5.328 0 0 0 5.34 24h13.32A5.328 5.328 0 0 0 24 18.66V5.34A5.328 5.328 0 0 0 18.66 0zm6.525 3.6a7.44 7.44 0 0 1 7.44 7.44 7.44 7.44 0 0 1-7.44 7.44 7.44 7.44 0 0 1-7.44-7.44 7.44 7.44 0 0 1 7.44-7.44zm-.096 1.776a5.664 5.664 0 0 0-5.664 5.664 5.664 5.664 0 0 0 5.664 5.664 5.664 5.664 0 0 0 5.664-5.664 5.664 5.664 0 0 0-5.664-5.664zm.096 2.4a.96.96 0 0 1 .96.96v2.88a.96.96 0 0 1-.96.96.96.96 0 0 1-.96-.96v-2.88a.96.96 0 0 1 .96-.96zm0 5.76a.96.96 0 0 1 .96.96.96.96 0 0 1-.96.96.96.96 0 0 1-.96-.96.96.96 0 0 1 .96-.96z",
    );
    podcastSvg.appendChild(podcastPath);
    podcastBadge.appendChild(podcastSvg);
    podcastBadge.appendText(" Apple Podcasts");

    // YouTube badge
    const youtubeBadge = formatsDesc.createSpan({
      cls: "format-badge youtube",
    });
    const youtubeSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    youtubeSvg.setAttribute("viewBox", "0 0 24 24");
    youtubeSvg.setAttribute("width", "14");
    youtubeSvg.setAttribute("height", "14");
    const youtubePath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    youtubePath.setAttribute("fill", "currentColor");
    youtubePath.setAttribute(
      "d",
      "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
    );
    youtubeSvg.appendChild(youtubePath);
    youtubeBadge.appendChild(youtubeSvg);
    youtubeBadge.appendText(" YouTube");

    // Helper function to clear all active badge states
    const clearBadgeActiveStates = () => {
      rssBadge.removeClass("active");
      podcastBadge.removeClass("active");
      youtubeBadge.removeClass("active");
    };

    // Helper function to set active badge based on feed type
    const setActiveBadge = (feedType: "rss" | "podcast" | "youtube") => {
      clearBadgeActiveStates();
      if (feedType === "rss") {
        rssBadge.addClass("active");
      } else if (feedType === "podcast") {
        podcastBadge.addClass("active");
      } else if (feedType === "youtube") {
        youtubeBadge.addClass("active");
      }
    };

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

    new Setting(contentEl).setName("Per feed control options").setHeading();

    let autoDeleteDuration = this.feed.autoDeleteDuration || 0;
    let maxItemsLimit =
      this.feed.maxItemsLimit || this.plugin.settings.maxItems;
    let scanInterval = this.feed.scanInterval || 0;

    const autoDeleteSetting = new Setting(contentEl)
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

    const maxItemsSetting = new Setting(contentEl)
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

    const scanIntervalSetting = new Setting(contentEl)
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
    let feedFilters: FeedFilterSettings = this.feed.filters
      ? {
          overrideGlobalFilters: this.feed.filters.overrideGlobalFilters,
          includeLogic: this.feed.filters.includeLogic,
          rules: [...this.feed.filters.rules],
        }
      : {
          overrideGlobalFilters: false,
          includeLogic: "AND",
          rules: [],
        };

    new Setting(contentEl)
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
      text: "Filters",
    });
    const feedFiltersBody = feedFiltersDetails.createDiv({
      cls: "rss-keyword-filter-details-body",
    });

    const renderFeedFilterEditor = () => {
      renderKeywordFilterEditor({
        containerEl: feedFiltersBody,
        state: {
          includeLogic: feedFilters.includeLogic,
          rules: feedFilters.rules,
          overrideGlobalFilters: feedFilters.overrideGlobalFilters,
        },
        showOverrideToggle: true,
        onChange: (nextState) => {
          feedFilters = {
            includeLogic: nextState.includeLogic,
            rules: nextState.rules,
            overrideGlobalFilters: !!nextState.overrideGlobalFilters,
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

        const newMaxItemsLimit = maxItemsLimit || this.plugin.settings.maxItems;

        this.feed.maxItemsLimit = newMaxItemsLimit;
        this.feed.scanInterval = scanInterval;
        this.feed.customTemplate = customTemplate || undefined;
        this.feed.filters = {
          overrideGlobalFilters: feedFilters.overrideGlobalFilters,
          includeLogic: feedFilters.includeLogic,
          rules: feedFilters.rules,
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

export class AddFeedModal extends Modal {
  folders: Folder[];
  onAdd: (
    title: string,
    url: string,
    folder: string,
    autoDeleteDuration?: number,
    maxItemsLimit?: number,
    scanInterval?: number,
    feedFilters?: FeedFilterSettings,
  ) => Promise<boolean | void>;
  onSave: () => void;
  defaultFolder: string;
  plugin?: RssDashboardPlugin;

  constructor(
    app: App,
    folders: Folder[],
    onAdd: (
      title: string,
      url: string,
      folder: string,
      autoDeleteDuration?: number,
      maxItemsLimit?: number,
      scanInterval?: number,
      feedFilters?: FeedFilterSettings,
    ) => Promise<boolean | void>,
    onSave: () => void,
    defaultFolder = "",
    plugin?: RssDashboardPlugin,
  ) {
    super(app);
    this.folders = folders;
    this.onAdd = onAdd;
    this.onSave = onSave;
    this.defaultFolder = defaultFolder;
    this.plugin = plugin || undefined;
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

    let url = "";
    let title = "";
    let status = "";
    let latestEntry = "-";
    let folder = this.defaultFolder;
    let titleInput: HTMLInputElement;
    let urlInput: HTMLInputElement;
    let folderInput: HTMLInputElement;
    let loadBtn: HTMLButtonElement;
    const refs: {
      statusDiv?: HTMLDivElement;
      latestEntryDiv?: HTMLDivElement;
    } = {};

    const urlSetting = new Setting(contentEl)
      .setName("Feed URL")
      .addText((text) => {
        text.onChange((v) => (url = v));
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
      })
      .addButton((btn) => {
        btn.setButtonText("Load");
        btn.buttonEl.addClass("rss-dashboard-load-button");
        loadBtn = btn.buttonEl;
        btn.onClick(() => {
          void (async () => {
            // Validate that URL is not empty
            if (!url || url.trim() === "") {
              status = "❌ Please enter a feed URL";
              if (refs.statusDiv) {
                refs.statusDiv.textContent = status;
                refs.statusDiv.removeClass("status-loading");
                refs.statusDiv.removeClass("status-ok");
                refs.statusDiv.addClass("status-error");
              }
              return;
            }

            // Set loading state
            status = "⏳ Loading...";
            loadBtn.addClass("loading");
            loadBtn.disabled = true;
            clearBadgeActiveStates(); // Clear any previous active states
            if (refs.statusDiv) {
              refs.statusDiv.textContent = status;
              refs.statusDiv.removeClass("rss-dashboard-status-warning");
              refs.statusDiv.removeClass("status-ok");
              refs.statusDiv.removeClass("status-error");
              refs.statusDiv.addClass("status-loading");
            }
            try {
              let feedUrl = url;
              let detectedType: "rss" | "podcast" | "youtube" = "rss";

              // Check for YouTube page URLs and convert to RSS feed
              if (isYouTubePageUrl(url)) {
                detectedType = "youtube";
                status = "⏳ Resolving YouTube channel...";
                if (refs.statusDiv) refs.statusDiv.textContent = status;

                const rssUrl = await MediaService.getYouTubeRssFeed(url);
                if (!rssUrl) {
                  throw new Error(
                    "Could not resolve YouTube channel. Please check the URL.",
                  );
                }
                feedUrl = rssUrl;
                url = rssUrl;
                if (urlInput) urlInput.value = rssUrl;
                status = "⏳ Loading YouTube feed...";
                if (refs.statusDiv) refs.statusDiv.textContent = status;

                // Auto-set folder to default YouTube folder
                // Update if folder is empty, "Uncategorized", or was previously auto-assigned
                const defaultYouTubeFolder =
                  this.plugin?.settings?.media?.defaultYouTubeFolder ||
                  "Videos";
                const defaultPodcastFolder =
                  this.plugin?.settings?.media?.defaultPodcastFolder ||
                  "Podcast";
                const defaultRssFolder =
                  this.plugin?.settings?.media?.defaultRssFolder || "RSS";

                const currentFolder = folderInput?.value || "";
                const isAutoAssignedFolder =
                  currentFolder === defaultYouTubeFolder ||
                  currentFolder === defaultPodcastFolder ||
                  currentFolder === defaultRssFolder ||
                  currentFolder === "Videos" ||
                  currentFolder === "Podcast" ||
                  currentFolder === "RSS";

                if (
                  folderInput &&
                  (!currentFolder ||
                    currentFolder === "Uncategorized" ||
                    isAutoAssignedFolder)
                ) {
                  folder = defaultYouTubeFolder;
                  folderInput.value = defaultYouTubeFolder;
                }
              } else {
                // Check for podcast platform URLs
                const platform = detectPodcastPlatform(url);
                if (platform) {
                  detectedType = "podcast";
                  status = `⏳ Resolving ${platform.name} URL...`;
                  if (refs.statusDiv) refs.statusDiv.textContent = status;
                  const resolvedUrl = await resolvePodcastPlatformUrl(url);
                  if (!resolvedUrl) {
                    throw new Error("Could not resolve podcast feed URL");
                  }
                  feedUrl = resolvedUrl;
                  url = resolvedUrl;
                  if (urlInput) urlInput.value = feedUrl;
                  status = "⏳ Loading feed...";
                  if (refs.statusDiv) refs.statusDiv.textContent = status;

                  // Auto-set folder to default podcast folder
                  // Update if folder is empty, "Uncategorized", or was previously auto-assigned
                  const defaultPodcastFolder =
                    this.plugin?.settings?.media?.defaultPodcastFolder ||
                    "Podcast";
                  const defaultYouTubeFolder =
                    this.plugin?.settings?.media?.defaultYouTubeFolder ||
                    "Videos";
                  const defaultRssFolder =
                    this.plugin?.settings?.media?.defaultRssFolder || "RSS";

                  const currentFolder = folderInput?.value || "";
                  const isAutoAssignedFolder =
                    currentFolder === defaultYouTubeFolder ||
                    currentFolder === defaultPodcastFolder ||
                    currentFolder === defaultRssFolder ||
                    currentFolder === "Videos" ||
                    currentFolder === "Podcast" ||
                    currentFolder === "RSS";

                  if (
                    folderInput &&
                    (!currentFolder ||
                      currentFolder === "Uncategorized" ||
                      isAutoAssignedFolder)
                  ) {
                    folder = defaultPodcastFolder;
                    folderInput.value = defaultPodcastFolder;
                  }
                }
              }

              // Use loadFeedForPreview which has CORS proxy fallbacks
              const feedData = await loadFeedForPreview(feedUrl);
              title = feedData.title;
              if (titleInput) titleInput.value = title;
              if (feedData.latestPubDate) {
                const date = new Date(feedData.latestPubDate);
                const daysAgo = Math.floor(
                  (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
                );
                latestEntry = daysAgo === 0 ? "Today" : `${daysAgo} days`;
              } else {
                latestEntry = "N/A";
              }
              
              if (refs.latestEntryDiv)
                refs.latestEntryDiv.textContent = latestEntry;
              
              if (refs.statusDiv) {
                refs.statusDiv.removeClass("status-loading");
                refs.statusDiv.removeClass("status-error");
                refs.statusDiv.removeClass("status-ok");
                refs.statusDiv.removeClass("rss-dashboard-status-warning");

                if (feedData.hasEntries) {
                  status = "OK";
                  refs.statusDiv.textContent = "✅ OK";
                  refs.statusDiv.addClass("status-ok");
                } else {
                  status = EMPTY_FEED_VALIDATION_WARNING;
                  refs.statusDiv.textContent = `⚠ ${EMPTY_FEED_VALIDATION_WARNING}`;
                  refs.statusDiv.addClass("rss-dashboard-status-warning");
                }
              }

              if (urlInput) {
                urlInput.addClass("loaded");
              }
              // Set the active badge based on detected type
              setActiveBadge(detectedType);

              // Auto-set folder for RSS feeds if not YouTube or Podcast
              // Update if folder is empty, "Uncategorized", or was previously auto-assigned
              if (detectedType === "rss") {
                const defaultRssFolder =
                  this.plugin?.settings?.media?.defaultRssFolder || "RSS";
                const defaultYouTubeFolder =
                  this.plugin?.settings?.media?.defaultYouTubeFolder ||
                  "Videos";
                const defaultPodcastFolder =
                  this.plugin?.settings?.media?.defaultPodcastFolder ||
                  "Podcast";

                const currentFolder = folderInput?.value || "";
                const isAutoAssignedFolder =
                  currentFolder === defaultYouTubeFolder ||
                  currentFolder === defaultPodcastFolder ||
                  currentFolder === defaultRssFolder ||
                  currentFolder === "Videos" ||
                  currentFolder === "Podcast" ||
                  currentFolder === "RSS";

                if (
                  folderInput &&
                  (!currentFolder ||
                    currentFolder === "Uncategorized" ||
                    isAutoAssignedFolder)
                ) {
                  folder = defaultRssFolder;
                  folderInput.value = defaultRssFolder;
                }
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
                refs.statusDiv.textContent = `❌ ${errorMsg}`;
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

    // Add supported formats badges with SVG icons
    const formatsDesc = urlSetting.descEl.createDiv({
      cls: "supported-formats",
    });

    // RSS badge - traditional RSS feed icon (radio waves)
    const rssBadge = formatsDesc.createSpan({ cls: "format-badge rss" });
    const rssSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    rssSvg.setAttribute("viewBox", "0 0 448 512");
    rssSvg.setAttribute("width", "14");
    rssSvg.setAttribute("height", "14");
    const rssPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    rssPath.setAttribute("fill", "currentColor");
    rssPath.setAttribute(
      "d",
      "M0 64C0 46.3 14.3 32 32 32c229.8 0 416 186.2 416 416c0 17.7-14.3 32-32 32s-32-14.3-32-32C384 253.6 230.4 96 32 96C14.3 96 0 81.7 0 64zM0 416a64 64 0 1 1 128 0A64 64 0 1 1 0 416zM32 160c159.1 0 288 128.9 288 288c0 17.7-14.3 32-32 32s-32-14.3-32-32c0-123.7-100.3-224-224-224c-17.7 0-32-14.3-32-32s14.3-32 32-32z",
    );
    rssSvg.appendChild(rssPath);
    rssBadge.appendChild(rssSvg);
    rssBadge.appendText(" RSS");

    // Apple Podcasts badge
    const podcastBadge = formatsDesc.createSpan({
      cls: "format-badge podcast",
    });
    const podcastSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    podcastSvg.setAttribute("viewBox", "0 0 24 24");
    podcastSvg.setAttribute("width", "14");
    podcastSvg.setAttribute("height", "14");
    const podcastPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    podcastPath.setAttribute("fill", "currentColor");
    podcastPath.setAttribute(
      "d",
      "M5.34 0A5.328 5.328 0 0 0 0 5.34v13.32A5.328 5.328 0 0 0 5.34 24h13.32A5.328 5.328 0 0 0 24 18.66V5.34A5.328 5.328 0 0 0 18.66 0zm6.525 3.6a7.44 7.44 0 0 1 7.44 7.44 7.44 7.44 0 0 1-7.44 7.44 7.44 7.44 0 0 1-7.44-7.44 7.44 7.44 0 0 1 7.44-7.44zm-.096 1.776a5.664 5.664 0 0 0-5.664 5.664 5.664 5.664 0 0 0 5.664 5.664 5.664 5.664 0 0 0 5.664-5.664 5.664 5.664 0 0 0-5.664-5.664zm.096 2.4a.96.96 0 0 1 .96.96v2.88a.96.96 0 0 1-.96.96.96.96 0 0 1-.96-.96v-2.88a.96.96 0 0 1 .96-.96zm0 5.76a.96.96 0 0 1 .96.96.96.96 0 0 1-.96.96.96.96 0 0 1-.96-.96.96.96 0 0 1 .96-.96z",
    );
    podcastSvg.appendChild(podcastPath);
    podcastBadge.appendChild(podcastSvg);
    podcastBadge.appendText(" Apple Podcasts");

    // YouTube badge
    const youtubeBadge = formatsDesc.createSpan({
      cls: "format-badge youtube",
    });
    const youtubeSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    youtubeSvg.setAttribute("viewBox", "0 0 24 24");
    youtubeSvg.setAttribute("width", "14");
    youtubeSvg.setAttribute("height", "14");
    const youtubePath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    youtubePath.setAttribute("fill", "currentColor");
    youtubePath.setAttribute(
      "d",
      "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
    );
    youtubeSvg.appendChild(youtubePath);
    youtubeBadge.appendChild(youtubeSvg);
    youtubeBadge.appendText(" YouTube");

    // Helper function to clear all active badge states
    const clearBadgeActiveStates = () => {
      rssBadge.removeClass("active");
      podcastBadge.removeClass("active");
      youtubeBadge.removeClass("active");
    };

    // Helper function to set active badge based on feed type
    const setActiveBadge = (feedType: "rss" | "podcast" | "youtube") => {
      clearBadgeActiveStates();
      if (feedType === "rss") {
        rssBadge.addClass("active");
      } else if (feedType === "podcast") {
        podcastBadge.addClass("active");
      } else if (feedType === "youtube") {
        youtubeBadge.addClass("active");
      }
    };

    new Setting(contentEl).setName("Title").addText((text) => {
      titleInput = text.inputEl;
      text.setValue(title).onChange((v) => (title = v));
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

      new FolderSuggest(this.app, folderInput, this.folders);
    });

    // Default values for the removed advanced options
    const autoDeleteDuration = 0;
    const maxItemsLimit = this.plugin?.settings?.maxItems || 25;
    const scanInterval = 0;
    let feedFilters: FeedFilterSettings = {
      overrideGlobalFilters: false,
      includeLogic: "AND",
      rules: [],
    };

    const feedFiltersDetails = contentEl.createEl("details", {
      cls: "rss-keyword-filter-details",
    });
    feedFiltersDetails.createEl("summary", {
      cls: "rss-keyword-filter-summary",
      text: "Filters",
    });
    const feedFiltersBody = feedFiltersDetails.createDiv({
      cls: "rss-keyword-filter-details-body",
    });

    const renderFeedFilterEditor = () => {
      renderKeywordFilterEditor({
        containerEl: feedFiltersBody,
        state: {
          includeLogic: feedFilters.includeLogic,
          rules: feedFilters.rules,
          overrideGlobalFilters: feedFilters.overrideGlobalFilters,
        },
        showOverrideToggle: true,
        onChange: (nextState) => {
          feedFilters = {
            includeLogic: nextState.includeLogic,
            rules: nextState.rules,
            overrideGlobalFilters: !!nextState.overrideGlobalFilters,
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
      if (!url) {
        new Notice("Feed URL cannot be empty");
        return;
      }
      if (!title) {
        new Notice("Title cannot be empty");
        return;
      }
      const finalFolder = folderInput?.value || folder;
      void (async () => {
        if (this.plugin && finalFolder) {
          await this.plugin.ensureFolderExists(finalFolder);
        }
        const added = await this.onAdd(
          title,
          url,
          finalFolder,
          autoDeleteDuration,
          maxItemsLimit,
          scanInterval,
          feedFilters,
        ).catch(() => {
          return false;
        });
        
        if (added !== false) {
          this.onSave();
          this.close();
        }
      })();
    };
    cancelBtn.onclick = () => this.close();

    window.setTimeout(() => {
      urlInput?.focus();
      urlInput?.select();
    }, 0);
  }
  onClose() {
    this.contentEl.empty();
  }
}

export class FeedManagerModal extends Modal {
  plugin: RssDashboardPlugin;
  private searchQuery = "";

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app);
    this.plugin = plugin;
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

    // Create custom header with close button on mobile
    if (isMobile) {
      const headerContainer = contentEl.createDiv({
        cls: "feed-manager-header-container",
      });

      headerContainer.createEl("h2", {
        text: "Manage feeds",
        cls: "feed-manager-header-title",
      });

      const closeBtn = headerContainer.createEl("button", {
        cls: "feed-manager-header-close-button",
        attr: {
          "aria-label": "Close",
          type: "button",
        },
      });
      setIcon(closeBtn, "x");
      closeBtn.onclick = () => this.close();
    } else {
      new Setting(contentEl).setName("Manage feeds").setHeading();
    }

    // Search and button container
    const topControls = contentEl.createDiv({
      cls: "feed-manager-top-controls",
    });

    // Search input
    const searchContainer = topControls.createDiv({
      cls: "feed-manager-search-container",
    });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search feeds...",
      cls: "feed-manager-search-input",
    });
    const searchClearBtn = searchContainer.createEl("button", {
      cls: "feed-manager-search-clear is-hidden",
      attr: {
        title: "Clear search",
        "aria-label": "Clear search",
        type: "button",
      },
    });
    setIcon(searchClearBtn, "x");

    const updateSearchClearVisibility = () => {
      const hasValue = searchInput.value.trim().length > 0;
      searchClearBtn.toggleClass("is-hidden", !hasValue);
    };

    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderFeeds(contentEl);
      updateSearchClearVisibility();
    });
    searchClearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      searchInput.value = "";
      this.searchQuery = "";
      this.renderFeeds(contentEl);
      updateSearchClearVisibility();
      searchInput.focus();
    });
    updateSearchClearVisibility();

    // First button row - Add feed
    const buttonRowPrimary = topControls.createDiv({
      cls: "feed-manager-button-row feed-manager-button-row-primary",
    });

    // Add feed button
    const addFeedBtn = buttonRowPrimary.createEl("button", {
      cls: "rss-dashboard-primary-button feed-manager-add-button",
    });
    addFeedBtn.createSpan({ text: "Add new feed..." });
    addFeedBtn.onclick = () => {
      new AddFeedModal(
        this.app,
        this.plugin.settings.folders,
        (
          title,
          url,
          folder,
          autoDeleteDuration,
          maxItemsLimit,
          scanInterval,
          feedFilters,
        ) =>
          this.plugin.addFeed(
            title,
            url,
            folder,
            autoDeleteDuration,
            maxItemsLimit,
            scanInterval,
            feedFilters,
          ),
        () => this.onOpen(),
        "",
        this.plugin,
      ).open();
    };

    // Second button row - Import, Export, Delete All
    const buttonRowSecondary = topControls.createDiv({
      cls: "feed-manager-button-row feed-manager-button-row-secondary",
    });

    // Import OPML button
    const importOpmlBtn = buttonRowSecondary.createEl("button", {
      cls: "feed-manager-opml-button feed-manager-import-button",
    });
    setIcon(importOpmlBtn, "upload");
    importOpmlBtn.createSpan({ text: " Import" });
    importOpmlBtn.onclick = () => {
      new ImportOpmlModal(this.app, this.plugin).open();
    };

    // Export OPML button
    const exportOpmlBtn = buttonRowSecondary.createEl("button", {
      cls: "feed-manager-opml-button feed-manager-export-button",
    });
    setIcon(exportOpmlBtn, "download");
    exportOpmlBtn.createSpan({ text: " Export" });
    exportOpmlBtn.onclick = () => {
      this.plugin.exportOpml();
    };

    // Delete All button
    const deleteAllBtn = buttonRowSecondary.createEl("button", {
      cls: "rss-dashboard-danger-button feed-manager-delete-all-button",
    });
    setIcon(deleteAllBtn, "trash-2");
    deleteAllBtn.createSpan({ text: " Delete all" });
    deleteAllBtn.onclick = () => {
      this.showDeleteConfirmModal({ type: "all" });
    };

    this.renderFeeds(contentEl);
  }

  private renderFeeds(containerEl: HTMLElement) {
    // Remove existing feed list if it exists
    const existingList = containerEl.querySelector(".feed-manager-list");
    if (existingList) {
      existingList.remove();
    }

    const feedsContainer = containerEl.createDiv({
      cls: "feed-manager-list",
    });

    const allFolderPaths = collectAllFolders(this.plugin.settings.folders);

    const feedsByFolder: Record<string, Feed[]> = {};
    for (const path of allFolderPaths) feedsByFolder[path] = [];
    const uncategorized: Feed[] = [];

    // Filter feeds based on search query
    const lowerQuery = this.searchQuery.toLowerCase();
    const filteredFeeds = this.plugin.settings.feeds.filter(
      (feed) =>
        feed.title.toLowerCase().includes(lowerQuery) ||
        feed.folder?.toLowerCase().includes(lowerQuery),
    );

    for (const feed of filteredFeeds) {
      if (feed.folder && allFolderPaths.includes(feed.folder)) {
        feedsByFolder[feed.folder].push(feed);
      } else {
        uncategorized.push(feed);
      }
    }

    // Show message if no results
    if (filteredFeeds.length === 0) {
      feedsContainer.createDiv({
        text: "No feeds found.",
        cls: "feed-manager-empty",
      });
      return;
    }

    for (const folderPath of allFolderPaths) {
      const feeds = feedsByFolder[folderPath];
      if (feeds.length > 0) {
        const folderDiv = feedsContainer.createDiv({
          cls: "feed-manager-folder",
        });

        // Create folder header with delete button on left
        const folderHeader = folderDiv.createDiv({
          cls: "feed-manager-folder-header",
        });

        // Add delete folder button (X icon) on the left
        const deleteFolderBtn = folderHeader.createEl("button", {
          cls: "feed-manager-delete-folder-button",
        });
        setIcon(deleteFolderBtn, "trash-2");
        deleteFolderBtn.setAttribute("aria-label", "Delete folder");
        deleteFolderBtn.onclick = () => {
          this.showDeleteConfirmModal({
            type: "folder",
            folderPath,
            feedCount: feeds.length,
          });
        };

        // Add folder name
        const folderName = folderHeader.createDiv({
          cls: "feed-manager-folder-name",
        });
        folderName.setText(folderPath);
        folderName.setAttribute("title", "Click to rename folder");
        folderName.addClass("is-editable");
        folderName.addEventListener("click", (event) => {
          event.stopPropagation();
          this.startInlineFolderRename(folderName, folderPath);
        });

        // Add horizontal divider below header
        folderDiv.createDiv({ cls: "feed-manager-folder-divider" });

        for (const feed of feeds) {
          this.renderFeedRow(folderDiv, feed);
        }
      }
    }

    if (uncategorized.length > 0) {
      const uncategorizedDiv = feedsContainer.createDiv({
        cls: "feed-manager-folder",
      });

      // Create folder header with delete button on left
      const folderHeader = uncategorizedDiv.createDiv({
        cls: "feed-manager-folder-header",
      });

      // Add delete folder button (X icon) on the left
      const deleteFolderBtn = folderHeader.createEl("button", {
        cls: "feed-manager-delete-folder-button",
      });
      setIcon(deleteFolderBtn, "trash-2");
      deleteFolderBtn.setAttribute("aria-label", "Delete folder");
      deleteFolderBtn.onclick = () => {
        this.showDeleteConfirmModal({
          type: "folder",
          folderPath: "Uncategorized",
          feedCount: uncategorized.length,
        });
      };

      // Add folder name
      const folderName = folderHeader.createDiv({
        cls: "feed-manager-folder-name",
      });
      folderName.setText("Uncategorized");

      // Add horizontal divider below header
      uncategorizedDiv.createDiv({ cls: "feed-manager-folder-divider" });

      for (const feed of uncategorized) {
        this.renderFeedRow(uncategorizedDiv, feed);
      }
    }
  }

  renderFeedRow(parent: HTMLElement, feed: Feed) {
    const row = parent.createDiv({ cls: "feed-manager-row" });
    row.createDiv({ text: feed.title, cls: "feed-manager-title" });

    const editBtn = row.createEl("button", {
      cls: "rss-dashboard-primary-button",
    });
    setIcon(editBtn, "pencil");
    editBtn.createSpan({ text: " Edit" });
    editBtn.onclick = () => {
      new EditFeedModal(this.app, this.plugin, feed, () =>
        this.onOpen(),
      ).open();
    };

    const delBtn = row.createEl("button", {
      cls: "rss-dashboard-danger-button",
    });
    setIcon(delBtn, "trash-2");
    delBtn.createSpan({ text: " Delete" });
    delBtn.onclick = () => {
      this.showDeleteConfirmModal({ type: "feed", feed });
    };
  }

  /**
   * Unified delete confirmation modal that appears as an overlay
   * Handles Delete All, Delete Folder, and Delete Feed actions
   */
  private showDeleteConfirmModal(options: {
    type: "all" | "folder" | "feed";
    folderPath?: string;
    feedCount?: number;
    feed?: Feed;
  }): void {
    const { type, folderPath, feedCount, feed } = options;
    const parentModalEl = this.modalEl;
    parentModalEl.addClass("rss-dashboard-modal-interactions-disabled");

    // Use a real Obsidian Modal so background interactions are blocked.
    const confirmModal = new Modal(this.app);
    confirmModal.modalEl.addClasses([
      "rss-dashboard-modal",
      "rss-dashboard-modal-container",
      "rss-dashboard-confirm-modal",
    ]);
    confirmModal.contentEl.empty();
    confirmModal.contentEl.addClass("rss-dashboard-modal-content");
    const { contentEl: modalContent } = confirmModal;

    const restoreParentInteractivity = () => {
      parentModalEl.removeClass("rss-dashboard-modal-interactions-disabled");
    };
    const originalOnClose = confirmModal.onClose.bind(confirmModal);
    confirmModal.onClose = () => {
      originalOnClose();
      restoreParentInteractivity();
    };

    // Context-specific header and message
    let title: string;
    let warningMessage: string;
    let confirmButtonText: string;

    switch (type) {
      case "all":
        title = "Delete all feeds?";
        warningMessage =
          "This action is irreversible. All your feeds will be permanently deleted.";
        confirmButtonText = "Delete All";
        break;
      case "folder":
        title = `Delete folder "${folderPath}"?`;
        warningMessage = `This action is irreversible. The folder "${folderPath}" and all ${feedCount} feed(s) within it will be permanently deleted.`;
        confirmButtonText = "Delete Folder";
        break;
      case "feed":
        title = `Delete feed "${feed?.title}"?`;
        warningMessage =
          "This action is irreversible. The feed will be permanently deleted.";
        confirmButtonText = "Delete";
        break;
    }

    new Setting(modalContent).setName(title).setHeading();

    // Warning message
    const warningDiv = modalContent.createDiv({
      cls: "delete-all-warning",
    });
    warningDiv.createEl("p", { text: warningMessage });

    // Backup recommendation (only for folder and all deletions)
    if (type === "all" || type === "folder") {
      const backupDiv = modalContent.createDiv({
        cls: "delete-all-backup-notice",
      });
      backupDiv.createEl("strong", {
        text: "Recommended: export your feeds first",
      });
      backupDiv.createEl("p", {
        // OPML is an acronym - sentence case doesn't apply
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        text: "Before deleting, we strongly recommend backing up your feeds by exporting to an OPML file.",
      });

      // Export OPML button
      const exportBtn = backupDiv.createEl("button", {
        // OPML is an acronym - sentence case doesn't apply
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        text: "Export OPML",
        cls: "rss-dashboard-primary-button export-opml-btn",
      });
      exportBtn.onclick = () => {
        this.plugin.exportOpml();
      };
    }

    // Button container
    const buttonContainer = modalContent.createDiv({
      cls: "rss-dashboard-modal-buttons rss-folder-name-modal-buttons",
    });

    const confirmButton = buttonContainer.createEl("button", {
      cls: "rss-dashboard-danger-button",
    });
    const deleteIcon = confirmButton.createSpan();
    setIcon(deleteIcon, "trash-2");
    confirmButton.createSpan({ text: confirmButtonText });
    confirmButton.onclick = () => {
      // Execute the appropriate deletion
      switch (type) {
        case "all":
          void this.resetToFactorySettings();
          break;
        case "folder":
          void this.deleteFolder(folderPath!);
          break;
        case "feed":
          void this.deleteFeed(feed!);
          break;
      }
      confirmModal.close();
    };

    const cancelButton = buttonContainer.createEl("button");
    cancelButton.addClass("rss-confirm-modal-cancel");
    const cancelIcon = cancelButton.createSpan();
    setIcon(cancelIcon, "x");
    cancelButton.createSpan({ text: "Cancel" });
    cancelButton.onclick = () => {
      confirmModal.close();
    };

    confirmModal.open();
  }

  /**
   * Reset to factory settings - delete all feeds and restore default folders
   */
  private async resetToFactorySettings(): Promise<void> {
    // Clear all feeds
    this.plugin.settings.feeds = [];

    // Reset folders to default
    this.plugin.settings.folders = DEFAULT_SETTINGS.folders.map((f) => ({
      ...f,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    }));

    // Save settings
    await this.plugin.saveSettings();

    // Refresh the dashboard view if it exists
    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    // Show success notice
    new Notice("All feeds deleted. Settings reset to factory defaults.");

    // Re-render the modal
    this.onOpen();
  }

  /**
   * Delete a folder and all feeds within it
   */
  private async deleteFolder(folderPath: string): Promise<void> {
    // Remove all feeds in this folder (including subfolders)
    this.plugin.settings.feeds = this.plugin.settings.feeds.filter((feed) => {
      // Check if feed is in this folder or a subfolder
      return (
        feed.folder !== folderPath && !feed.folder?.startsWith(folderPath + "/")
      );
    });

    // Remove the folder from the folder hierarchy
    this.removeFolderFromHierarchy(folderPath);

    // Save settings
    await this.plugin.saveSettings();

    // Refresh the dashboard view if it exists
    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    // Show success notice
    new Notice(`Folder "${folderPath}" and its feeds deleted.`);

    // Re-render the modal
    this.onOpen();
  }

  /**
   * Delete a single feed
   */
  private async deleteFeed(feed: Feed): Promise<void> {
    // Remove the feed from the feeds array
    this.plugin.settings.feeds = this.plugin.settings.feeds.filter(
      (f) => f !== feed,
    );

    // Save settings
    await this.plugin.saveSettings();

    // Refresh the dashboard view if it exists
    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    // Show success notice
    new Notice(`Feed "${feed.title}" deleted.`);

    // Re-render the modal
    this.onOpen();
  }

  private startInlineFolderRename(
    nameEl: HTMLElement,
    folderPath: string,
  ): void {
    const oldName = folderPath.split("/").pop() || folderPath;
    const input = document.createElement("input");
    input.type = "text";
    input.value = oldName;
    input.className = "feed-manager-folder-name-input";
    input.setAttribute("aria-label", "Rename folder");

    const finish = (save: boolean) => {
      if (!input.parentElement) return;

      if (!save) {
        input.replaceWith(nameEl);
        return;
      }

      const nextName = input.value.trim();
      void this.renameFolder(folderPath, nextName);
    };

    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  }

  private async renameFolder(
    folderPath: string,
    newName: string,
  ): Promise<void> {
    const oldName = folderPath.split("/").pop() || folderPath;
    if (newName === oldName) {
      this.onOpen();
      return;
    }
    if (!newName) {
      new Notice("Folder name cannot be empty.");
      this.onOpen();
      return;
    }
    if (newName.includes("/")) {
      new Notice("Folder name cannot contain '/'.");
      this.onOpen();
      return;
    }

    const parentPath = folderPath.includes("/")
      ? folderPath.substring(0, folderPath.lastIndexOf("/"))
      : "";
    const siblings = parentPath
      ? collectAllFolders(this.plugin.settings.folders)
          .filter(
            (path) =>
              path.startsWith(`${parentPath}/`) &&
              !path.substring(parentPath.length + 1).includes("/"),
          )
          .map((path) => path.substring(path.lastIndexOf("/") + 1))
      : this.plugin.settings.folders.map((folder) => folder.name);

    if (siblings.includes(newName)) {
      new Notice(`Folder "${newName}" already exists at this level.`);
      this.onOpen();
      return;
    }

    const target = this.findFolderByPath(folderPath);
    if (!target) {
      new Notice("Folder not found.");
      this.onOpen();
      return;
    }

    target.name = newName;
    target.modifiedAt = Date.now();

    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    this.plugin.settings.feeds.forEach((feed) => {
      if (!feed.folder) return;
      if (feed.folder === folderPath) {
        feed.folder = newPath;
      } else if (feed.folder.startsWith(`${folderPath}/`)) {
        feed.folder = feed.folder.replace(folderPath, newPath);
      }
    });

    await this.plugin.saveSettings();

    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    new Notice(`Folder renamed to "${newName}".`);
    this.onOpen();
  }

  private findFolderByPath(folderPath: string): Folder | undefined {
    const parts = folderPath.split("/").filter(Boolean);
    if (parts.length === 0) return undefined;

    let current = this.plugin.settings.folders.find(
      (folder) => folder.name === parts[0],
    );
    for (let i = 1; i < parts.length && current; i++) {
      current = current.subfolders.find((folder) => folder.name === parts[i]);
    }
    return current;
  }

  /**
   * Remove a folder from the folder hierarchy
   */
  private removeFolderFromHierarchy(folderPath: string): void {
    const parts = folderPath.split("/");
    const folderName = parts[0];

    if (parts.length === 1) {
      // Top-level folder - remove directly
      this.plugin.settings.folders = this.plugin.settings.folders.filter(
        (f) => f.name !== folderName,
      );
    } else {
      // Nested folder - need to find parent and remove from subfolders
      const targetFolderName = parts[parts.length - 1];

      const findAndRemoveFromFolder = (folders: Folder[]): boolean => {
        for (let i = 0; i < folders.length; i++) {
          const folder = folders[i];

          // Check if this folder's path matches the parent path
          const currentFolderPath = this.getFolderPath(folder.name, folders);
          if (currentFolderPath === folderPath) {
            // Found it, remove from parent's subfolders
            return true;
          }

          // Check if we're on the path to the target
          if (folderPath.startsWith(folder.name + "/")) {
            // Look in subfolders
            const subfolderIndex = folder.subfolders.findIndex(
              (sf) => sf.name === targetFolderName,
            );
            if (subfolderIndex >= 0) {
              folder.subfolders.splice(subfolderIndex, 1);
              return true;
            }
            // Recurse into subfolders
            if (findAndRemoveFromFolder(folder.subfolders)) {
              return true;
            }
          }
        }
        return false;
      };

      findAndRemoveFromFolder(this.plugin.settings.folders);
    }
  }

  /**
   * Helper to get folder path (simplified version)
   */
  private getFolderPath(folderName: string, folders: Folder[]): string {
    for (const folder of folders) {
      if (folder.name === folderName) {
        return folderName;
      }
    }
    return folderName;
  }

  onClose() {
    this.contentEl.empty();
  }
}
