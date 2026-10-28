import { setTooltip } from "obsidian";
import type { FeedItem, Tag } from "../../../types/types";
import { windowInstanceOf } from "../../../utils/platform-utils";
import {
  applyTagAppearance,
  DEFAULT_TAG_APPEARANCE_SETTINGS,
  type TagAppearanceSettings,
} from "../../../utils/tag-colors";

export const MAX_VISIBLE_TAGS = 6;

export function renderTagChips(
  container: HTMLElement,
  tags: Tag[],
  settings: TagAppearanceSettings = DEFAULT_TAG_APPEARANCE_SETTINGS,
): void {
  container.empty();

  const tagsToShow = tags.slice(0, MAX_VISIBLE_TAGS);
  tagsToShow.forEach((tag) => {
    const tagEl = container.createDiv({
      cls: "rss-dashboard-tag-badge",
      text: tag.name,
    });
    applyTagAppearance(tagEl, tag, settings);
  });

  if (tags.length > MAX_VISIBLE_TAGS) {
    createTagOverflowChip(container, tags.slice(MAX_VISIBLE_TAGS), settings);
  }
}

export function createTagChip(
  container: HTMLElement,
  tag: Tag,
  element: "div" | "button" = "div",
  settings: TagAppearanceSettings = DEFAULT_TAG_APPEARANCE_SETTINGS,
): HTMLElement {
  const tagEl = container.createEl(element, {
    cls: "rss-dashboard-tag-badge",
    text: tag.name,
  });
  applyTagAppearance(tagEl, tag, settings);
  return tagEl;
}

export function createTagOverflowChip(
  container: HTMLElement,
  hiddenTags: Tag[],
  settings: TagAppearanceSettings = DEFAULT_TAG_APPEARANCE_SETTINGS,
): HTMLElement {
  const overflow = container.createDiv({
    cls: "rss-dashboard-tag-overflow",
    text: `+${hiddenTags.length}`,
  });
  const representativeTag = hiddenTags[0];
  if (representativeTag) {
    applyTagAppearance(overflow, representativeTag, settings);
  }
  setTooltip(overflow, hiddenTags.map((tag) => tag.name).join(", "));
  return overflow;
}

export function renderSingleRowCardTagChips(
  container: HTMLElement,
  tags: Tag[],
  settings: TagAppearanceSettings = DEFAULT_TAG_APPEARANCE_SETTINGS,
): void {
  container.empty();

  if (tags.length === 0) {
    return;
  }

  if (container.clientWidth <= 0) {
    renderTagChips(container, tags, settings);
    return;
  }

  let visibleCount = 0;

  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i];
    if (!tag) continue;
    createTagChip(container, tag, "div", settings);
    visibleCount = i + 1;

    const remainingTags = tags.slice(visibleCount);
    let probeOverflow: HTMLElement | null = null;
    if (remainingTags.length > 0) {
      probeOverflow = createTagOverflowChip(container, remainingTags, settings);
    }

    const exceedsWidth = container.scrollWidth > container.clientWidth;
    probeOverflow?.remove();

    if (exceedsWidth) {
      container.lastElementChild?.remove();
      visibleCount = i;
      break;
    }
  }

  if (visibleCount < tags.length) {
    const hiddenTags = tags.slice(visibleCount);
    createTagOverflowChip(container, hiddenTags, settings);
  }
}

export function layoutCardTagRows(
  root: ParentNode,
  articles: FeedItem[],
  settings: TagAppearanceSettings = DEFAULT_TAG_APPEARANCE_SETTINGS,
): void {
  const cards: HTMLElement[] = [];

  if (
    windowInstanceOf(root, HTMLElement) &&
    root.classList.contains("rss-dashboard-article-card")
  ) {
    cards.push(root);
  }

  root
    .querySelectorAll<HTMLElement>(".rss-dashboard-article-card")
    .forEach((card) => cards.push(card));

  cards.forEach((card) => {
    layoutSingleCardTagRow(card, articles, settings);
  });
}

function layoutSingleCardTagRow(
  card: HTMLElement,
  articles: FeedItem[],
  settings: TagAppearanceSettings,
): void {
  const tagsContainer = card.querySelector<HTMLElement>(
    ".rss-dashboard-card-tags-region .rss-dashboard-tag-container",
  );
  const articleGuid = card.dataset.articleGuid;
  if (!tagsContainer || !articleGuid) {
    return;
  }

  const article = articles.find((item) => item.guid === articleGuid);
  if (!article?.tags?.length) {
    tagsContainer.empty();
    return;
  }

  renderSingleRowCardTagChips(tagsContainer, article.tags, settings);
}
