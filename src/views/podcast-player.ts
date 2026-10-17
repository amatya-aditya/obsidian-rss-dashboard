import { FeedItem } from "../types/types";
import { App, setIcon, Menu, Notice } from "obsidian";
import { PodcastEpisodeList } from "../components/podcast-episode-list";
import { MediaService } from "../services/media-service";
import { renderEpisodeDetails } from "./podcast-episode-details";
import { onActivate } from "../utils/keyboard-activation";
import { windowInstanceOf } from "../utils/platform-utils";
import { itemAuthorText } from "../utils/item-author";

export class PodcastPlayer {
  private container: HTMLElement;
  private app: App;
  private theme: string;
  private audioElement: HTMLAudioElement | null = null;
  private currentItem: FeedItem | null = null;
  private hasAudioForCurrentItem = true;
  private playlist: FeedItem[] = [];
  private progressInterval: number | null = null;
  private endSeekDrag: (() => void) | null = null;
  private progressData: Map<string, { position: number; duration: number }> =
    new Map();
  private currentPlaylistIndex = 0;
  private isShuffled = false;
  private originalPlaylist: FeedItem[] = [];
  private sortOrder: "recent" | "oldest" = "recent";
  private previousVolume = 1;
  private progressTrackingEnabled: boolean;
  private defaultPlaySpeed: number;
  private useFirstSeenDateFallback: boolean;
  private isAutoplayEnabled = false;
  private playlistWindowStart: number | undefined;
  private episodeVisibleCount = 20;
  private onEpisodeSelected?: (
    item: FeedItem,
    source: "playlist" | "nav" | "autoplay" | "external",
  ) => void;
  private onPlaybackProgress?: (
    item: FeedItem,
    position: number,
    duration: number,
    flush?: boolean,
  ) => void;

  private playerEl: HTMLElement | null = null;
  private playButton: HTMLElement | null = null;
  private currentTimeEl: HTMLElement | null = null;
  private durationEl: HTMLElement | null = null;
  private progressBarEl: HTMLProgressElement | null = null;
  private progressFilledEl: HTMLElement | null = null;
  private speedButtonEl: HTMLElement | null = null;
  private shuffleButton: HTMLElement | null = null;
  private repeatButton: HTMLElement | null = null;
  private volumeSlider: HTMLElement | null = null;
  private volumeContainer: HTMLElement | null = null;

