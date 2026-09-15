import type { FeedItem } from "../types/types";

const EPISODE_BATCH_SIZE = 20;

export interface PodcastEpisodeListOptions {
  episodes: FeedItem[];
  activeEpisodeGuid?: string;
  theme: string;
  sortOrder: "recent" | "oldest";
  isAutoplayEnabled?: boolean;
  visibleCount?: number;
  progressData?: ReadonlyMap<string, { position: number; duration: number }>;
  onEpisodeSelected: (episode: FeedItem) => void;
  onSortRequested: (order: "recent" | "oldest") => void;
  onAutoplayChanged?: (enabled: boolean) => void;
  onVisibleCountChanged?: (count: number) => void;
}

/** Renders a bounded, read-only episode list for one podcast feed. */
export class PodcastEpisodeList {
  private visibleCount: number;
  private section: HTMLElement | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: PodcastEpisodeListOptions,
  ) {
    this.visibleCount = Math.min(
      options.visibleCount ?? EPISODE_BATCH_SIZE,
      options.episodes.length,
    );
  }

  render(): void {
    if (this.options.episodes.length <= 1) {
      this.container.createDiv({
        cls: "episode-list-empty",
        text: "No other episodes available in this feed",
      });
      return;
    }

    const section = this.container.createDiv({ cls: "podcast-episode-list-section" });
    this.section = section;
    section.setAttribute("data-podcast-theme", this.options.theme);
    const header = section.createDiv({ cls: "episode-list-header" });
    header.createDiv({
      cls: "episode-list-title",
      text: `More episodes from ${this.options.episodes[0]?.feedTitle || "this feed"}`,
    });
    const autoplayRow = section.createDiv({ cls: "episode-list-autoplay-row" });
    const autoplayLabel = autoplayRow.createEl("label", {
      cls: "podcast-autoplay-container",
      attr: {
        title: "Continues in the current feed and selected episode order",
      },
    });
    const autoplayCheckbox = autoplayLabel.createEl("input", {
      type: "checkbox",
      cls: "podcast-autoplay-checkbox",
    });
    autoplayCheckbox.checked = this.options.isAutoplayEnabled ?? false;
    autoplayCheckbox.onchange = () =>
      this.options.onAutoplayChanged?.(autoplayCheckbox.checked);
    autoplayLabel.createSpan({ text: "Autoplay next episode" });

    const statusRow = section.createDiv({ cls: "episode-list-status-row" });
    statusRow.createDiv({
      cls: "episode-list-range",
      text: `Showing ${this.visibleCount} of ${this.options.episodes.length}`,
      attr: { role: "status" },
    });
    this.renderControls(statusRow);

    const list = section.createDiv({ cls: "episode-list" });
    this.options.episodes
      .slice(0, this.visibleCount)
      .forEach((episode) => this.renderRow(list, episode));

    if (this.visibleCount < this.options.episodes.length) {
      const button = section.createEl("button", {
        cls: "episode-list-load-more",
        text: `Load ${Math.min(EPISODE_BATCH_SIZE, this.options.episodes.length - this.visibleCount)} more episodes`,
      });
      button.onclick = () => this.setVisibleCount(this.visibleCount + EPISODE_BATCH_SIZE);
    }
  }

  private renderControls(header: HTMLElement): void {
    const controls = header.createDiv({ cls: "episode-list-controls" });
    const sort = controls.createEl("select", {
      cls: "episode-list-sort",
      attr: { "aria-label": "Episode order" },
    });
    sort.createEl("option", { value: "recent", text: "Sort: Newest" });
    sort.createEl("option", { value: "oldest", text: "Sort: Oldest" });
    sort.value = this.options.sortOrder;
    sort.onchange = () =>
      this.options.onSortRequested(sort.value as "recent" | "oldest");

    const activeIndex = this.options.episodes.findIndex(
      (episode) => episode.guid === this.options.activeEpisodeGuid,
    );
    if (activeIndex >= this.visibleCount) {
      const currentEpisode = controls.createEl("button", {
        cls: "episode-list-current",
        text: "Current episode",
      });
      currentEpisode.onclick = () => this.setVisibleCount(activeIndex + 1);
    }
  }

  private renderRow(list: HTMLElement, episode: FeedItem): void {
    const isActive = episode.guid === this.options.activeEpisodeGuid;
    const row = list.createEl("button", {
      cls: "episode-list-row",
      attr: { type: "button", "data-episode-guid": episode.guid },
    });
    row.classList.toggle("active", isActive);
    if (isActive) row.setAttribute("aria-current", "true");
    row.onclick = () => this.options.onEpisodeSelected(episode);

    const progress = this.options.progressData?.get(episode.guid);
    if (progress && progress.position > 0 && progress.duration > 0) {
      row.addClass("has-progress");
      row.style.setProperty(
        "--progress-width",
        `${Math.min(100, (progress.position / progress.duration) * 100)}%`,
      );
    }

    const placeholder = row.createDiv({
      cls: "episode-list-cover-placeholder",
      text: "🎧",
    });
    const cover =
      episode.coverImage || episode.image || episode.itunes?.image?.href || "";
    if (cover && activeDocument.defaultView) {
      const image = new activeDocument.defaultView.Image();
      image.classList.add("episode-list-cover");
      image.alt = "";
      image.onload = () => placeholder.replaceWith(image);
      image.src = cover;
    }

    const info = row.createDiv({ cls: "episode-list-row-info" });
    info.createDiv({ cls: "episode-list-row-title", text: episode.title });
    const meta = info.createDiv({ cls: "episode-list-row-meta" });
    if (episode.pubDate) {
      meta.createSpan({
        cls: "episode-list-row-date",
        text: new Date(episode.pubDate).toLocaleDateString(),
      });
    }
    const duration = episode.duration || episode.itunes?.duration;
    if (duration) {
      meta.createSpan({ cls: "episode-list-row-duration", text: duration });
    }
    this.renderTags(meta, episode.tags);
  }

  private renderTags(
    meta: HTMLElement,
    tags: Array<{ name: string; color?: string }> | undefined,
  ): void {
    if (!tags || tags.length === 0) return;
    const tagsWrap = meta.createDiv({ cls: "episode-list-row-tags" });
    tags.slice(0, 3).forEach((tag) => {
      const tagEl = tagsWrap.createSpan({
        cls: "episode-list-row-tag",
        text: tag.name,
      });
      if (tag.color) tagEl.style.backgroundColor = tag.color;
    });
    if (tags.length > 3) {
      const remainingTags = tags.slice(3).map((tag) => tag.name).join("\n");
      tagsWrap.createSpan({
        cls: "episode-list-row-tag episode-list-row-tag-more",
        text: `+${tags.length - 3}`,
        attr: { title: remainingTags, "aria-label": remainingTags },
      });
    }
  }

  private setVisibleCount(count: number): void {
    this.visibleCount = Math.min(
      Math.ceil(count / EPISODE_BATCH_SIZE) * EPISODE_BATCH_SIZE,
      this.options.episodes.length,
    );
    this.options.onVisibleCountChanged?.(this.visibleCount);
    this.section?.remove();
    this.section = null;
    this.render();
  }
}
