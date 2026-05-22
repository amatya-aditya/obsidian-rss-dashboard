/**
 * Media Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderMediaSettingsTab(containerEl, plugin)
 *   - MastodonToggleConfirmModal
 */
import {
  App,
  Modal,
  Notice,
  Setting,
  normalizePath,
  WorkspaceLeaf,
} from "obsidian";
import { FeedParser } from "../../services/feed-parser";
import { MastodonService } from "../../services/mastodon-service";
import { MediaService } from "../../services/media-service";
import { FolderSuggest } from "../../components/folder-suggest";
import {
  Folder,
  FeedItem,
  PodcastTheme,
  Tag,
  Feed,
  DEFAULT_SETTINGS,
} from "../../types/types";
import { addTagMultiSelectControl } from "../../components/tag-multi-select-control";
import type { MediaSettings } from "../../types/types";

interface MediaTabSettings {
  folders: Folder[];
  feeds?: Feed[];
  availableTags?: Tag[];
  media: MediaSettings;
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
  const videoTagSetting = new Setting(containerEl)
    .setName("Tag for video articles")
    .setDesc(
      "Default tag for RSS articles with detected video content (YouTube feeds use the dedicated tag below)",
    );
  addTagMultiSelectControl({
    setting: videoTagSetting,
    availableTags: plugin.settings.availableTags ?? [],
    selectedTagNames:
      (plugin.settings.media as { defaultVideoTags?: string[] })
        .defaultVideoTags ?? [],
    noneLabel: "(none)",
    onChange: async (selected: string[]) => {
      (
        plugin.settings.media as { defaultVideoTags?: string[] }
      ).defaultVideoTags = selected;
      await plugin.saveSettings();
    },
  });

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

  const twitterTagSetting = new Setting(containerEl)
    .setName("Default Twitter tag")
    .setDesc("Default tag for Twitter/X/Nitter feeds");
  addTagMultiSelectControl({
    setting: twitterTagSetting,
    availableTags: plugin.settings.availableTags ?? [],
    selectedTagNames:
      (plugin.settings.media as { defaultTwitterTags?: string[] })
        .defaultTwitterTags ?? [],
    noneLabel: "(none)",
    onChange: async (selected: string[]) => {
      (
        plugin.settings.media as { defaultTwitterTags?: string[] }
      ).defaultTwitterTags = selected;
      await plugin.saveSettings();
    },
  });

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use profile images for Twitter/Nitter feeds",
    settingDesc:
      "Replace the standard Twitter/X icon with the feed profile image when one is available",
    settingKey: "useDomainIconsTwitter",
    domainName: "Twitter",
    heading: "Clear Twitter profile images?",
    confirmLabel: "Clear profile images",
    matchesDomain: (feed) => MediaService.isTwitterOrNitterFeed(feed.url),
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
          plugin.settings.media.defaultMastodonFolder =
            normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

    const mastodonTagSetting = new Setting(containerEl)
    .setName("Default Mastodon tag")
    .setDesc("Default tag for Mastodon feeds");
  addTagMultiSelectControl({
    setting: mastodonTagSetting,
    availableTags: plugin.settings.availableTags ?? [],
    selectedTagNames:
      (plugin.settings.media as { defaultMastodonTags?: string[] })
        .defaultMastodonTags ?? [],
    noneLabel: "(none)",
    onChange: async (selected: string[]) => {
      (
        plugin.settings.media as { defaultMastodonTags?: string[] }
      ).defaultMastodonTags = selected;
      await plugin.saveSettings();
    },
  });

