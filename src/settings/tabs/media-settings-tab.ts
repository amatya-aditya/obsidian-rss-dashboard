/**
 * Media Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderMediaSettingsTab(containerEl, plugin)
 *   - MastodonToggleConfirmModal
 */
import { App, Modal, Notice, Setting, normalizePath, WorkspaceLeaf } from "obsidian";
import { FeedParser } from "../../services/feed-parser";
import { MastodonService } from "../../services/mastodon-service";
import { FolderSuggest } from "../../components/folder-suggest";
import { Folder, FeedItem, PodcastTheme, Tag } from "../../types/types";
import type { MediaSettings } from "../../types/types";

interface MediaTabSettings {
  folders: Folder[];
  media: {
    autoTagVideos?: boolean;
    rememberPlaybackProgress?: boolean;
    defaultTwitterFolder: string;
    defaultMastodonFolder: string;
    defaultYouTubeFolder: string;
    defaultYouTubeTag: string;
    defaultPodcastFolder: string;
    defaultPodcastTag: string;
    defaultRssFolder: string;
    defaultRssTag: string;
    defaultSmallwebFolder: string;
    defaultSmallwebTag: string;
    useMastodonProfileImages?: boolean;
    podcastTheme: PodcastTheme;
  };
}

interface MediaSettingsPlugin {
  app: App;
  settings: MediaTabSettings;
  saveSettings(): Promise<void>;
  clearPlaybackProgress(): Promise<number>;
  getActiveReaderView?(): Promise<{
    updatePodcastTheme: (theme: PodcastTheme) => void;
  } | null>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
  } | null>;
}

