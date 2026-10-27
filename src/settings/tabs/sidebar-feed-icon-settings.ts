/** Feed icon toggles for the Sidebar settings tab. */
import { Setting, Notice } from "obsidian";
import { MediaService } from "../../services/media-service";
import { MastodonService } from "../../services/mastodon-service";
import {
  collectDomainFeeds,
  fetchDomainFeedIcons,
  showDomainIconToggleConfirm,
} from "../../utils/domain-icon-helpers";
import { FeedItem, Feed } from "../../types/types";
import type { SidebarSettingsPlugin } from "./sidebar-settings-plugin";

// ── Feed icons ────────────────────────────────────────────────────────────────

export function renderFeedIconSettings(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
): void {
  new Setting(containerEl).setName("Feed icons").setHeading();

  // YouTube info message
  new Setting(containerEl)
    .setName("YouTube profile images")
    .setDesc(
      "YouTube RSS feeds do not provide channel profile images. Videos will always use the default video play icon.",
    );

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use site icons/favicons for RSS feeds",
    settingDesc:
      "Replace the standard RSS feed icon with the feed's own logo when it has one, otherwise the site favicon",
    settingKey: "useDomainIconsRss",
    domainName: "RSS",
    heading: "Clear RSS site icons?",
    confirmLabel: "Clear site icons",
    matchesDomain: (feed) =>
      !MastodonService.isResolvedFeedUrl(feed.url) &&
      !MediaService.isYouTubeFeed(feed.url) &&
      feed.mediaType !== "podcast",
    clearIconOnDisable: (entries) => {
      for (const { feed } of entries) {
        if (feed.iconUrl) {
          feed.iconUrl = "";
        }
      }
    },
  });

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use album/show artwork for Podcast feeds",
    settingDesc:
      "Replace the standard podcast mic icon with the album/show artwork when one is available",
    settingKey: "useDomainIconsPodcast",
    domainName: "Podcast",
    heading: "Clear podcast artwork?",
    confirmLabel: "Clear artwork",
    matchesDomain: (feed) => feed.mediaType === "podcast",
    clearIconOnDisable: (entries) => {
      for (const { feed } of entries) {
        if (feed.iconUrl) {
          feed.iconUrl = "";
        }
      }
    },
  });

  setupDomainIconToggle(containerEl, plugin, {
    settingName: "Use profile images for Mastodon feeds",
    settingDesc:
      "Replace the standard Mastodon feed icon with the feed profile image when one is available, otherwise the site favicon",
    settingKey: "useDomainIconsMastodon",
    domainName: "Mastodon",
    heading: "Clear Mastodon profile images?",
    confirmLabel: "Clear profile images",
    matchesDomain: (feed) => MastodonService.isResolvedFeedUrl(feed.url),
    clearIconOnDisable: (entries) => {
      for (const { feed } of entries) {
        if (MastodonService.isResolvedFeedUrl(feed.url)) {
          feed.iconUrl = "";
        }
      }
    },
  });
}

// Helper for domain icon toggles
function setupDomainIconToggle(
  containerEl: HTMLElement,
  plugin: SidebarSettingsPlugin,
  options: {
    settingName: string;
    settingDesc: string;
    settingKey:
      "useDomainIconsRss" | "useDomainIconsPodcast" | "useDomainIconsMastodon";
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
    clearIconOnDisable?: (
      entries: { feed: Feed; needsRefresh: boolean }[],
    ) => void;
  },
): void {
  const {
    settingName,
    settingDesc,
    settingKey,
    domainName,
    heading,
    confirmLabel,
    matchesDomain,
    clearIconOnDisable,
  } = options;

  new Setting(containerEl)
    .setName(settingName)
    .setDesc(settingDesc)
    .addToggle((toggle) =>
      toggle
        .setValue(!!plugin.settings.display[settingKey])
        .onChange(async (value) => {
          const oldValue = !!plugin.settings.display[settingKey];
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
              Array<{ name: string; id?: string }> | undefined) ?? [];

          // ── Transition: OFF → ON ─────────────────────────────────────────
          if (!oldValue && value) {
            plugin.settings.display[settingKey] = true;
            await plugin.saveSettings();

            // Re-fetch all matching feed icons asynchronously
            void (async () => {
              const entries = collectDomainFeeds(feeds, matchesDomain);
              await fetchDomainFeedIcons(
                entries,
                plugin.settings.display,
                availableTags,
                plugin.settings.media,
              );
              await plugin.saveSettings();
              new Notice(
                `Looked up profile images for ${entries.filter((e) => e.needsRefresh).length} ${domainName} feed${entries.filter((e) => e.needsRefresh).length === 1 ? "" : "s"}.`,
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
            const entries = collectDomainFeeds(feeds, matchesDomain);
            const iconCountByUrl = new Map<string, number>();
            for (const { feed, needsRefresh } of entries as {
              feed: Feed;
              needsRefresh: boolean;
            }[]) {
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
                clearIconOnDisable?.(
                  entries as { feed: Feed; needsRefresh: boolean }[],
                );
              },
            });

            if (confirmed) {
              plugin.settings.display[settingKey] = false;
              await plugin.saveSettings();
              const view = await plugin.getActiveDashboardView();
              if (view) {
                view.render();
              }
            } else {
              // User cancelled — revert the toggle to its previous (ON) state
              window.setTimeout(() => {
                void toggle.setValue(true);
              }, 0);
            }
            return;
          }

          // ── No-op: toggle was already in the target state ──────────────────
          plugin.settings.display[settingKey] = value;
          await plugin.saveSettings();
        }),
    );
}
