import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Feed, FeedItem } from "../../../src/types/types";
import {
  buildArticle,
  createArticleListHarness,
} from "./article-list-harness";

type Harness = ReturnType<typeof createArticleListHarness>;

const FEED_URL = "https://example.com/feed";

/**
 * Mirrors the dashboard: the list renders shallow copies of the backing feed
 * items, article updates are written to the backing item, and tag edits
 * resync the visible copies from the backing items.
 */
function createDashboardLikeHarness(): { harness: Harness; source: FeedItem } {
  const source = buildArticle({
    guid: "guid-1",
    feedUrl: FEED_URL,
    tags: [{ name: "Favorite", color: "#f1c40f" }],
  });
  const feed = { url: FEED_URL, title: "Feed", items: [source] } as Feed;
  let harness: Harness | null = null;

  const resync = () => {
    harness?.list.syncVisibleArticlesFromSource((article) =>
      feed.items.find((item) => item.guid === article.guid) ?? null,
    );
    harness?.list.refreshVisibleArticleTags();
  };

  harness = createArticleListHarness({
    settings: {
      viewStyle: "card",
      availableTags: [
        { name: "Favorite", color: "#f1c40f" },
        { name: "Tech", color: "#d0168e" },
      ],
    },
    articles: [{ ...source }],
    callbacks: {
      onArticleUpdate: (article, updates) => {
        Object.assign(source, updates);
        Object.assign(article, updates);
        resync();
      },
      onTagsMutated: resync,
    },
  });
  harness.settings.feeds = [feed];
  harness.list.render();
  return { harness, source };
}

function openTagsPopover(harness: Harness): HTMLElement {
  const toggle = harness
    .getArticleEl("guid-1")
    ?.querySelector<HTMLElement>(".rss-dashboard-tags-toggle");
  if (!toggle) throw new Error("tags toggle not rendered");
  toggle.click();
  const portal = document.body.querySelector<HTMLElement>(
    ".rss-dashboard-tags-dropdown-content-portal",
  );
  if (!portal) throw new Error("tags popover did not open");
  return portal;
}

function closeTagsPopover(harness: Harness): void {
  harness
    .getArticleEl("guid-1")
    ?.querySelector<HTMLElement>(".rss-dashboard-tags-toggle")
    ?.click();
}

function tagRow(portal: HTMLElement, name: string): HTMLElement {
  const row = Array.from(
    portal.querySelectorAll<HTMLElement>(".rss-dashboard-tag-item"),
  ).find(
    (el) => el.querySelector(".rss-dashboard-tag-label")?.textContent === name,
  );
  if (!row) throw new Error(`tag row ${name} not found`);
  return row;
}

function setChecked(portal: HTMLElement, name: string, checked: boolean) {
  const box = tagRow(portal, name).querySelector<HTMLInputElement>(
    ".rss-dashboard-tag-checkbox",
  );
  if (!box) throw new Error(`checkbox ${name} not found`);
  box.checked = checked;
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renameTag(portal: HTMLElement, from: string, to: string) {
  tagRow(portal, from)
    .querySelector<HTMLElement>(".rss-dashboard-tag-edit-button")
    ?.click();
  const nameInput = document.body.querySelector<HTMLInputElement>(
    ".rss-dashboard-tag-modal-name-input",
  );
  const colorInput = document.body.querySelector<HTMLInputElement>(
    ".rss-dashboard-tag-modal-color-picker",
  );
  if (!nameInput || !colorInput) throw new Error("edit modal did not open");
  nameInput.value = to;
  colorInput.value = "#0ef1ed";
  document.body
    .querySelector<HTMLElement>(".rss-dashboard-primary-button")
    ?.click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("ArticleList tag edits after a tag toggle", () => {
  let harness: Harness;
  let source: FeedItem;

  beforeEach(() => {
    document.body.empty();
    ({ harness, source } = createDashboardLikeHarness());
  });

  afterEach(() => {
    closeTagsPopover(harness);
    harness.cleanup();
  });

  it("shows the renamed tag as checked when the popover reopens", async () => {
    let portal = openTagsPopover(harness);
    setChecked(portal, "Tech", true);
    setChecked(portal, "Tech", false);
    await renameTag(portal, "Favorite", "OCTOPUS");
    closeTagsPopover(harness);

    portal = openTagsPopover(harness);
    const box = tagRow(portal, "OCTOPUS").querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-checkbox",
    );
    expect(box?.checked).toBe(true);
  });

  it("does not write the old tag name back when another tag is toggled", async () => {
    let portal = openTagsPopover(harness);
    setChecked(portal, "Tech", true);
    setChecked(portal, "Tech", false);
    await renameTag(portal, "Favorite", "OCTOPUS");
    closeTagsPopover(harness);

    portal = openTagsPopover(harness);
    setChecked(portal, "Tech", true);

    expect(source.tags?.map((tag) => tag.name)).toEqual(["OCTOPUS", "Tech"]);
  });
});