  private sleepTimerId: number | null = null;
  private sleepTimerEndTime: number | null = null;
  private stopAtEndOfEpisode = false;
  private sleepTimerButton: HTMLElement | null = null;
  private sleepTimerIconEl: HTMLElement | null = null;
  private sleepTimerTextEl: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    app: App,
    theme?: string,
    playlist?: FeedItem[],
    onEpisodeSelected?: (
      item: FeedItem,
      source: "playlist" | "nav" | "autoplay" | "external",
    ) => void,
    onPlaybackProgress?: (
      item: FeedItem,
      position: number,
      duration: number,
      flush?: boolean,
    ) => void,
    progressTrackingEnabled = true,
    defaultPlaySpeed = 1,
    useFirstSeenDateFallback = false,
  ) {
    this.container = container;
    this.app = app;
    this.theme = theme || "obsidian";
    this.progressTrackingEnabled = progressTrackingEnabled;
    this.defaultPlaySpeed = defaultPlaySpeed ?? 1;
    this.useFirstSeenDateFallback = useFirstSeenDateFallback;
    if (playlist) {
      this.setPlaylist(playlist);
    }
    this.onEpisodeSelected = onEpisodeSelected;
    this.onPlaybackProgress = onPlaybackProgress;
  }

  setPlaylist(playlist: FeedItem[]) {
    this.playlist = playlist;
    this.originalPlaylist = [...playlist];
    this.progressData.clear();
    if (this.progressTrackingEnabled) {
      playlist.forEach((item) => {
        if (item.playbackProgress) {
          this.progressData.set(item.guid, {
            position: item.playbackProgress.position,
            duration: item.playbackProgress.duration,
          });
        }
      });
    }
    this.currentPlaylistIndex = 0;
    this.isShuffled = false;
    this.episodeVisibleCount = 20;
  }

  loadEpisode(
    item: FeedItem,
    fullFeedEpisodes?: FeedItem[],
    options?: {
      notify?: boolean;
      source?: "playlist" | "nav" | "autoplay" | "external";
      autoplay?: boolean;
    },
  ): void {
    const notify = options?.notify ?? false;
    const source = options?.source ?? "external";
    const autoplay = options?.autoplay ?? false;

    if (fullFeedEpisodes && Array.isArray(fullFeedEpisodes)) {
      this.setPlaylist(fullFeedEpisodes);
    }

    const resolvedAudioUrl = this.resolveEpisodeAudioUrl(item);

    this.currentItem = item;
    this.hasAudioForCurrentItem = !!resolvedAudioUrl;
    this.currentPlaylistIndex = this.playlist.findIndex(
      (ep) => ep.guid === item.guid,
    );

    if (notify && this.onEpisodeSelected) {
      this.onEpisodeSelected(item, source);
    }

    this.render();
    this.syncAudioElementToItem(item, autoplay);
  }

  private resolveEpisodeAudioUrl(item: FeedItem): string | undefined {
    const resolvedAudioUrl =
      item.audioUrl ||
      item.enclosure?.url ||
      MediaService.extractPodcastAudio(item.description);
    if (resolvedAudioUrl) {
      item.audioUrl = resolvedAudioUrl;
    }
    return resolvedAudioUrl;
  }

  private syncAudioElementToItem(item: FeedItem, autoplay: boolean): void {
    if (this.audioElement) {
      if (item.audioUrl) {
        this.audioElement.src = item.audioUrl;
        this.audioElement.load();
        this.audioElement.playbackRate = this.defaultPlaySpeed;
        this.audioElement.defaultPlaybackRate = this.defaultPlaySpeed;

        const savedProgress = this.progressTrackingEnabled
          ? (item.playbackProgress ?? this.progressData.get(item.guid))
          : undefined;
        if (savedProgress && savedProgress.position > 0) {
          this.audioElement.currentTime = savedProgress.position;
          this.updateProgressDisplay();
        }

        if (autoplay) {
          this.updatePlayButtonIcon(true);
          void this.audioElement.play().catch((error) => {
            this.updatePlayButtonIcon(false);
            console.error("Failed to play audio:", error);
          });
        }
      } else {
        this.audioElement.pause();
        this.audioElement.src = "";
        this.audioElement.load();
      }
    }
  }

  refreshTags(): void {
    if (!this.currentItem) return;
    const infoSection = this.container.querySelector<HTMLElement>(
      ".podcast-info-section",
    );
    if (!infoSection) return;

    infoSection
      .querySelectorAll(".podcast-tag-strip")
      .forEach((el) => el.remove());
    this.renderTagStrip(infoSection, this.currentItem.tags);
  }

  private renderTagStrip(
    infoSection: HTMLElement,
    tags: Array<{ name: string; color?: string }> | undefined,
  ): void {
    if (!tags || tags.length === 0) {
      return;
    }
    const tagsStrip = infoSection.createDiv({ cls: "podcast-tag-strip" });
    const maxVisibleTags = 3;
    const tagsToShow = tags.slice(0, maxVisibleTags);
    const remainingCount = tags.length - maxVisibleTags;
    const remainingTags = remainingCount > 0 ? tags.slice(maxVisibleTags) : [];

    tagsToShow.forEach((tag) => {
      const tagEl = tagsStrip.createDiv({ cls: "podcast-tag", text: tag.name });
      if (tag.color) {
        tagEl.style.backgroundColor = tag.color;
      }
    });

    if (remainingCount > 0) {
      const overflowTitle = remainingTags.map((t) => t.name).join("\n");
      tagsStrip.createDiv({
        cls: "podcast-tag podcast-tag-more",
        text: `+${remainingCount} more`,
        attr: { "aria-label": overflowTitle },
      });
    }
  }

  private render(): void {
    const item = this.currentItem;
    if (!item) return;
    this.endSeekDrag?.();
    this.container.empty();

    const podcastContainer = this.container.createDiv({
      cls: "rss-reader-podcast-container",
    });
    podcastContainer.setAttribute("data-podcast-theme", this.theme);

    this.renderAudioElement(podcastContainer, item);

    // Two-row layout: main controls row, then progress area
    this.playerEl = podcastContainer.createDiv({
      cls: "podcast-player-main-layout",
    });

    // ROW 1: Info, Controls, and Tools
    const mainControlsRow = this.playerEl.createDiv({
      cls: "podcast-main-controls-row",
    });

    this.renderInfoSection(mainControlsRow, item);
    this.renderTransportSection(mainControlsRow, podcastContainer);
    this.renderToolsSection(mainControlsRow);
    this.renderProgressArea();

    this.updateProgressDisplay();

    this.renderEpisodeDetailsUnderProgress();

    this.playlistWindowStart = undefined;
    this.renderPlaylistSection();
  }

  private renderAudioElement(
    podcastContainer: HTMLElement,
    item: FeedItem,
  ): void {
    // Initialize audio element early so UI components can reference its state
    this.audioElement = podcastContainer.createEl("audio", {
      attr: { preload: "metadata" },
    });
    if (item.audioUrl) {
      this.audioElement.src = item.audioUrl;
    }
    this.audioElement.onplay = () => {
      this.updatePlayButtonIcon(true);
      this.startProgressTracking();
    };
    this.audioElement.onpause = () => {
      this.updatePlayButtonIcon(false);
      this.stopProgressTracking();
      this.saveProgress(true);
    };
    this.audioElement.ontimeupdate = () => this.updateProgressDisplay();
    this.audioElement.onloadedmetadata = () => this.updateProgressDisplay();
    this.audioElement.onended = () => {
      this.stopProgressTracking();
      this.saveProgress(true);
      this.handleEpisodeEnd();
    };
    this.audioElement.volume = 1;
    this.audioElement.playbackRate = this.defaultPlaySpeed;
  }

  private renderInfoSection(
    mainControlsRow: HTMLElement,
    item: FeedItem,
  ): void {
    // Left: thumbnail and info
    const infoSection = mainControlsRow.createDiv({
      cls: "podcast-info-section",
    });

    const coverImageUrl =
      item.coverImage || item.image || item.itunes?.image?.href || "";
    const coverWrapper = infoSection.createDiv({
      cls: "podcast-cover-wrapper",
    });

    const coverPlaceholder = this.createCoverPlaceholder(coverWrapper);
    if (coverImageUrl && activeDocument.defaultView) {
      const image = new activeDocument.defaultView.Image();
      image.classList.add("podcast-cover");
      image.alt = item.title;
      image.onload = () => coverPlaceholder.replaceWith(image);
      image.src = coverImageUrl;
    }

    const textInfo = infoSection.createDiv({ cls: "podcast-text-info" });
    textInfo.createDiv({
      cls: "podcast-title-display",
      text: item.title,
    });
    textInfo.createDiv({
      cls: "podcast-meta-display",
      text: `${item.feedTitle}${itemAuthorText(item) ? " - " + itemAuthorText(item) : ""}`,
    });

    // Tags section
    this.renderTagStrip(infoSection, item.tags);
  }

  private renderTransportSection(
    mainControlsRow: HTMLElement,
    podcastContainer: HTMLElement,
  ): void {
    // Center: transport controls
    const transportSection = mainControlsRow.createDiv({
      cls: "podcast-transport-section",
    });

    this.shuffleButton = transportSection.createDiv({
      cls: "rss-shuffle-btn clickable-icon",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Shuffle",
      },
    });
    setIcon(this.shuffleButton, "shuffle");
    this.shuffleButton.onclick = () => this.toggleShuffle();
    this.shuffleButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.toggleShuffle();
      }
    });
    this.updateShuffleButton();

    const rewindBtn = transportSection.createDiv({
      cls: "rss-rewind clickable-icon",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Rewind 30 seconds",
      },
    });
    setIcon(rewindBtn, "rotate-ccw");
    rewindBtn.createSpan({ cls: "seek-label", text: "30" });
    rewindBtn.onclick = () => {
      if (this.audioElement) {
        this.audioElement.currentTime = Math.max(
          0,
          this.audioElement.currentTime - 30,
        );
        this.updateProgressDisplay();
      }
    };
    rewindBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (this.audioElement) {
          this.audioElement.currentTime = Math.max(
            0,
            this.audioElement.currentTime - 30,
          );
          this.updateProgressDisplay();
        }
      }
    });

    this.playButton = transportSection.createDiv({
      cls: "rss-play-pause clickable-icon",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Play/Pause",
      },
    });
    setIcon(this.playButton, "play");
    this.playButton.onclick = () => {
      if (this.playButton?.classList.contains("is-disabled")) return;
      this.togglePlayback();
    };
    this.playButton.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (this.playButton?.classList.contains("is-disabled")) return;
        this.togglePlayback();
      }
    });
    if (!this.hasAudioForCurrentItem) {
      this.playButton.addClass("is-disabled");
    }

    if (!this.hasAudioForCurrentItem) {
      const errorText = "Audio url not found. Cannot play this podcast.";
      podcastContainer.createDiv({
        cls: "podcast-player-error",
        text: errorText,
      });
    }

    const forwardBtn = transportSection.createDiv({
      cls: "rss-forward clickable-icon",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Forward 30 seconds",
      },
    });
    setIcon(forwardBtn, "rotate-cw");
    forwardBtn.createSpan({ cls: "seek-label", text: "30" });
    forwardBtn.onclick = () => {
      if (this.audioElement) {
        this.audioElement.currentTime = Math.min(
          this.audioElement.duration || Infinity,
          this.audioElement.currentTime + 30,
        );
        this.updateProgressDisplay();
      }
    };
    forwardBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (this.audioElement) {
          this.audioElement.currentTime = Math.min(
            this.audioElement.duration || Infinity,
            this.audioElement.currentTime + 30,
          );
          this.updateProgressDisplay();
        }
      }
    });

    this.repeatButton = transportSection.createDiv({
      cls: "rss-repeat-btn clickable-icon",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Repeat",
      },
    });
    setIcon(this.repeatButton, "repeat");
    this.repeatButton.onclick = () => this.toggleRepeat();
    this.repeatButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.toggleRepeat();
      }
    });
  }

  private renderToolsSection(mainControlsRow: HTMLElement): void {
    // Right: tools (speed and volume)
    const toolsSection = mainControlsRow.createDiv({
      cls: "podcast-tools-section",
    });

    this.speedButtonEl = toolsSection.createEl("select", {
      cls: "rss-speed-control",
    });
    [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].forEach((v) => {
      const option = this.speedButtonEl?.createEl("option", {
        attr: { value: v.toString() },
        text: `${v}\u00D7`,
      });
      if (option && v === this.defaultPlaySpeed) option.selected = true;
    });
    this.speedButtonEl.onchange = () => {
      if (this.audioElement && this.speedButtonEl) {
        const newSpeed = Number(
          (this.speedButtonEl as HTMLSelectElement).value,
        );
        this.audioElement.playbackRate = newSpeed;
        this.defaultPlaySpeed = newSpeed;
      }
    };

    // Sleep timer button
    this.sleepTimerButton = toolsSection.createDiv({
      cls: "rss-sleep-timer-btn clickable-icon",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Sleep timer",
      },
    });
    this.sleepTimerIconEl = this.sleepTimerButton.createSpan({
      cls: "rss-sleep-timer-icon",
      attr: { "aria-hidden": "true" },
    });
    setIcon(this.sleepTimerIconEl, "moon");
    this.sleepTimerTextEl = this.sleepTimerButton.createSpan({
      cls: "rss-sleep-timer-inline-value",
    });
    onActivate(this.sleepTimerButton, (e) => this.showSleepTimerMenu(e));
    this.updateSleepTimerButtonState();

    this.renderVolumeControl(toolsSection);

    this.updateSleepTimerDisplay();
  }

  private renderVolumeControl(toolsSection: HTMLElement): void {
    this.volumeContainer = toolsSection.createDiv({
      cls: "rss-volume-control-container",
    });
    const volumeBtn = this.volumeContainer.createDiv({
      cls: "rss-volume clickable-icon",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Adjust volume",
      },
    });
    const updateVolumeIcon = () => {
      if (!this.audioElement) return;
      if (this.audioElement.muted || this.audioElement.volume === 0) {
        setIcon(volumeBtn, "volume-x");
        volumeBtn.addClass("is-muted");
        if (volumeBar) volumeBar.value = "0";
      } else {
        if (this.audioElement.volume < 0.5) {
          setIcon(volumeBtn, "volume-1");
        } else {
          setIcon(volumeBtn, "volume-2");
        }
        volumeBtn.removeClass("is-muted");
        if (volumeBar)
          volumeBar.value = (this.audioElement.volume * 100).toString();
      }
    };

    volumeBtn.onclick = () => {
      if (this.audioElement) {
        if (!this.audioElement.muted && this.audioElement.volume > 0) {
          this.previousVolume = this.audioElement.volume;
          this.audioElement.muted = true;
        } else {
          this.audioElement.muted = false;
          if (this.audioElement.volume === 0) {
            this.audioElement.volume = this.previousVolume || 1;
          }
        }
        updateVolumeIcon();
      }
    };

    const toggleMute = () => {
      if (this.audioElement) {
        if (!this.audioElement.muted && this.audioElement.volume > 0) {
          this.previousVolume = this.audioElement.volume;
          this.audioElement.muted = true;
        } else {
          this.audioElement.muted = false;
          if (this.audioElement.volume === 0) {
            this.audioElement.volume = this.previousVolume || 1;
          }
        }
        updateVolumeIcon();
      }
    };

    volumeBtn.onclick = (e) => {
      e.stopPropagation();
      toggleMute();
    };
    volumeBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleMute();
      }
    });

    this.volumeSlider = this.volumeContainer.createDiv({
      cls: "rss-volume-slider",
    });
    const volumeBar = this.volumeSlider.createEl("input", {
      type: "range",
      cls: "rss-volume-bar",
    });
    volumeBar.min = "0";
    volumeBar.max = "100";
    volumeBar.value = (
      this.audioElement ? this.audioElement.volume * 100 : 100
    ).toString();
    volumeBar.oninput = () => {
      if (this.audioElement && volumeBar) {
        this.audioElement.volume = Number(volumeBar.value) / 100;
        if (this.audioElement.volume > 0) {
          this.audioElement.muted = false;
          this.previousVolume = this.audioElement.volume;
        }
        updateVolumeIcon();
      }
    };

    updateVolumeIcon();
  }

  private renderProgressArea(): void {
    if (!this.playerEl) return;
    // Row 2: progress area
    const progressArea = this.playerEl.createDiv({
      cls: "podcast-progress-area",
    });

    const seekbarRow = progressArea.createDiv({ cls: "podcast-seekbar-row" });
    this.currentTimeEl = seekbarRow.createDiv({
      cls: "rss-current-time",
      text: "0:00",
    });

    const progressBarWrapper = seekbarRow.createDiv({
      cls: "podcast-progress-bar-wrapper",
    });
    this.progressBarEl = progressBarWrapper.createEl("progress", {
      cls: "podcast-progress-bar",
    });
    this.progressBarEl.value = 0;
    this.progressBarEl.max = 1;

    this.progressFilledEl = progressBarWrapper.createDiv({
      cls: "podcast-progress-bar-filled",
    });
    this.durationEl = seekbarRow.createDiv({
      cls: "rss-duration",
      text: "-0:00",
    });

    this.bindSeekHandlers();
  }

  private bindSeekHandlers(): void {
    if (this.progressBarEl) {
      const progressBar = this.progressBarEl;
      let isDragging = false;

      const getSeekTime = (e: MouseEvent | TouchEvent) => {
        const rect = progressBar.getBoundingClientRect();
        let clientX: number;
        if (windowInstanceOf(e, MouseEvent)) {
          clientX = e.clientX;
        } else {
          const touch = e.touches[0];
          if (!touch) return 0;
          clientX = touch.clientX;
        }
        const percent = Math.max(
          0,
          Math.min(1, (clientX - rect.left) / rect.width),
        );
        const duration = this.getFiniteDuration();
        return duration === null ? 0 : percent * duration;
      };

      progressBar.addEventListener("click", (e) => {
        if (!this.audioElement || this.getFiniteDuration() === null) return;
        const seekTime = getSeekTime(e);
        this.audioElement.currentTime = seekTime;
        this.updateProgressDisplay();
      });

      progressBar.addEventListener("mousedown", (_e) => {
        if (this.getFiniteDuration() === null) return;
        isDragging = true;
        const moveHandler = (moveEvent: MouseEvent) => {
          if (!isDragging || !this.audioElement) return;
          if (this.getFiniteDuration() === null) return;
          const seekTime = getSeekTime(moveEvent);
          this.audioElement.currentTime = seekTime;
          this.updateProgressDisplay();
        };
        const upHandler = () => {
          isDragging = false;
          activeWindow.removeEventListener("mousemove", moveHandler);
          activeWindow.removeEventListener("mouseup", upHandler);
          if (this.endSeekDrag === upHandler) this.endSeekDrag = null;
        };
        this.endSeekDrag?.();
        this.endSeekDrag = upHandler;
        activeWindow.addEventListener("mousemove", moveHandler);
        activeWindow.addEventListener("mouseup", upHandler);
      });

      progressBar.addEventListener("touchstart", (_e) => {
        if (this.getFiniteDuration() === null) return;
        isDragging = true;
        const moveHandler = (moveEvent: TouchEvent) => {
          if (!isDragging || !this.audioElement) return;
          if (this.getFiniteDuration() === null) return;
          const seekTime = getSeekTime(moveEvent);
          this.audioElement.currentTime = seekTime;
          this.updateProgressDisplay();
        };
        const upHandler = () => {
          isDragging = false;
          activeWindow.removeEventListener("touchmove", moveHandler);
          activeWindow.removeEventListener("touchend", upHandler);
          if (this.endSeekDrag === upHandler) this.endSeekDrag = null;
        };
        this.endSeekDrag?.();
        this.endSeekDrag = upHandler;
        activeWindow.addEventListener("touchmove", moveHandler);
        activeWindow.addEventListener("touchend", upHandler);
      });
    }
  }

  private renderEpisodeDetailsUnderProgress(): void {
    if (!this.currentItem || !this.playerEl) return;
    renderEpisodeDetails(this.playerEl, this.currentItem, this.theme);
  }

  refreshPlaylistTags(_episodeGuid?: string): void {
    this.replacePlaylistSection();
  }

  private renderPlaylistSection(): void {
    new PodcastEpisodeList(this.container, {
      episodes: this.playlist,
      activeEpisodeGuid: this.currentItem?.guid,
      theme: this.theme,
      useFirstSeenDateFallback: this.useFirstSeenDateFallback,
      isAutoplayEnabled: this.isAutoplayEnabled,
      sortOrder: this.sortOrder,
      visibleCount: this.episodeVisibleCount,
      progressData: this.progressData,
      onEpisodeSelected: (episode) => {
        this.loadEpisode(episode, undefined, {
          notify: true,
          source: "playlist",
        });
      },
      onAutoplayChanged: (enabled) => {
        this.isAutoplayEnabled = enabled;
        new Notice(enabled ? "Autoplay enabled" : "Autoplay disabled");
      },
      onSortRequested: (order) => this.sortPlaylist(order),
      onVisibleCountChanged: (count) => {
        this.episodeVisibleCount = count;
      },
    }).render();
  }

  private replacePlaylistSection(): void {
    this.container
      .querySelectorAll(".podcast-episode-list-section, .episode-list-empty")
      .forEach((el) => el.remove());

    this.renderPlaylistSection();
  }

  private createCoverPlaceholder(container: HTMLElement): HTMLElement {
    const placeholder = container.createDiv({
      cls: "podcast-cover-placeholder",
    });
    placeholder.textContent = "🎧";
    return placeholder;
  }

  private toggleShuffle(): void {
    this.isShuffled = !this.isShuffled;
    if (this.isShuffled) {
      this.playlist = [...this.originalPlaylist].sort(
        () => Math.random() - 0.5,
      );
    } else {
      this.playlist = [...this.originalPlaylist];
    }
    if (this.currentItem) {
      this.currentPlaylistIndex = this.playlist.findIndex(
        (ep) => ep.guid === this.currentItem?.guid,
      );
    }
    this.playlistWindowStart = undefined;
    this.updateShuffleButton();
    this.replacePlaylistSection();
  }

  private sortPlaylist(order: "recent" | "oldest"): void {
    this.sortOrder = order;

    // Sorting logic: if recent, newest first. If oldest, oldest first.
    this.playlist.sort((a, b) => {
      const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;

      if (this.sortOrder === "recent") {
        return dateB - dateA; // Descending
      } else {
        return dateA - dateB; // Ascending
      }
    });

    // Also update the original playlist so shuffle uses the new base order if toggled off
    this.originalPlaylist = [...this.playlist];

    if (this.currentItem) {
      this.currentPlaylistIndex = this.playlist.findIndex(
        (ep) => ep.guid === this.currentItem?.guid,
      );
    }

    this.playlistWindowStart = undefined;
    this.replacePlaylistSection();
  }

  private updateShuffleButton(): void {
    if (this.shuffleButton) {
      this.shuffleButton.classList.toggle("active", this.isShuffled);
    }
  }

  private toggleRepeat(): void {
    if (this.repeatButton) {
      this.repeatButton.classList.toggle("active");
    }
  }

  private playNext(): void {
    if (this.playlist.length === 0) return;

    this.currentPlaylistIndex =
      (this.currentPlaylistIndex + 1) % this.playlist.length;
    const nextEpisode = this.playlist[this.currentPlaylistIndex];
    if (nextEpisode) {
      this.loadEpisode(nextEpisode, undefined, { notify: true, source: "nav" });
    }
  }

  private playPrevious(): void {
    if (this.playlist.length === 0) return;

    this.currentPlaylistIndex =
      this.currentPlaylistIndex === 0
        ? this.playlist.length - 1
        : this.currentPlaylistIndex - 1;
    const prevEpisode = this.playlist[this.currentPlaylistIndex];
    if (prevEpisode) {
      this.loadEpisode(prevEpisode, undefined, { notify: true, source: "nav" });
    }
  }

  private handleEpisodeEnd(): void {
    this.updatePlayButtonIcon(false);

    if (this.repeatButton?.classList.contains("active")) {
      if (this.audioElement) {
        this.audioElement.currentTime = 0;
        this.updatePlayButtonIcon(true);
        void this.audioElement.play().catch((error) => {
          this.updatePlayButtonIcon(false);
          console.error("Failed to play audio:", error);
        });
      }
    } else {
      if (this.isAutoplayEnabled) {
        if (this.playlist.length === 0) return;
        this.currentPlaylistIndex =
          (this.currentPlaylistIndex + 1) % this.playlist.length;
        const nextEpisode = this.playlist[this.currentPlaylistIndex];
        if (nextEpisode) {
          this.loadEpisode(nextEpisode, undefined, {
            notify: true,
            source: "autoplay",
            autoplay: true,
          });
        }
      }
    }

    if (this.stopAtEndOfEpisode) {
      this.audioElement?.pause();
      this.clearSleepTimer();
    }
  }

  private showSleepTimerMenu(event: MouseEvent | KeyboardEvent): void {
    const menu = new Menu();

    const options = [
      { label: "Off", action: () => this.clearSleepTimer() },
      { label: "5 minutes", minutes: 5 },
      { label: "10 minutes", minutes: 10 },
      { label: "15 minutes", minutes: 15 },
      { label: "30 minutes", minutes: 30 },
      { label: "45 minutes", minutes: 45 },
      { label: "60 minutes", minutes: 60 },
      { label: "90 minutes", minutes: 90 },
      { label: "120 minutes", minutes: 120 },
      { label: "End of episode", action: () => this.setSleepTimer("end") },
    ];

    options.forEach((opt) => {
      menu.addItem((item) => {
        item.setTitle(opt.label);
        item.onClick(() => {
          if (opt.action) opt.action();
          else if (opt.minutes) this.setSleepTimer(opt.minutes);
        });

        // Active state check
        if (
          opt.label === "Off" &&
          !this.sleepTimerEndTime &&
          !this.stopAtEndOfEpisode
        ) {
          item.setChecked(true);
        } else if (opt.label === "End of episode" && this.stopAtEndOfEpisode) {
          item.setChecked(true);
        }
      });
    });

    if (event.type === "keydown" && this.sleepTimerButton) {
      // A key press carries no pointer position, so open under the button
      const rect = this.sleepTimerButton.getBoundingClientRect();
      menu.showAtPosition({ x: rect.left, y: rect.bottom });
    } else {
      menu.showAtMouseEvent(event as MouseEvent);
    }
  }

  private setSleepTimer(minutes: number | "end"): void {
    this.clearSleepTimer();

    if (minutes === "end") {
      this.stopAtEndOfEpisode = true;
    } else {
      const durationMs = minutes * 60 * 1000;
      this.sleepTimerEndTime = Date.now() + durationMs;

      this.sleepTimerId = window.setInterval(() => {
        const remaining = (this.sleepTimerEndTime || 0) - Date.now();
        if (remaining <= 0) {
          this.audioElement?.pause();
          this.clearSleepTimer();
        } else {
          this.updateSleepTimerDisplay();
        }
      }, 1000);
    }

    this.updateSleepTimerButtonState();
    this.updateSleepTimerDisplay();
  }

  private clearSleepTimer(): void {
    if (this.sleepTimerId) {
      window.clearInterval(this.sleepTimerId);
      this.sleepTimerId = null;
    }
    this.sleepTimerEndTime = null;
    this.stopAtEndOfEpisode = false;
    this.updateSleepTimerButtonState();
    this.updateSleepTimerDisplay();
  }

  private updateSleepTimerButtonState(): void {
    if (this.sleepTimerButton) {
      const isActive = !!this.sleepTimerEndTime || this.stopAtEndOfEpisode;
      this.sleepTimerButton.classList.toggle("is-active", isActive);
      this.sleepTimerButton.classList.toggle("has-countdown", isActive);
    }
  }

  private updateSleepTimerDisplay(): void {
    if (!this.sleepTimerButton || !this.sleepTimerTextEl) return;

    if (this.stopAtEndOfEpisode) {
      this.sleepTimerTextEl.textContent = "End of ep";
      this.sleepTimerButton.setAttribute(
        "aria-label",
        "Sleep timer: end of episode",
      );
    } else if (this.sleepTimerEndTime) {
      const remainingSecs = Math.max(
        0,
        Math.floor((this.sleepTimerEndTime - Date.now()) / 1000),
      );
      const remaining = this.formatTime(remainingSecs);
      this.sleepTimerTextEl.textContent = remaining;
      this.sleepTimerButton.setAttribute(
        "aria-label",
        `Sleep timer: ${remaining}`,
      );
    } else {
      this.sleepTimerTextEl.empty();
      this.sleepTimerButton.setAttribute("aria-label", "Sleep timer");
    }
  }

  private togglePlayback(): void {
    if (!this.audioElement) return;
    if (!this.currentItem?.audioUrl) return;

    if (this.audioElement.paused) {
      void this.audioElement.play();
    } else {
      this.audioElement.pause();
    }
  }

  private cyclePlaybackSpeed(): void {
    if (!this.audioElement || !this.speedButtonEl) return;

    const speeds = [1.0, 1.25, 1.5, 1.75, 2.0, 0.75];
    const currentSpeed = this.audioElement.playbackRate;

    let nextIndex = speeds.findIndex((speed) => speed === currentSpeed) + 1;
    if (nextIndex >= speeds.length) nextIndex = 0;

    const nextSpeed = speeds[nextIndex] ?? 1;
    this.audioElement.playbackRate = nextSpeed;
    this.speedButtonEl.textContent = `${nextSpeed.toFixed(2)}x`;
  }

  private startProgressTracking(): void {
    if (!this.progressTrackingEnabled) {
      return;
    }

    if (this.progressInterval) {
      window.clearInterval(this.progressInterval);
    }

    this.progressInterval = window.setInterval(() => {
      this.updateProgressDisplay();

      if (this.audioElement && this.currentItem) {
        this.saveProgress();
      }
    }, 1000);
  }

  private stopProgressTracking(): void {
    if (this.progressInterval) {
      window.clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private updateProgressDisplay(): void {
    if (!this.audioElement) return;
    const currentTime = this.formatTime(this.audioElement.currentTime);
    if (this.currentTimeEl) {
      this.currentTimeEl.textContent = currentTime;
    }
    // Live streams and media of unknown length report Infinity (or NaN before
    // metadata loads). Show the neutral initial state instead of formatting or
    // assigning a non-finite value, which throws on <progress>.max.
    const mediaDuration = this.getFiniteDuration();
    const hasDuration = mediaDuration !== null;
    const percent = hasDuration
      ? (this.audioElement.currentTime / mediaDuration) * 100
      : 0;

    if (this.durationEl) {
      this.durationEl.textContent = hasDuration
        ? this.formatTime(mediaDuration)
        : "-0:00";
    }

    if (this.progressBarEl) {
      this.progressBarEl.value = hasDuration
        ? this.audioElement.currentTime
        : 0;
      this.progressBarEl.max = hasDuration ? mediaDuration : 1;
    }

    if (this.progressFilledEl) {
      this.progressFilledEl.style.setProperty(
        "--progress-percent",
        `${percent}%`,
      );
    }
  }

  /** Audio duration when known and finite (> 0); null for NaN, 0 or Infinity. */
  private getFiniteDuration(): number | null {
    const duration = this.audioElement?.duration;
    return duration !== undefined && Number.isFinite(duration) && duration > 0
      ? duration
      : null;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  private updatePlayButtonIcon(isPlaying: boolean): void {
    if (!this.playButton) return;

    setIcon(this.playButton, isPlaying ? "pause" : "play");
  }

  private saveProgress(flush = false): void {
    if (!this.progressTrackingEnabled) return;
    if (!this.audioElement || !this.currentItem) return;

    if (this.audioElement.currentTime < 3) return;

    const duration = this.getFiniteDuration();
    if (duration !== null && this.audioElement.currentTime > duration - 3) {
      return;
    }

    this.progressData.set(this.currentItem.guid, {
      position: this.audioElement.currentTime,
      duration: duration ?? 0,
    });

    if (this.onPlaybackProgress) {
      this.onPlaybackProgress(
        this.currentItem,
        this.audioElement.currentTime,
        duration ?? 0,
        flush,
      );
    }
  }

  updateTheme(theme: string): void {
    this.theme = theme;
    const themedElements = this.container.querySelectorAll(
      "[data-podcast-theme]",
    );
    themedElements.forEach((el) => {
      el.setAttribute("data-podcast-theme", theme);
    });
  }

  destroy(): void {
    this.endSeekDrag?.();
    this.stopProgressTracking();
    this.clearSleepTimer();

    if (this.audioElement) {
      this.saveProgress(true);
      this.audioElement.onplay = null;
      this.audioElement.onpause = null;
      this.audioElement.onended = null;
      this.audioElement.pause();
      this.audioElement.src = "";
      this.audioElement.remove();
      this.audioElement = null;
    }
  }
}