  new Setting(containerEl)
    .setName("Use profile images for Mastodon feeds")
    .setDesc(
      "Replace the standard Mastodon feed icon with the feed profile image when one is available",
    )
    .addToggle((toggle) =>
      toggle
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        .setValue(plugin.settings.media.useMastodonProfileImages ?? false)
        .onChange(async (value) => {
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          const oldValue = plugin.settings.media.useMastodonProfileImages ?? false;
          const settings = plugin.settings as unknown as Record<
            string,
            unknown
          >;
          const feeds =
            (settings.feeds as
              | Array<{
                  url: string;
                  iconUrl?: string;
                  title: string;
                  mediaType?: "article" | "video" | "podcast";
                  items: FeedItem[];
                }>
              | undefined) ?? [];
          const availableTags =
            (settings.availableTags as
              | Array<{ name: string; id?: string }>
              | undefined) ?? [];

          // ── Transition: OFF → ON ─────────────────────────────────────────
          if (!oldValue && value) {
            // eslint-disable-next-line @typescript-eslint/no-deprecated
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
              await plugin.saveSettings();
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

            const confirmed = await showDomainIconToggleConfirm(plugin.app, {
              domainName: "Mastodon",
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
              // eslint-disable-next-line @typescript-eslint/no-deprecated
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
          // eslint-disable-next-line @typescript-eslint/no-deprecated
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

  const youtubeTagSetting = new Setting(containerEl)
    .setName("Default YouTube tag")
    .setDesc("Tag used for auto-tagged video content");
  addTagMultiSelectControl({
    setting: youtubeTagSetting,
    availableTags: plugin.settings.availableTags ?? [],
    selectedTagNames:
      (plugin.settings.media as { defaultYouTubeTags?: string[] })
        .defaultYouTubeTags ?? [],
    noneLabel: "(none)",
    onChange: async (selected: string[]) => {
      (
        plugin.settings.media as { defaultYouTubeTags?: string[] }
      ).defaultYouTubeTags = selected;
      await plugin.saveSettings();
    },
  });

  new Setting(containerEl)
    .setName("Channel profile images")
    .setDesc(
      "YouTube RSS feeds do not provide channel profile images. Videos will always use the default video play icon.",
    );
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

  const podcastTagSetting = new Setting(containerEl)
    .setName("Default podcast tag")
    .setDesc("Default tag for podcast episodes");
  addTagMultiSelectControl({
    setting: podcastTagSetting,
    availableTags: plugin.settings.availableTags ?? [],
    selectedTagNames:
      (plugin.settings.media as { defaultPodcastTags?: string[] })
        .defaultPodcastTags ?? [],
    noneLabel: "(none)",
    onChange: async (selected: string[]) => {
      (
        plugin.settings.media as { defaultPodcastTags?: string[] }
      ).defaultPodcastTags = selected;
      await plugin.saveSettings();
    },
  });

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use album/show artwork for Podcast feeds",
    settingDesc:
      "Replace the standard podcast mic icon with the album/show artwork when one is available",
    settingKey: "useDomainIconsPodcast",
    domainName: "Podcast",
    heading: "Clear Podcast artwork?",
    confirmLabel: "Clear artwork",
    matchesDomain: (feed) => feed.mediaType === "podcast",
  });

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

  const rssTagSetting = new Setting(containerEl)
    .setName("Default RSS tag")
    .setDesc("Default tag for RSS articles");
  addTagMultiSelectControl({
    setting: rssTagSetting,
    availableTags: plugin.settings.availableTags ?? [],
    selectedTagNames:
      (plugin.settings.media as { defaultRssTags?: string[] })
        .defaultRssTags ?? [],
    noneLabel: "(none)",
    onChange: async (selected: string[]) => {
      (
        plugin.settings.media as { defaultRssTags?: string[] }
      ).defaultRssTags = selected;
      await plugin.saveSettings();
    },
  });

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use site icons/favicons for RSS feeds",
    settingDesc:
      "Replace the standard RSS feed icon with the site icon/favicon when one is available",
    settingKey: "useDomainIconsRss",
    domainName: "RSS",
    heading: "Clear RSS site icons?",
    confirmLabel: "Clear site icons",
    matchesDomain: (feed) =>
      !MastodonService.isResolvedFeedUrl(feed.url) &&
      !MediaService.isYouTubeFeed(feed.url) &&
      feed.mediaType !== "podcast" &&
      !MediaService.isTwitterOrNitterFeed(feed.url),
  });

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

  const smallwebTagSetting = new Setting(containerEl)
    .setName("Default smallweb tag")
    .setDesc("Default tag for smallweb articles");
  addTagMultiSelectControl({
    setting: smallwebTagSetting,
    availableTags: plugin.settings.availableTags ?? [],
    selectedTagNames:
      (plugin.settings.media as { defaultSmallwebTags?: string[] })
        .defaultSmallwebTags ?? [],
    noneLabel: "(none)",
    onChange: async (selected: string[]) => {
      (
        plugin.settings.media as { defaultSmallwebTags?: string[] }
      ).defaultSmallwebTags = selected;
      await plugin.saveSettings();
    },
  });

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

  new Setting(containerEl).setName("Third-party services").setHeading();

  const youtubeTosSetting = new Setting(containerEl).setName(
    "YouTube Terms of Service",
  );

  youtubeTosSetting.descEl.createSpan({
    text: "This plugin uses the YouTube IFrame API for video playback. By using this feature, you agree to be bound by the ",
  });

  youtubeTosSetting.descEl.createEl("a", {
    text: "YouTube Terms of Service",
    href: "https://www.youtube.com/t/terms",
    attr: { target: "_blank", rel: "noopener noreferrer" },
  });

  // ── Reset folder names ────────────────────────────────────────────────────
  new Setting(containerEl)
    .setName("Reset folder names")
    .setDesc("Restore all folder names to their out-of-the-box defaults.")
    .addButton((button) => {
      button.setButtonText("Default folder names").onClick(async () => {
        const d = DEFAULT_SETTINGS.media;
        plugin.settings.media.defaultTwitterFolder = d.defaultTwitterFolder;
        plugin.settings.media.defaultMastodonFolder = d.defaultMastodonFolder;
        plugin.settings.media.defaultYouTubeFolder = d.defaultYouTubeFolder;
        plugin.settings.media.defaultPodcastFolder = d.defaultPodcastFolder;
        plugin.settings.media.defaultRssFolder = d.defaultRssFolder;
        plugin.settings.media.defaultSmallwebFolder = d.defaultSmallwebFolder;
        await plugin.saveSettings();
        new Notice("Folder names restored to defaults.");
        // Re-render the settings tab so the text inputs reflect the reset values.
        const view = await plugin.getActiveDashboardView();
        if (view) view.render();
        containerEl.empty();
        renderMediaSettingsTab(containerEl, plugin);
      });
    });

  // ── Reset tag names ────────────────────────────────────────────────────────
  new Setting(containerEl)
    .setName("Reset tag names")
    .setDesc("Restore all tag names to their out-of-the-box defaults.")
    .addButton((button) => {
      button.setButtonText("Default tag names").onClick(async () => {
        const d = DEFAULT_SETTINGS.media;
        plugin.settings.media.defaultVideoTag = d.defaultVideoTag;
        plugin.settings.media.defaultVideoTags = d.defaultVideoTags;
        plugin.settings.media.defaultYouTubeTag = d.defaultYouTubeTag;
        plugin.settings.media.defaultYouTubeTags = d.defaultYouTubeTags;
        plugin.settings.media.defaultPodcastTag = d.defaultPodcastTag;
        plugin.settings.media.defaultPodcastTags = d.defaultPodcastTags;
        plugin.settings.media.defaultRssTag = d.defaultRssTag;
        plugin.settings.media.defaultRssTags = d.defaultRssTags;
        plugin.settings.media.defaultSmallwebTag = d.defaultSmallwebTag;
        plugin.settings.media.defaultSmallwebTags = d.defaultSmallwebTags;
        plugin.settings.media.defaultTwitterTag = d.defaultTwitterTag;
        plugin.settings.media.defaultTwitterTags = d.defaultTwitterTags;
        plugin.settings.media.defaultMastodonTag = d.defaultMastodonTag;
        plugin.settings.media.defaultMastodonTags = d.defaultMastodonTags;
        await plugin.saveSettings();
        new Notice("Tag names restored to defaults.");
        // Re-render the settings tab so the inputs reflect the reset values.
        const view = await plugin.getActiveDashboardView();
        if (view) view.render();
        containerEl.empty();
        renderMediaSettingsTab(containerEl, plugin);
      });
    });
}

function setupDomainIconToggle(
  containerEl: HTMLElement,
  plugin: MediaSettingsPlugin,
  options: {
    settingName: string;
    settingDesc: string;
    settingKey: keyof MediaTabSettings["media"];
    domainName: string;
    heading: string;
    confirmLabel: string;
    matchesDomain: (feed: {
      url: string;
      iconUrl?: string;
      title: string;
      mediaType?: "article" | "video" | "podcast";
      items: FeedItem[];
    }) => boolean;
  },
) {
  const {
    settingName,
    settingDesc,
    settingKey,
    domainName,
    heading,
    confirmLabel,
    matchesDomain,
  } = options;

  new Setting(containerEl)
    .setName(settingName)
    .setDesc(settingDesc)
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.media[settingKey])
        .onChange(async (value) => {
          const oldValue = !!(
            plugin.settings.media as unknown as Record<string, boolean>
          )[settingKey];
          const settings = plugin.settings;
          const feeds = settings.feeds ?? [];
          const availableTags = settings.availableTags ?? [];

          if (!oldValue && value) {
            (plugin.settings.media as unknown as Record<string, boolean>)[
              settingKey
            ] = true;
            await plugin.saveSettings();

            void (async () => {
              const entries = collectDomainFeeds(feeds, matchesDomain);
              await fetchDomainFeedIcons(
                entries,
                plugin.settings.media as unknown as MediaSettings,
                availableTags,
              );
              await plugin.saveSettings();
              new Notice(
                `Profile images loaded for ${entries.filter((e) => e.needsRefresh).length} ${domainName} feed${entries.filter((e) => e.needsRefresh).length === 1 ? "" : "s"}.`,
              );
              const view = await plugin.getActiveDashboardView();
              if (view) {
                view.render();
              }
            })();
            return;
          }

          if (oldValue && !value) {
            const entries = collectDomainFeeds(feeds, matchesDomain);
            const iconCountByUrl = new Map<string, number>();
            for (const { feed, needsRefresh } of entries) {
              if (needsRefresh && feed.iconUrl) {
                iconCountByUrl.set(
                  feed.url,
                  (iconCountByUrl.get(feed.url) || 0) + 1,
                );
              }
            }
            const iconCount = iconCountByUrl.size;

            const confirmed = await showDomainIconToggleConfirm(plugin.app, {
              domainName,
              heading,
              description:
                iconCount > 0
                  ? `${iconCount} ${domainName} feed${iconCount === 1 ? "" : "s"} currently use a profile image. Cached profile-image URLs in your feeds will be cleared. Cached favicons or domain images already shown in the feeds list are unaffected.`
                  : `Existing feeds may have cached profile-image URLs from when the setting was enabled. Cleared feeds will revert to the standard RSS or domain/favicon icon.`,
              cancelLabel: "Cancel",
              confirmLabel,
              onConfirm() {
                for (const { feed, needsRefresh } of entries) {
                  if (needsRefresh) {
                    feed.iconUrl = "";
                  }
                }
              },
            });

            if (confirmed) {
              (plugin.settings.media as unknown as Record<string, boolean>)[
                settingKey
              ] = false;
              await plugin.saveSettings();
              const view = await plugin.getActiveDashboardView();
              if (view) {
                view.render();
              }
            } else {
              setTimeout(() => {
                void toggle.setValue(true);
              }, 0);
            }
            return;
          }

          (plugin.settings.media as unknown as Record<string, boolean>)[
            settingKey
          ] = value;
          await plugin.saveSettings();
        }),
    );
}

