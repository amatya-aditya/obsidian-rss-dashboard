import type { FeedItem } from "../types/types";

const PLAYLIST_WINDOW_SIZE = 5;

export interface PodcastPlaylistOptions {
  episodes: FeedItem[];
  activeEpisodeGuid?: string;
  theme: string;
  isAutoplayEnabled: boolean;
  sortOrder: "recent" | "oldest";
  windowStart?: number;
  progressData?: ReadonlyMap<string, { position: number; duration: number }>;
  onEpisodeSelected: (episode: FeedItem) => void;
  onAutoplayChanged: (enabled: boolean) => void;
  onSortRequested: (order: "recent" | "oldest") => void;
  onWindowChanged?: (start: number) => void;
}

/** Renders a feed-agnostic, paged episode playlist. */
export class PodcastPlaylist {
  private windowStart: number;
  private section: HTMLElement | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: PodcastPlaylistOptions,
  ) {
    this.windowStart = this.clampWindowStart(
      options.windowStart ?? this.centeredWindowStart(),
    );
  }

  render(): void {
    const { episodes } = this.options;
    if (episodes.length <= 1) {
      const emptyState = this.container.createDiv({ cls: "playlist-empty" });
      emptyState.setText("No other episodes available in this feed");
      return;
    }

    const section = this.container.createDiv({ cls: "podcast-playlist-section" });
    this.section = section;
    section.setAttribute("data-podcast-theme", this.options.theme);
    const header = section.createDiv({ cls: "playlist-header" });
    header.createDiv({
      cls: "playlist-title",
      text: `Playlist (${episodes.length} episodes)`,
    });
    const sortControls = header.createDiv({ cls: "playlist-sort-controls" });
    this.renderAutoplayControl(sortControls);
    this.renderSortControls(sortControls);

    const navigation = section.createDiv({ cls: "playlist-window-controls" });
    const previous = navigation.createEl("button", {
      cls: "playlist-window-btn playlist-previous-window",
      text: "Previous window",
      attr: { "aria-label": "Show previous playlist window" },
    });
    previous.disabled = this.windowStart === 0;
    previous.onclick = () => this.moveWindow(-PLAYLIST_WINDOW_SIZE);

    navigation.createDiv({
      cls: "playlist-window-range",
      text: this.rangeText(),
      attr: { "aria-live": "polite" },
    });

    const next = navigation.createEl("button", {
      cls: "playlist-window-btn playlist-next-window",
      text: "Next window",
      attr: { "aria-label": "Show next playlist window" },
    });
    next.disabled = this.windowStart + PLAYLIST_WINDOW_SIZE >= episodes.length;
    next.onclick = () => this.moveWindow(PLAYLIST_WINDOW_SIZE);

    const recenter = navigation.createEl("button", {
      cls: "playlist-window-btn playlist-return-to-current",
      text: "Return to current episode",
    });
    recenter.onclick = () => this.recenter();

    const list = section.createDiv({ cls: "playlist-list" });
    this.visibleEpisodes().forEach((episode) => this.renderEpisodeRow(list, episode));
  }

  private renderAutoplayControl(controls: HTMLElement): void {
    const label = controls.createEl("label", {
      cls: "playlist-autoplay-container",
      attr: { title: "Continuously play all episodes in the playlist" },
    });
    const checkbox = label.createEl("input", {
      type: "checkbox",
      cls: "playlist-autoplay-checkbox",
    });
    checkbox.checked = this.options.isAutoplayEnabled;
    checkbox.onchange = () => this.options.onAutoplayChanged(checkbox.checked);
    label.createSpan({ text: "Autoplay" });
  }

  private renderSortControls(controls: HTMLElement): void {
    (["recent", "oldest"] as const).forEach((order) => {
      const button = controls.createEl("button", {
        cls: "playlist-sort-btn",
        text: order === "recent" ? "Recent" : "Oldest",
      });
      button.classList.toggle("active-sort", this.options.sortOrder === order);
      button.onclick = () => this.options.onSortRequested(order);
    });
  }

  private renderEpisodeRow(list: HTMLElement, episode: FeedItem): void {
    const row = list.createDiv({ cls: "playlist-episode-row" });
    row.setAttribute("data-episode-guid", episode.guid);
    row.onclick = () => this.options.onEpisodeSelected(episode);
    row.classList.toggle("active", episode.guid === this.options.activeEpisodeGuid);

    const progress = this.options.progressData?.get(episode.guid);
    if (progress && progress.position > 0 && progress.duration > 0) {
      row.addClass("has-progress");
      row.style.setProperty(
        "--progress-width",
        `${(progress.position / progress.duration) * 100}%`,
      );
    }

    const coverImage =
      episode.coverImage ||
      episode.image ||
      episode.itunes?.image?.href ||
      "";
    if (coverImage) {
      const image = row.createEl("img", {
        cls: "playlist-ep-cover",
        attr: { src: coverImage, alt: episode.title },
      });
      image.onerror = () => {
        image.addClass("hidden");
        row.createDiv({ cls: "playlist-ep-cover-placeholder", text: "🎧" });
      };
    } else {
      row.createDiv({ cls: "playlist-ep-cover-placeholder", text: "🎧" });
    }

    const info = row.createDiv({ cls: "playlist-ep-info" });
    info.createDiv({ cls: "playlist-ep-title", text: episode.title });
    const meta = info.createDiv({ cls: "playlist-ep-meta" });
    const metaLeft = meta.createDiv({ cls: "playlist-ep-meta-left" });
    metaLeft.createDiv({
      cls: "playlist-ep-date",
      text: episode.pubDate ? new Date(episode.pubDate).toLocaleDateString() : "",
    });
    if (episode.duration || episode.itunes?.duration) {
      metaLeft.createDiv({
        cls: "episode-duration-badge",
        text: episode.duration || episode.itunes?.duration || "",
      });
    }
    this.renderTags(meta, episode.tags);
    if (progress && progress.position > 0 && progress.duration > 0) {
      const indicator = row.createDiv({ cls: "episode-progress-indicator" });
      indicator.style.setProperty(
        "--progress-width",
        `${(progress.position / progress.duration) * 100}%`,
      );
    }
  }

  private renderTags(
    meta: HTMLElement,
    tags: Array<{ name: string; color?: string }> | undefined,
  ): void {
    if (!tags?.length) return;
    const wrap = meta.createDiv({ cls: "playlist-ep-meta-tags" });
    tags.slice(0, 3).forEach((tag) => {
      const tagElement = wrap.createDiv({ cls: "playlist-ep-tag", text: tag.name });
      if (tag.color) tagElement.style.backgroundColor = tag.color;
    });
    if (tags.length > 3) {
      const remaining = tags.slice(3);
      wrap.createDiv({
        cls: "playlist-ep-tag playlist-ep-tag-more",
        text: `+${remaining.length}`,
        attr: {
          title: remaining.map((tag) => tag.name).join("\n"),
          "aria-label": remaining.map((tag) => tag.name).join("\n"),
        },
      });
    }
  }

  private visibleEpisodes(): FeedItem[] {
    return this.options.episodes.slice(
      this.windowStart,
      this.windowStart + PLAYLIST_WINDOW_SIZE,
    );
  }

  private moveWindow(amount: number): void {
    this.windowStart = this.clampWindowStart(this.windowStart + amount);
    this.options.onWindowChanged?.(this.windowStart);
    this.section?.remove();
    this.section = null;
    this.render();
  }

  private recenter(): void {
    this.windowStart = this.centeredWindowStart();
    this.options.onWindowChanged?.(this.windowStart);
    this.section?.remove();
    this.section = null;
    this.render();
  }

  private centeredWindowStart(): number {
    const activeIndex = this.options.episodes.findIndex(
      (episode) => episode.guid === this.options.activeEpisodeGuid,
    );
    return Math.min(
      Math.max(0, activeIndex - 2),
      Math.max(0, this.options.episodes.length - PLAYLIST_WINDOW_SIZE),
    );
  }

  private clampWindowStart(start: number): number {
    return Math.max(
      0,
      Math.min(start, Math.max(0, this.options.episodes.length - 1)),
    );
  }

  private rangeText(): string {
    const start = this.options.episodes.length === 0 ? 0 : this.windowStart + 1;
    const end = Math.min(
      this.windowStart + PLAYLIST_WINDOW_SIZE,
      this.options.episodes.length,
    );
    return `Episodes ${start}–${end} of ${this.options.episodes.length}`;
  }
}
