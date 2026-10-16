import { Notice, Setting, setIcon } from "obsidian";
import { renderReaderTagChips } from "../utils/reader-tag-chips";
import { FeedItem, Tag } from "../types/types";
import { youTubeWatchUrl } from "../utils/youtube-embed";
import {
  YOUTUBE_PLAYER_ALLOW,
  YOUTUBE_PLAYER_REFERRER_POLICY,
  youTubePlayerSourceUrl,
} from "../utils/youtube-player-source";
import { resolveDisplayDate } from "../services/feed-parser/feed-retention";

interface YouTubeMessagePayload {
  id?: string | number;
  event?: string;
  info?: unknown;
}

export class VideoPlayer {
  private container: HTMLElement;
  private currentItem: FeedItem | null = null;
  private playerEl: HTMLElement | null = null;
  private iframeEl: HTMLIFrameElement | null = null;
  private progressInterval: number | null = null;
  private lastTrackedPosition: number | null = null;
  private progressTrackingEnabled: boolean;
  private onVideoSelect?: (item: FeedItem) => void;
  private onPlaybackProgress?: (
    item: FeedItem,
    position: number,
    duration: number,
    flush?: boolean,
  ) => void;
  private relatedVideos: FeedItem[] = [];
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private playStartTime: number | null = null;
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
    this.setupMessageListener();
  }

  private formatVideoDate(item: FeedItem): string {
    const displayDate = resolveDisplayDate(item, this.useFirstSeenDateFallback);
    return displayDate ? displayDate.toLocaleDateString() : "Unknown date";
  }

  loadVideo(item: FeedItem): void {
    if (!item.videoId) {
      new Notice("No video id provided");
      return;
    }

    try {
      this.currentItem = item;
      this.lastTrackedPosition = item.playbackProgress?.position ?? null;
      this.render();
    } catch (error) {
      const msg = `Error loading video: ${error instanceof Error ? error.message : "Unknown error"}`;
      new Notice(msg);
    }
  }

  private render(): void {
    if (!this.currentItem || !this.currentItem.videoId) return;

    this.container.empty();
    this.playerEl = this.container.createDiv({ cls: "rss-video-player" });

    const videoContainer = this.playerEl.createDiv({
      cls: "rss-video-container",
    });
    const iframeId = `yt-player-${Math.random().toString(36).substring(2, 11)}`;

    this.iframeEl = videoContainer.win.createEl("iframe");
    this.iframeEl.id = iframeId;
    // Obsidian's embed host from a non-https origin, the plain nocookie embed
    // otherwise. The host is what makes desktop and iOS play; a direct embed
    // from Obsidian's `app://` origin is refused by YouTube (#1173, #1178).
    this.iframeEl.src = youTubePlayerSourceUrl(this.currentItem.videoId, {
      autoplay: true,
      startSeconds: this.resumeSeconds(),
    });
    this.iframeEl.setAttribute("allow", YOUTUBE_PLAYER_ALLOW);
    this.iframeEl.setAttribute(
      "referrerpolicy",
      YOUTUBE_PLAYER_REFERRER_POLICY,
    );
    this.iframeEl.allowFullscreen = true;

    videoContainer.appendChild(this.iframeEl);
    this.renderWatchLink();

    this.initPlayer(iframeId);

    this.tags = this.currentItem.tags;
    this.renderDetails();
    this.renderRelatedVideos();
  }

  /**
   * The saved resume position in seconds, or undefined when progress tracking
   * is off or nothing was saved. Live progress events cannot reach the host
   * player, so `start` is the only resume channel on that path.
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
  private renderWatchLink(): void {
    if (!this.playerEl || !this.currentItem?.videoId) return;
    const link = this.playerEl.createEl("a", { cls: "rss-video-watch" });
    link.href = youTubeWatchUrl(this.currentItem.videoId);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const icon = link.createSpan({ cls: "rss-video-watch-icon" });
    setIcon(icon, "play");
    link.appendChild(
      this.playerEl.ownerDocument.createTextNode("Watch on YouTube"),
    );
  }

  /**
   * Focus mode shows only the video: it drops everything below it (title,
   * channel, date, tag chips, description and the related list). Only those
   * blocks are added or removed, so the iframe and playback state survive a
   * preference change.
   */
  setFocusMode(enabled: boolean): void {
    if (this.focusMode === enabled) return;
    this.focusMode = enabled;
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

  private sendCommand(func: string, args: unknown[] = []): void {
    if (!this.iframeEl || !this.iframeEl.contentWindow) return;
    try {
      const message = JSON.stringify({
        event: "command",
        func: func,
        args: args,
        id: this.iframeEl.id,
      });
      const url = new URL(this.iframeEl.src);
      this.iframeEl.contentWindow.postMessage(message, url.origin);
    } catch {
      // Ignore errors
    }
  }

  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.youtube.com" &&
        event.origin !== "https://www.youtube-nocookie.com"
      ) {
        return;
      }

      try {
        let parsedData: unknown;
        if (typeof event.data === "string") {
          parsedData = JSON.parse(event.data);
        } else {
          parsedData = event.data;
        }

        if (!parsedData || typeof parsedData !== "object") return;
        const payload = parsedData as YouTubeMessagePayload;

        // Verify it belongs to this player's iframe
        if (
          payload.id !== undefined &&
          String(payload.id) !== this.iframeEl?.id
        ) {
          return;
        }

        if (payload.event === "onReady") {
          this.handlePlayerReady();
        } else if (payload.event === "onStateChange") {
          if (typeof payload.info === "number") {
            this.handleStateChange(payload.info);
          }
        } else if (
          payload.event === "infoDelivery" &&
          payload.info &&
          typeof payload.info === "object"
        ) {
          const info = payload.info as Record<string, unknown>;
          if (typeof info.duration === "number") {
            this.videoDuration = info.duration;
          }
          if (typeof info.currentTime === "number") {
            this.lastTrackedPosition = info.currentTime;
            if (this.playStartTime !== null) {
              this.playStartTime = Date.now();
            }
          }
          if (typeof info.playerState === "number") {
            this.handleStateChange(info.playerState);
          }
        }
      } catch {
        // Parse/JSON error
      }
    };

    window.addEventListener("message", this.messageHandler);
  }

  private handlePlayerReady(): void {
    if (
      this.progressTrackingEnabled &&
      this.currentItem?.playbackProgress?.position
    ) {
      this.sendCommand("seekTo", [
        this.currentItem.playbackProgress.position,
        true,
      ]);
    }
  }

  private initPlayer(_iframeId: string): void {
    this.playStartTime = null;
    this.videoDuration = null;

    if (
      this.progressTrackingEnabled &&
      this.currentItem?.playbackProgress?.position
    ) {
      window.setTimeout(() => {
        this.sendCommand("seekTo", [
          this.currentItem!.playbackProgress!.position,
          true,
        ]);
      }, 1000);
    }
  }

  private handleStateChange(state: number): void {
    if (state === 1) {
      // PLAYING
      if (this.playStartTime === null) {
        this.playStartTime = Date.now();
      }
      this.startTracking();
      return;
    }

    if (state === 2 || state === 0) {
      // PAUSED or ENDED
      this.saveProgress(true);
      this.stopTracking();
      this.playStartTime = null;
    }
  }

  private startTracking(): void {
    if (!this.progressTrackingEnabled) return;
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

    try {
      let position = this.lastTrackedPosition ?? 0;
      if (this.playStartTime !== null) {
        const elapsed = (Date.now() - this.playStartTime) / 1000;
        position += elapsed;
      }

      const duration =
        this.videoDuration ?? this.currentItem.playbackProgress?.duration ?? 0;

      if (!(position >= 0) || !(duration > 0)) {
        return;
      }

      if (
        !flush &&
        this.lastTrackedPosition !== null &&
        Math.abs(position - this.lastTrackedPosition) < 1
      ) {
        return;
      }

      this.lastTrackedPosition = position;
      if (this.playStartTime !== null) {
        this.playStartTime = Date.now();
      }

      this.onPlaybackProgress(this.currentItem, position, duration, flush);
    } catch {
      // Player might not be ready or detached
    }
  }

  private flushProgress(): void {
    this.saveProgress(true);
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
          v.videoId &&
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

        if (video.videoId) {
          const thumbnail = videoItem.createDiv({
            cls: "rss-video-related-thumbnail",
          });
          thumbnail.createEl("img", {
            attr: {
              src: `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
              alt: video.title,
            },
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
    this.flushProgress();
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    if (this.iframeEl) {
      this.iframeEl.remove();
      this.iframeEl = null;
    }
    this.playerEl = null;
    this.detailsEl = null;
    this.descriptionEl = null;
    this.relatedEl = null;
    this.tagsEl = null;
  }
}
