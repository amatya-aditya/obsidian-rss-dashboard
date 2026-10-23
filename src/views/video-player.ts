import { Notice, Setting, setIcon } from "obsidian";
import { renderReaderTagChips } from "../utils/reader-tag-chips";
import { FeedItem, Tag } from "../types/types";
import { youTubeWatchUrl } from "../utils/youtube-embed";
import {
  YOUTUBE_PLAYER_ALLOW,
  YOUTUBE_PLAYER_REFERRER_POLICY,
  youTubePlayerSourceUrl,
} from "../utils/youtube-player-source";
import {
  connectYouTubePlayerChannel,
  YouTubePlayerUpdate,
} from "../utils/youtube-player-channel";
import {
  TWITCH_PLAYER_ALLOW,
  twitchChannelWatchUrl,
  twitchLivePlayerSourceUrl,
  twitchPlayerSourceUrl,
  twitchVodWatchUrl,
} from "../utils/twitch-embed";
import { resolveVideoSource, type VideoSource } from "../utils/video-source";
import { resolveDisplayDate } from "../services/feed-parser/feed-retention";
import { moveFocusIfRemoved } from "../utils/focus-utils";

export class VideoPlayer {
  private container: HTMLElement;
  private currentItem: FeedItem | null = null;
  private playerEl: HTMLElement | null = null;
  private iframeEl: HTMLIFrameElement | null = null;
  private videoContainerEl: HTMLElement | null = null;
  private watchLinkEl: HTMLElement | null = null;
  private progressInterval: number | null = null;
  /** The player's last reported position; null until it reports one. */
  private reportedPosition: number | null = null;
  private lastSavedPosition: number | null = null;
  /** The video the player last said it is on, and its last state. */
  private playerVideoId: string | null = null;
  private playerState: number | null = null;
  private progressTrackingEnabled: boolean;
  private onVideoSelect?: (item: FeedItem) => void;
  private onPlaybackProgress?: (
    item: FeedItem,
    position: number,
    duration: number,
    flush?: boolean,
  ) => void;
  private relatedVideos: FeedItem[] = [];
  private disconnectPlayer: (() => void) | null = null;
  private videoDuration: number | null = null;
  private useFirstSeenDateFallback: boolean;
  private focusMode: boolean;
  private relatedEl: HTMLElement | null = null;
  private tagsEl: HTMLElement | null = null;
  private tags: Tag[] | undefined;
  private detailsEl: HTMLElement | null = null;
  private descriptionEl: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    onVideoSelect?: (item: FeedItem) => void,
    onPlaybackProgress?: (
      item: FeedItem,
      position: number,
      duration: number,
      flush?: boolean,
    ) => void,
    progressTrackingEnabled = true,
    useFirstSeenDateFallback = false,
    focusMode = false,
  ) {
    this.container = container;
    this.onVideoSelect = onVideoSelect;
    this.onPlaybackProgress = onPlaybackProgress;
    this.progressTrackingEnabled = progressTrackingEnabled;
    this.useFirstSeenDateFallback = useFirstSeenDateFallback;
    this.focusMode = focusMode;
  }

  private formatVideoDate(item: FeedItem): string {
    const displayDate = resolveDisplayDate(item, this.useFirstSeenDateFallback);
    return displayDate ? displayDate.toLocaleDateString() : "Unknown date";
  }

  loadVideo(item: FeedItem): void {
    if (!resolveVideoSource(item)) {
      new Notice("No video id provided");
      return;
    }

    try {
      // Save the video being left before the player is replaced.
      this.stopTracking();
      this.disconnect();
      this.saveProgress(true);
      this.currentItem = item;
      this.reportedPosition = null;
      this.videoDuration = null;
      this.playerVideoId = null;
      this.playerState = null;
      this.lastSavedPosition = item.playbackProgress?.position ?? null;
      this.render();
    } catch (error) {
      const msg = `Error loading video: ${error instanceof Error ? error.message : "Unknown error"}`;
      new Notice(msg);
    }
  }

  private render(): void {
    const source = this.currentItem && resolveVideoSource(this.currentItem);
    if (!this.currentItem || !source) return;

    this.container.empty();
    this.playerEl = this.container.createDiv({ cls: "rss-video-player" });

    const videoContainer = this.playerEl.createDiv({
      cls: "rss-video-container",
    });
    this.videoContainerEl = videoContainer;
    const iframe =
      source.kind === "youtube"
        ? this.createYouTubeIframe(videoContainer, source.id)
        : this.createTwitchIframe(videoContainer, source);
    this.iframeEl = iframe;

    videoContainer.appendChild(iframe);
    if (!this.focusMode) {
      this.renderWatchLink(source);
    }
    // Twitch's embed has no position channel, so only YouTube reports progress.
    // A live stream has no position to resume either way.
    if (source.kind === "youtube") this.connectPlayer(iframe);

    this.tags = this.currentItem.tags;
    this.renderDetails();
    this.renderRelatedVideos();
  }

  private createYouTubeIframe(
    videoContainer: HTMLElement,
    videoId: string,
  ): HTMLIFrameElement {
    const iframe = videoContainer.win.createEl("iframe");
    iframe.id = `yt-player-${Math.random().toString(36).substring(2, 11)}`;
    // Obsidian's embed host from a non-https origin, the plain nocookie embed
    // otherwise. The host is what makes desktop and iOS play; a direct embed
    // from Obsidian's `app://` origin is refused by YouTube (#1173, #1178).
    iframe.src = youTubePlayerSourceUrl(videoId, {
      autoplay: true,
      startSeconds: this.resumeSeconds(),
    });
    iframe.setAttribute("allow", YOUTUBE_PLAYER_ALLOW);
    iframe.setAttribute("referrerpolicy", YOUTUBE_PLAYER_REFERRER_POLICY);
    iframe.allowFullscreen = true;
    return iframe;
  }

  private createTwitchIframe(
    videoContainer: HTMLElement,
    source: Exclude<VideoSource, { kind: "youtube" }>,
  ): HTMLIFrameElement {
    const iframe = videoContainer.win.createEl("iframe");
    iframe.id = `twitch-player-${Math.random().toString(36).substring(2, 11)}`;
    iframe.src =
      source.kind === "twitch-live"
        ? twitchLivePlayerSourceUrl(source.id)
        : twitchPlayerSourceUrl(source.id, { autoplay: true });
    iframe.setAttribute("allow", TWITCH_PLAYER_ALLOW);
    iframe.allowFullscreen = true;
    return iframe;
  }

  /**
   * The saved resume position in seconds, or undefined when progress tracking
   * is off or nothing was saved. The player starts there through `start`.
   */
  private resumeSeconds(): number | undefined {
    if (!this.progressTrackingEnabled) return undefined;
    const position = this.currentItem?.playbackProgress?.position;
    return position && position > 0 ? position : undefined;
  }

  /**
   * The always-visible fallback, shown whether or not the player loads. The
   * host is undocumented, so the link must work on its own.
   */
  private renderWatchLink(source?: VideoSource): void {
    const currentSource =
      source ??
      (this.currentItem ? resolveVideoSource(this.currentItem) : null);
    if (!this.playerEl || !currentSource) return;
    this.watchLinkEl?.remove();
    const link = this.playerEl.createEl("a", { cls: "rss-video-watch" });
    // The play glyph takes the player's brand color, so a Twitch link must not
    // carry YouTube's red.
    if (currentSource.kind !== "youtube")
      link.addClass("rss-video-watch--twitch");
    link.href = this.watchUrl(currentSource);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const icon = link.createSpan({ cls: "rss-video-watch-icon" });
    setIcon(icon, "play");
    link.appendChild(
      this.playerEl.ownerDocument.createTextNode(
        currentSource.kind === "youtube"
          ? "Watch on YouTube"
          : "Watch on Twitch",
      ),
    );
    if (this.videoContainerEl) {
      this.videoContainerEl.insertAdjacentElement("afterend", link);
    }
    this.watchLinkEl = link;
  }

  private watchUrl(source: VideoSource): string {
    switch (source.kind) {
      case "youtube":
        return youTubeWatchUrl(source.id);
      case "twitch":
        return twitchVodWatchUrl(source.id);
      case "twitch-live":
        return twitchChannelWatchUrl(source.id);
    }
  }

  /**
   * Focus mode shows only the video: it drops everything below it (watch link,
   * title, channel, date, tag chips, description and the related list). Only
   * those blocks are added or removed, so the iframe and playback state survive
   * a preference change (#1538).
   */
  setFocusMode(enabled: boolean, focusFallback?: HTMLElement | null): void {
    if (this.focusMode === enabled) return;
    this.focusMode = enabled;
    if (this.focusMode) {
      if (this.watchLinkEl) {
        moveFocusIfRemoved(this.watchLinkEl, focusFallback);
        this.watchLinkEl.remove();
        this.watchLinkEl = null;
      }
    } else {
      this.renderWatchLink();
    }
    this.renderDetails();
    this.renderRelatedVideos();
  }

  private renderDetails(): void {
    this.detailsEl?.remove();
    this.detailsEl = null;
    this.tagsEl = null;
    this.descriptionEl = null;
    if (this.focusMode || !this.playerEl || !this.currentItem) return;

    const details = this.playerEl.createDiv({ cls: "rss-video-details" });
    const titleSetting = new Setting(details)
      .setName(this.currentItem.title)
      .setHeading();
    titleSetting.settingEl.addClass("rss-video-title");

    const metaContainer = details.createDiv({ cls: "rss-video-meta" });
    metaContainer.createDiv({
      cls: "rss-video-channel",
      text: this.currentItem.feedTitle,
    });
    metaContainer.createDiv({
      cls: "rss-video-date",
      text: this.formatVideoDate(this.currentItem),
    });

    this.tagsEl = details.createDiv({ cls: "rss-video-tags" });
    this.detailsEl = details;
    this.renderTags();
    this.renderDescription();
  }

  /** Replaces the tag chips under the title, channel and date line. */
  setTags(tags: Tag[] | undefined): void {
    this.tags = tags;
    this.renderTags();
  }

  private renderTags(): void {
    if (!this.tagsEl) return;
    this.tagsEl.empty();
    renderReaderTagChips(this.tagsEl, this.tags);
  }

  private renderDescription(): void {
    this.descriptionEl?.remove();
    this.descriptionEl = null;
    const description = this.currentItem?.description;
    if (this.focusMode || !description || !this.detailsEl) return;

    const descriptionContainer = this.detailsEl.createDiv({
      cls: "rss-video-description",
    });
    const parser = new DOMParser();
    const doc = parser.parseFromString(description, "text/html");
    doc.querySelectorAll("script").forEach((s) => s.remove());
    doc.querySelectorAll("a").forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    const fragment = descriptionContainer.win.createFragment();
    while (doc.body.firstChild) {
      fragment.appendChild(doc.body.firstChild);
    }
    descriptionContainer.appendChild(fragment);
    this.descriptionEl = descriptionContainer;
  }

  /**
   * Follows the player's own position reports (#1236). Nothing is estimated:
   * until the player reports, nothing is saved.
   */
  private connectPlayer(iframe: HTMLIFrameElement): void {
    if (!this.progressTrackingEnabled || !this.onPlaybackProgress) return;
    this.disconnectPlayer = connectYouTubePlayerChannel(iframe, (update) =>
      this.handlePlayerUpdate(update),
    );
  }

  private disconnect(): void {
    this.disconnectPlayer?.();
    this.disconnectPlayer = null;
  }

  private handlePlayerUpdate(update: YouTubePlayerUpdate): void {
    if (update.videoId !== undefined) this.playerVideoId = update.videoId;
    // Another video picked inside the player (an end-screen suggestion) must
    // not overwrite this item's position. The first report from the new video
    // carries its id, so nothing from it gets through.
    if (
      this.playerVideoId !== null &&
      this.playerVideoId !== this.currentItem?.videoId
    ) {
      this.stopTracking();
      this.playerState = null;
      return;
    }
    if (update.duration !== undefined && update.duration > 0) {
      this.videoDuration = update.duration;
    }
    if (update.currentTime !== undefined) {
      this.reportedPosition = update.currentTime;
    }
    if (update.playerState !== undefined) {
      this.handleStateChange(update.playerState);
    }
  }

  private handleStateChange(state: number): void {
    // Act on a change only: repeated reports of one state save nothing more.
    if (state === this.playerState) return;
    this.playerState = state;
    if (state === 1) {
      // PLAYING
      this.startTracking();
      return;
    }

    if (state === 2 || state === 0) {
      // PAUSED or ENDED
      this.saveProgress(true);
      this.stopTracking();
    }
  }

  private startTracking(): void {
    if (this.progressInterval) return;
    this.progressInterval = window.setInterval(() => {
      this.saveProgress();
    }, 5000);
  }

  private stopTracking(): void {
    if (this.progressInterval) {
      window.clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private saveProgress(flush = false): void {
    if (!this.progressTrackingEnabled) return;
    if (!this.currentItem || !this.onPlaybackProgress) return;

    const position = this.reportedPosition;
    const duration =
      this.videoDuration ?? this.currentItem.playbackProgress?.duration ?? 0;
    if (position === null || !(position >= 0) || !(duration > 0)) return;

    if (
      !flush &&
      this.lastSavedPosition !== null &&
      Math.abs(position - this.lastSavedPosition) < 1
    ) {
      return;
    }

    this.lastSavedPosition = position;
    try {
      this.onPlaybackProgress(this.currentItem, position, duration, flush);
    } catch {
      // A failed save must not stop the next video from loading.
    }
  }

  setRelatedVideos(videos: FeedItem[]): void {
    this.relatedVideos = videos;
    this.renderRelatedVideos();
  }

  private renderRelatedVideos(): void {
    this.relatedEl?.remove();
    this.relatedEl = null;
    if (this.focusMode || !this.playerEl || !this.currentItem) return;

    const relatedContainer = this.playerEl.createDiv({
      cls: "rss-video-related",
    });
    this.relatedEl = relatedContainer;

    const filtered = this.relatedVideos
      .filter(
        (v) =>
          this.currentItem &&
          v.guid !== this.currentItem.guid &&
          resolveVideoSource(v) &&
          v.feedUrl === this.currentItem.feedUrl,
      )
      .slice(0, 5);

    relatedContainer.createEl("h4", { text: "From the same channel" });

    if (filtered.length > 0) {
      const relatedList = relatedContainer.createDiv({
        cls: "rss-video-related-list",
      });
      filtered.forEach((video) => {
        const videoItem = relatedList.createDiv({
          cls: "rss-video-related-item",
        });

        const thumbnailSrc = video.videoId
          ? `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`
          : video.coverImage;
        if (resolveVideoSource(video)?.kind === "twitch-live") {
          // A live item shows a LIVE label in the thumbnail slot, not a cover.
          videoItem
            .createDiv({ cls: "rss-video-related-thumbnail" })
            .createSpan({ cls: "rss-video-live-label", text: "LIVE" });
        } else if (thumbnailSrc) {
          const thumbnail = videoItem.createDiv({
            cls: "rss-video-related-thumbnail",
          });
          thumbnail.createEl("img", {
            attr: { src: thumbnailSrc, alt: video.title },
          });
        }

        const videoInfo = videoItem.createDiv({
          cls: "rss-video-related-info",
        });
        videoInfo.createDiv({
          cls: "rss-video-related-title",
          text: video.title,
        });
        videoInfo.createDiv({
          cls: "rss-video-related-date",
          text: this.formatVideoDate(video),
        });

        videoItem.addEventListener("click", () => {
          if (this.onVideoSelect) {
            this.onVideoSelect(video);
          } else {
            this.loadVideo(video);
          }
        });
      });
    } else {
      relatedContainer.createDiv({
        cls: "rss-video-related-empty",
        text: "No related videos found",
      });
    }
  }

  destroy(): void {
    this.stopTracking();
    this.disconnect();
    this.saveProgress(true);
    if (this.iframeEl) {
      this.iframeEl.remove();
      this.iframeEl = null;
    }
    this.watchLinkEl?.remove();
    this.watchLinkEl = null;
    this.videoContainerEl = null;
    this.playerEl = null;
    this.detailsEl = null;
    this.descriptionEl = null;
    this.relatedEl = null;
    this.tagsEl = null;
  }
}
