import { Modal, App, Setting, Notice } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { Feed, Folder, SavedTemplate } from "../types/types";
import { FolderSuggest } from "../components/folder-suggest";
import {
  resolvePodcastPlatformUrl,
  loadFeedForPreview,
} from "../services/feed-parser";
import { detectPodcastPlatform } from "../utils/podcast-platforms";
import { MediaService } from "../services/media-service";

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
    this.modalEl.addClasses([
      "rss-dashboard-modal",
      "rss-dashboard-modal-container",
    ]);
    contentEl.empty();
    new Setting(contentEl).setName("Edit feed").setHeading();
    let title = this.feed.title;
    let url = this.feed.url;
    let folder = this.feed.folder || "";
    let status = "";
    let latestEntry = "-";
    let titleInput: HTMLInputElement;
    let urlInput: HTMLInputElement;
    let folderInput: HTMLInputElement;
    const refs: {
      statusDiv?: HTMLDivElement;
      latestEntryDiv?: HTMLDivElement;
    } = {};

    new Setting(contentEl)
      .setName("Feed URL")
      .addText((text) => {
        text.setValue(url).onChange((v) => (url = v));
        urlInput = text.inputEl;
        urlInput.autocomplete = "off";
        urlInput.spellcheck = false;
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
        btn.setButtonText("Load").onClick(() => {
          void (async () => {
            status = "Loading...";
            if (refs.statusDiv) {
              refs.statusDiv.textContent = status;
              refs.statusDiv.removeClass("rss-dashboard-status-warning");
            }
            try {
              let feedUrl = url;

              // Check for YouTube page URLs and convert to RSS feed
              if (isYouTubePageUrl(url)) {
                status = "Resolving YouTube channel...";
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
                status = "Loading YouTube feed...";
                if (refs.statusDiv) refs.statusDiv.textContent = status;
              } else {
                // Check for podcast platform URLs
                const platform = detectPodcastPlatform(url);
                if (platform) {
                  status = `Resolving ${platform.name} URL...`;
                  if (refs.statusDiv) refs.statusDiv.textContent = status;
                  const resolvedUrl = await resolvePodcastPlatformUrl(url);
                  if (!resolvedUrl) {
                    throw new Error("Could not resolve podcast feed URL");
                  }
                  feedUrl = resolvedUrl;
                  url = resolvedUrl;
                  if (urlInput) urlInput.value = feedUrl;
                  status = "Loading feed...";
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
              status = "OK";
            } catch (e) {
              status = "Error loading feed";
              latestEntry = "-";
              if (refs.latestEntryDiv)
                refs.latestEntryDiv.textContent = latestEntry;
              console.error("Feed load error:", e);
            }
            if (refs.statusDiv) refs.statusDiv.textContent = status;
          })();
        });
      });

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

    const latestEntrySetting = new Setting(contentEl).setName(
      "Latest entry posted",
    );
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

    const btns = contentEl.createDiv("rss-dashboard-modal-buttons");
    const saveBtn = btns.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button",
    });
    const cancelBtn = btns.createEl("button", { text: "Cancel" });
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
  ) => Promise<void>;
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
    ) => Promise<void>,
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
            // Set loading state
            status = "⏳ Loading...";
            loadBtn.addClass("loading");
            loadBtn.disabled = true;
            if (refs.statusDiv) {
              refs.statusDiv.textContent = status;
              refs.statusDiv.removeClass("rss-dashboard-status-warning");
              refs.statusDiv.removeClass("status-ok");
              refs.statusDiv.removeClass("status-error");
              refs.statusDiv.addClass("status-loading");
            }
            try {
              let feedUrl = url;

              // Check for YouTube page URLs and convert to RSS feed
              if (isYouTubePageUrl(url)) {
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

                // Auto-set folder to default YouTube folder if not already set by user
                const defaultYouTubeFolder =
                  this.plugin?.settings?.media?.defaultYouTubeFolder ||
                  "Videos";
                console.warn("[YouTube] Load handler - folder check:", {
                  hasFolderInput: !!folderInput,
                  folderInputValue: folderInput?.value,
                  folder,
                  defaultYouTubeFolder,
                });
                // Check if folder is empty or still at default "Uncategorized"
                if (
                  folderInput &&
                  (!folderInput.value || folderInput.value === "Uncategorized")
                ) {
                  folder = defaultYouTubeFolder;
                  folderInput.value = defaultYouTubeFolder;
                  console.warn(
                    "[YouTube] Set folder to:",
                    defaultYouTubeFolder,
                    "folderInput.value is now:",
                    folderInput.value,
                  );
                }
              } else {
                // Check for podcast platform URLs
                const platform = detectPodcastPlatform(url);
                if (platform) {
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
                latestEntry = daysAgo === 0 ? "Today" : `${daysAgo} days`;
              } else {
                latestEntry = "N/A";
              }
              if (refs.latestEntryDiv)
                refs.latestEntryDiv.textContent = latestEntry;
              status = "OK";
              // Success state
              if (refs.statusDiv) {
                refs.statusDiv.textContent = "✅ OK";
                refs.statusDiv.removeClass("status-loading");
                refs.statusDiv.addClass("status-ok");
              }
              if (urlInput) {
                urlInput.addClass("loaded");
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

    const btns = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });
    const saveBtn = btns.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button",
    });
    const cancelBtn = btns.createEl("button", { text: "Cancel" });
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
        await this.onAdd(
          title,
          url,
          finalFolder,
          autoDeleteDuration,
          maxItemsLimit,
          scanInterval,
        ).catch(() => {
          /* ignore */
        });
        this.onSave();
        this.close();
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
    this.modalEl.className +=
      " rss-dashboard-modal rss-dashboard-modal-container";
    contentEl.empty();
    new Setting(contentEl).setName("Manage feeds").setHeading();

    // Search and Add Feed button container
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
    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderFeeds(contentEl);
    });

    const addFeedBtn = topControls.createEl("button", {
      text: "Add feed",
      cls: "rss-dashboard-primary-button feed-manager-add-button",
    });
    addFeedBtn.onclick = () => {
      new AddFeedModal(
        this.app,
        this.plugin.settings.folders,
        (title, url, folder, autoDeleteDuration, maxItemsLimit, scanInterval) =>
          this.plugin.addFeed(
            title,
            url,
            folder,
            autoDeleteDuration,
            maxItemsLimit,
            scanInterval,
          ),
        () => this.onOpen(),
        "",
        this.plugin,
      ).open();
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
        new Setting(folderDiv).setName(folderPath).setHeading();
        for (const feed of feeds) {
          this.renderFeedRow(folderDiv, feed);
        }
      }
    }

    if (uncategorized.length > 0) {
      const uncategorizedDiv = feedsContainer.createDiv({
        cls: "feed-manager-folder",
      });
      new Setting(uncategorizedDiv).setName("Uncategorized").setHeading();
      for (const feed of uncategorized) {
        this.renderFeedRow(uncategorizedDiv, feed);
      }
    }
  }

  renderFeedRow(parent: HTMLElement, feed: Feed) {
    const row = parent.createDiv({ cls: "feed-manager-row" });
    row.createDiv({ text: feed.title, cls: "feed-manager-title" });

    const editBtn = row.createEl("button", { text: "Edit" });
    editBtn.onclick = () => {
      new EditFeedModal(this.app, this.plugin, feed, () =>
        this.onOpen(),
      ).open();
    };

    const delBtn = row.createEl("button", { text: "Delete" });
    delBtn.onclick = () => {
      this.showConfirmModal(`Delete feed '${feed.title}'?`, () => {
        this.plugin.settings.feeds = this.plugin.settings.feeds.filter(
          (f) => f !== feed,
        );
        void this.plugin.saveSettings().then(() => {
          new Notice("Feed deleted");
          this.onOpen();
        });
      });
    };
  }

  private showConfirmModal(message: string, onConfirm: () => void): void {
    document
      .querySelectorAll(".rss-dashboard-modal")
      .forEach((el) => el.remove());
    window.setTimeout(() => {
      const modal = document.body.createDiv({
        cls: "rss-dashboard-modal",
      });
      const modalContent = modal.createDiv({
        cls: "rss-dashboard-modal-content",
      });
      new Setting(modalContent).setName("Confirm").setHeading();
      modalContent.createDiv({
        text: message,
      });
      const buttonContainer = modalContent.createDiv({
        cls: "rss-dashboard-modal-buttons",
      });
      const cancelButton = buttonContainer.createEl("button", {
        text: "Cancel",
      });
      cancelButton.onclick = () => document.body.removeChild(modal);
      const okButton = buttonContainer.createEl("button", {
        text: "OK",
        cls: "rss-dashboard-primary-button",
      });
      okButton.onclick = () => {
        document.body.removeChild(modal);
        onConfirm();
      };
      window.setTimeout(() => okButton.focus(), 0);
    }, 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}
