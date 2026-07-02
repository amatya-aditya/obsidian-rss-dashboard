import type { FeedItem, Tag } from "../../../types/types";
import { windowInstanceOf } from "../../../utils/platform-utils";

export const MAX_VISIBLE_TAGS = 6;

export function renderTagChips(container: HTMLElement, tags: Tag[]): void {
  container.empty();

  const tagsToShow = tags.slice(0, MAX_VISIBLE_TAGS);
  tagsToShow.forEach((tag) => {
    const tagEl = container.createDiv({
      cls: "rss-dashboard-tag-badge",
      text: tag.name,
    });
    tagEl.style.setProperty(
      "--tag-color",
      tag.color || "var(--interactive-accent)",
    );
  });

  if (tags.length > MAX_VISIBLE_TAGS) {
    const overflow = container.createDiv({
      cls: "rss-dashboard-tag-overflow",
      text: `+${tags.length - MAX_VISIBLE_TAGS}`,
    });
    overflow.title = tags
      .slice(MAX_VISIBLE_TAGS)
      .map((t) => t.name)
      .join(", ");
  }
}

export function createTagChip(container: HTMLElement, tag: Tag): HTMLElement {
  const tagEl = container.createDiv({
    cls: "rss-dashboard-tag-badge",
    text: tag.name,
  });
  tagEl.style.setProperty(
    "--tag-color",
    tag.color || "var(--interactive-accent)",
  );
  return tagEl;
}

export function createTagOverflowChip(
  container: HTMLElement,
  hiddenTags: Tag[],
): HTMLElement {
  const overflow = container.createDiv({
    cls: "rss-dashboard-tag-overflow",
    text: `+${hiddenTags.length}`,
  });
  overflow.title = hiddenTags.map((tag) => tag.name).join(", ");
  return overflow;
}

export function renderSingleRowCardTagChips(
  container: HTMLElement,
  tags: Tag[],
): void {
  container.empty();

  if (tags.length === 0) {
    return;
  }

  if (container.clientWidth <= 0) {
    renderTagChips(container, tags);
    return;
  }

  let visibleCount = 0;

  for (let i = 0; i < tags.length; i += 1) {
    createTagChip(container, tags[i]);
    visibleCount = i + 1;

    const remainingTags = tags.slice(visibleCount);
    let probeOverflow: HTMLElement | null = null;
    if (remainingTags.length > 0) {
      probeOverflow = createTagOverflowChip(container, remainingTags);
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
    createTagOverflowChip(container, hiddenTags);
  }
}

export function layoutCardTagRows(
  root: ParentNode,
  articles: FeedItem[],
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
    layoutSingleCardTagRow(card, articles);
  });
}

function layoutSingleCardTagRow(
  card: HTMLElement,
  articles: FeedItem[],
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

  renderSingleRowCardTagChips(tagsContainer, article.tags);
}