// ── Domain Icon Toggle Confirmation Modal ────────────────────────────────────

export interface DomainIconToggleModalParams {
  domainName: string;
  heading: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm?: () => void;
}

export class DomainIconToggleConfirmModal extends Modal {
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;
  private params: DomainIconToggleModalParams;

  constructor(app: App, params: DomainIconToggleModalParams) {
    super(app);
    this.params = params;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rss-dashboard-modal");

    const domainClass = this.params.domainName
      ? this.params.domainName.toLowerCase().replace(/[^a-z0-9]/g, "-")
      : "mastodon";
    this.modalEl.addClass(`rss-dashboard-${domainClass}-confirm-modal`);

    contentEl.addClass("rss-dashboard-modal-content");

    const headingText = this.params.heading.replace(
      /\{domainName\}/g,
      this.params.domainName,
    );
    const descriptionText = this.params.description.replace(
      /\{domainName\}/g,
      this.params.domainName,
    );

    contentEl.createEl("h2", { text: headingText });
    contentEl.createEl("p", { text: descriptionText });

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
 * Collect all feeds and determine which ones match the given domain logic.
 */
export function collectDomainFeeds(
  feeds: ReadonlyArray<{
    url: string;
    iconUrl?: string;
    title: string;
    mediaType?: "article" | "video" | "podcast";
    items: FeedItem[];
  }>,
  matchesDomain: (feed: {
    url: string;
    iconUrl?: string;
    title: string;
    mediaType?: "article" | "video" | "podcast";
    items: FeedItem[];
  }) => boolean,
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
    needsRefresh: matchesDomain(feed),
  }));
}

