/**
 * Domain icon toggle helpers.
 *
 * Extracted from media-settings-tab.ts for use across settings tabs.
 * Exports:
 *   - collectDomainFeeds(feeds, matchesDomain)   — collects feeds matching a domain predicate
 *   - fetchDomainFeedIcons(entries, mediaSettings, availableTags) — refreshes feed icons
 *   - collectMastodonFeeds(feeds) — collects Mastodon feeds specifically
 *   - fetchMastodonFeedIcons(entries, mediaSettings, availableTags) — refreshes Mastodon feed icons
 *   - DomainIconToggleConfirmModal — modal for confirming domain icon toggles
 *   - showDomainIconToggleConfirm(app, params) — shows modal and returns confirmation
 */
import { App, Modal, Setting } from "obsidian";
import { FeedParser } from "../services/feed-parser";
import { MastodonService } from "../services/mastodon-service";
import {
  FeedItem,
  Tag,
  DisplaySettings,
  MediaSettings,
} from "../types/types";

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

// ── Feed collection helpers ──────────────────────────────────────────────────

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
 * Collect all feeds; flag those whose URL matches the Mastodon resolved-feed
 * pattern (`*.rss` on a Mastodon host).
 */
export function collectMastodonFeeds(
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

// ── Feed icon refresh helpers ───────────────────────────────────────────────

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
   displaySettings: DisplaySettings,
   availableTags: ReadonlyArray<{ name: string; id?: string }>,
   mediaSettings?: MediaSettings,
): Promise<void> {
   const feedsToRefresh = entries
     .filter((entry) => entry.needsRefresh)
     .map((entry) => entry.feed);

   if (feedsToRefresh.length === 0) return;

   const feedParser = new FeedParser(displaySettings, availableTags as Tag[], mediaSettings);

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
 * Batch-refresh every flagged Mastodon feed so `feed.iconUrl` is repopulated
 * from the RSS `<image><url>` element (or cleared according to the resolved toggle).
 */
export async function fetchMastodonFeedIcons(
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
   displaySettings: DisplaySettings,
   availableTags: ReadonlyArray<{ name: string; id?: string }>,
   mediaSettings?: MediaSettings,
): Promise<void> {
   await fetchDomainFeedIcons(mastodonFeedEntries, displaySettings, availableTags, mediaSettings);
}