export function renderMediaSettingsTab(
  containerEl: HTMLElement,
  plugin: MediaSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Auto-tag videos")
    .setDesc(
      "Automatically apply the configured video tag to detected video items",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.autoTagVideos ?? true)
        .onChange(async (value) => {
          plugin.settings.media.autoTagVideos = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl).setName("Playback progress").setHeading();

  new Setting(containerEl)
    .setName("Remember playback progress")
    .setDesc(
      "Save and restore podcast and video playback position across reader and plugin restarts",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.rememberPlaybackProgress ?? true)
        .onChange(async (value) => {
          plugin.settings.media.rememberPlaybackProgress = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Clear saved playback progress")
    .setDesc(
      "Remove all remembered podcast and video resume positions stored by the plugin",
    )
    .addButton((button) => {
      button
        .setButtonText("Clear progress")
        .setWarning()
        .onClick(async () => {
          const clearedCount = await plugin.clearPlaybackProgress();
          new Notice(
            clearedCount > 0
              ? `Cleared saved playback progress for ${clearedCount} item${clearedCount === 1 ? "" : "s"}.`
              : "No saved playback progress was found.",
          );
        });
    });

  // ── YouTube ───────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Twitter/X/Nitter").setHeading();

  new Setting(containerEl)
    .setName("Default Twitter folder")
    .setDesc("Default folder for Twitter/X/Nitter feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultTwitterFolder || "Twitter")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultTwitterFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl).setName("Mastodon").setHeading();

  new Setting(containerEl)
    .setName("Default Mastodon folder")
    .setDesc("Default folder for Mastodon feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultMastodonFolder || "Mastodon")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultMastodonFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Use profile images for Mastodon feeds")
    .setDesc(
      "Replace the standard Mastodon feed icon with the feed profile image when one is available",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.useMastodonProfileImages ?? false)
        .onChange(async (value) => {
          const oldValue = plugin.settings.media.useMastodonProfileImages ?? false;
          const settings = plugin.settings as unknown as Record<string, unknown>;
          const feeds = (settings.feeds as
            | Array<{
                url: string;
                iconUrl?: string;
                title: string;
                mediaType?: "article" | "video" | "podcast";
                items: FeedItem[];
              }>
            | undefined) ?? [];
          const availableTags = (settings.availableTags as
            | Array<{ name: string; id?: string }>
            | undefined) ?? [];

// ── Transition: OFF → ON ─────────────────────────────────────────
          if (!oldValue && value) {
            plugin.settings.media.useMastodonProfileImages = true;
            await plugin.saveSettings();

            // Re-fetch all Mastodon feed icons asynchronously
            void (async () => {
              const mastodonFeedEntries = collectMastodonFeeds(feeds);
              await fetchMastodonFeedIcons(
                mastodonFeedEntries.map((e) => ({
                  feed: e.feed,
                  needsRefresh: e.needsRefresh,
                })),
                plugin.settings.media as unknown as MediaSettings,
                availableTags,
              );
              new Notice(
                `Profile images loaded for ${mastodonFeedEntries.length} Mastodon feed${mastodonFeedEntries.length === 1 ? "" : "s"}.`,
              );
              const view = await plugin.getActiveDashboardView();
              if (view) {
                view.render();
              }
            })();
            return;
          }

          // ── Transition: ON → OFF ─────────────────────────────────────────
          if (oldValue && !value) {
            const mastodonFeedEntries = collectMastodonFeeds(feeds);
            const iconCountByUrl = new Map<string, number>();
            for (const { feed, needsRefresh } of mastodonFeedEntries) {
              if (needsRefresh && feed.iconUrl) {
                iconCountByUrl.set(
                  feed.url,
                  (iconCountByUrl.get(feed.url) || 0) + 1,
                );
              }
            }
            const iconCount = iconCountByUrl.size;

            const confirmed = await showMastodonToggleConfirm(plugin.app, {
              heading: "Clear Mastodon profile images?",
              description:
                iconCount > 0
                  ? `${iconCount} Mastodon feed${iconCount === 1 ? "" : "s"} currently use a profile image. Cached profile-image URLs in your feeds will be cleared. Cached favicons or domain images already shown in the feeds list are unaffected.`
                  : "Existing feeds may have cached profile-image URLs from when the setting was enabled. Cleared feeds will revert to the standard RSS or domain/favicon icon.",
              cancelLabel: "Cancel",
              confirmLabel: "Clear profile images",
              onConfirm() {
                for (const { feed } of mastodonFeedEntries) {
                  if (MastodonService.isResolvedFeedUrl(feed.url)) {
                    feed.iconUrl = "";
                  }
                }
              },
            });

            if (confirmed) {
              plugin.settings.media.useMastodonProfileImages = false;
              await plugin.saveSettings();
              const view = await plugin.getActiveDashboardView();
              if (view) {
                view.render();
              }
            } else {
              // User cancelled — revert the toggle to its previous (ON) state
              setTimeout(() => {
                void toggle.setValue(true);
              }, 0);
            }
            return;
          }

          // ── No-op: toggle was already in the target state ──────────────────
          plugin.settings.media.useMastodonProfileImages = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl).setName("YouTube").setHeading();

  new Setting(containerEl)
    .setName("Default YouTube folder")
    .setDesc("Default folder for YouTube feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultYouTubeFolder || "YouTube")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultYouTubeFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default YouTube tag")
    .setDesc("Tag used for auto-tagged video content")
    .addText((text) => {
      const currentTag = (
        plugin.settings.media as unknown as Record<string, unknown>
      ).defaultYouTubeTag;
      const initialValue =
        typeof currentTag === "string" && currentTag.trim().length > 0
          ? currentTag
          : "Video";

      text.setValue(initialValue).onChange(async (value) => {
        const nextValue =
          typeof value === "string" && value.trim().length > 0
            ? value.trim()
            : "Video";
        plugin.settings.media.defaultYouTubeTag = nextValue;
        await plugin.saveSettings();
      });
    });

  // Policy Compliance: YouTube TOS and Privacy disclosure
  const complianceInfo = containerEl.createDiv({
    cls: "rss-settings-compliance-info",
  });
  complianceInfo
    .createEl("p", {
      text: "This plugin uses the YouTube IFrame API for video playback. By using this feature, you agree to be bound by the ",
    })
    .createEl("a", {
      href: "https://www.youtube.com/t/terms",
      text: "YouTube Terms of Service",
    });
  complianceInfo.createEl("p", {
    cls: "setting-item-description",
    text: "Playback progress for videos and podcasts is stored locally in your vault's data.json file.",
  });

  // ── Podcast ───────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Podcast").setHeading();

  new Setting(containerEl)
    .setName("Default podcast folder")
    .setDesc("Default folder for podcast feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultPodcastFolder || "Podcast")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultPodcastFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default podcast tag")
    .setDesc("Default tag for podcast episodes")
    .addText((text) =>
      text
        .setValue(plugin.settings.media.defaultPodcastTag || "podcast")
        .onChange(async (value) => {
          plugin.settings.media.defaultPodcastTag = value;
          await plugin.saveSettings();
        }),
    );

  // ── RSS ───────────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("RSS").setHeading();

  new Setting(containerEl)
    .setName("Default RSS folder")
    .setDesc("Default folder for RSS feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultRssFolder || "RSS")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultRssFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default RSS tag")
    .setDesc("Default tag for RSS articles")
    .addText((text) =>
      text
        .setValue(plugin.settings.media.defaultRssTag || "rss")
        .onChange(async (value) => {
          plugin.settings.media.defaultRssTag = value;
          await plugin.saveSettings();
        }),
    );

  // ── Kagi smallweb ─────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Kagi smallweb").setHeading();

  new Setting(containerEl)
    .setName("Default smallweb folder")
    .setDesc("Default folder for smallweb feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultSmallwebFolder || "Smallweb")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultSmallwebFolder =
            normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default smallweb tag")
    .setDesc("Default tag for smallweb articles")
    .addText((text) =>
      text
        .setValue(plugin.settings.media.defaultSmallwebTag || "smallweb")
        .onChange(async (value) => {
          plugin.settings.media.defaultSmallwebTag = value;
          await plugin.saveSettings();
        }),
    );

  // ── Podcast player ────────────────────────────────────────────────────────
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
        .setValue(plugin.settings.media.podcastTheme)
        .onChange(async (value) => {
          const theme = value as PodcastTheme;
          plugin.settings.media.podcastTheme = theme;
          await plugin.saveSettings();
          const readerView = await plugin.getActiveReaderView?.();
          if (readerView) {
            readerView.updatePodcastTheme(theme);
          }
        }),
    );
}

// ── Mastodon Toggle Confirmation Modal ───────────────────────────────────────

interface MastodonToggleModalParams {
  heading: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm?: () => void;
}

export class MastodonToggleConfirmModal extends Modal {
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;
  private params: MastodonToggleModalParams;

  constructor(app: App, params: MastodonToggleModalParams) {
    super(app);
    this.params = params;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-mastodon-confirm-modal");
    contentEl.addClass("rss-dashboard-modal-content");
    contentEl.createEl("h2", { text: this.params.heading });
    contentEl.createEl("p", { text: this.params.description });

    const footerEl = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });
    const btnSetting = new Setting(footerEl);

    btnSetting
      .addButton((btn) =>
        btn.setButtonText(this.params.cancelLabel).onClick(() => {
          this.confirmed = false;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText(this.params.confirmLabel)
          .setWarning()
          .onClick(() => {
            if (this.params.onConfirm) this.params.onConfirm();
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.resolvePromise?.(this.confirmed);
  }

  waitForClose(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

/**
 * Collect all feeds; flag those whose URL matches the Mastodon resolved-feed
 * pattern (`*.rss` on a Mastodon host).
 */
function collectMastodonFeeds(
  feeds: ReadonlyArray<{
    url: string;
    iconUrl?: string;
    title: string;
    mediaType?: "article" | "video" | "podcast";
    items: FeedItem[];
  }>,
): Array<{
  feed: ReadonlyArray<{
    url: string;
    iconUrl?: string;
    title: string;
    mediaType?: "article" | "video" | "podcast";
    items: FeedItem[];
  }>[number];
  needsRefresh: boolean;
}> {
  return feeds.map((feed) => ({
    feed,
    needsRefresh: MastodonService.isResolvedFeedUrl(feed.url),
  }));
}

/**
 * Batch-refresh every flagged Mastodon feed so `feed.iconUrl` is repopulated
 * from the RSS `<image><url>` element (or cleared according to the resolved toggle).
 */
async function fetchMastodonFeedIcons(
  mastodonFeedEntries: ReadonlyArray<{
    feed: ReadonlyArray<{
      url: string;
      iconUrl?: string;
      title: string;
      mediaType?: "article" | "video" | "podcast";
      items: FeedItem[];
    }>[number];
    needsRefresh: boolean;
  }>,
  mediaSettings: MediaSettings,
  availableTags: ReadonlyArray<{ name: string; id?: string }>,
): Promise<void> {
  const feedsToRefresh = mastodonFeedEntries
    .filter((entry) => entry.needsRefresh)
    .map((entry) => entry.feed);

  if (feedsToRefresh.length === 0) return;

  // FeedParser constructor takes (MediaSettings, Tag[]) - cast availableTags to match
  const feedParser = new FeedParser(
    mediaSettings,
    availableTags as Tag[],
  );

  for (const feed of feedsToRefresh) {
    try {
      const refreshed = await feedParser.refreshFeed({
        ...feed,
        folder: "",
        lastUpdated: 0,
      });
      feed.iconUrl = refreshed.iconUrl;
    } catch (err) {
      console.warn(
        `[RSS dashboard] Failed to refresh Mastodon feed icon for "${feed.title}":`,
        err,
      );
    }
  }
}

/**
 * Build a MastodonToggleConfirmModal, open it, and wait for the user to choose.
 */
async function showMastodonToggleConfirm(
  app: App,
  params: MastodonToggleModalParams,
): Promise<boolean> {
  const modal = new MastodonToggleConfirmModal(app, params);
  modal.open();
  return await modal.waitForClose();
}