/**
 * Batch-refresh every flagged feed so `feed.iconUrl` is repopulated
 * or cleared according to the resolved toggle.
 */
export async function fetchDomainFeedIcons(
  entries: ReadonlyArray<{
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
  const feedsToRefresh = entries
    .filter((entry) => entry.needsRefresh)
    .map((entry) => entry.feed);

  if (feedsToRefresh.length === 0) return;

  const feedParser = new FeedParser(mediaSettings, availableTags as Tag[]);

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
        `[RSS dashboard] Failed to refresh feed icon for "${feed.title}":`,
        err,
      );
    }
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
  return collectDomainFeeds(feeds, (feed) =>
    MastodonService.isResolvedFeedUrl(feed.url),
  );
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
  await fetchDomainFeedIcons(mastodonFeedEntries, mediaSettings, availableTags);
}

/**
 * Build a DomainIconToggleConfirmModal, open it, and wait for the user to choose.
 */
export async function showDomainIconToggleConfirm(
  app: App,
  params: DomainIconToggleModalParams,
): Promise<boolean> {
  const modal = new DomainIconToggleConfirmModal(app, params);
  modal.open();
  return await modal.waitForClose();
}

/** @deprecated Use DomainIconToggleConfirmModal instead */
export { DomainIconToggleConfirmModal as MastodonToggleConfirmModal };

/** @deprecated Use showDomainIconToggleConfirm instead */
export { showDomainIconToggleConfirm as showMastodonToggleConfirm };
