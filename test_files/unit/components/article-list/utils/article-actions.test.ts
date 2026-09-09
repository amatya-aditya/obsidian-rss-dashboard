import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FeedItem } from "../../../../../src/types/types";
import {
  createReadToggle,
  createStarToggle,
  createTagsToggle,
  createActionButtons,
  type CreateActionButtonArgs,
} from "../../../../../src/components/article-list/utils/article-actions";

describe("article-actions utils", () => {
  let actionToolbar: HTMLElement;
  let article: FeedItem;

  beforeEach(() => {
    actionToolbar = createDiv();
    document.body.appendChild(actionToolbar);

    article = {
      title: "Test Article",
      link: "https://example.com/article",
      description: "Description",
      pubDate: "2024-01-01",
      guid: "test-article-guid",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Test Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  const baseArgs = (overrides: Partial<CreateActionButtonArgs> = {}): CreateActionButtonArgs => ({
    article,
    actionToolbar,
    mode: "full" as const,
    settings: {},
    callbacks: {},
    deps: { showTagsDropdown: () => {} },
    ...overrides,
  });

  describe("createReadToggle", () => {
    it("creates read toggle element with correct initial state", () => {
      createReadToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-read-toggle");
      expect(toggle).toBeTruthy();
      expect(toggle?.classList.contains("unread")).toBe(true);
    });

    it("renders as read when article is already read", () => {
      article.read = true;
      createReadToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-read-toggle");
      expect(toggle?.classList.contains("read")).toBe(true);
    });
  });

  describe("createStarToggle", () => {
    it("creates star toggle element with correct initial state", () => {
      createStarToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-star-toggle");
      expect(toggle).toBeTruthy();
      expect(toggle?.classList.contains("unstarred")).toBe(true);
    });

    it("renders as starred when article is starred", () => {
      article.starred = true;
      createStarToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-star-toggle");
      expect(toggle?.classList.contains("starred")).toBe(true);
    });

    it("does not mutate article.starred directly on click; only the onArticleUpdate boundary may commit it", () => {
      const onArticleUpdate = vi.fn();
      createStarToggle(baseArgs({ callbacks: { onArticleUpdate } }));

      const toggle = actionToolbar.querySelector<HTMLElement>(".rss-dashboard-star-toggle");
      toggle?.click();

      expect(onArticleUpdate).toHaveBeenCalledWith(article, { starred: true }, false);
      // The click handler must not have flipped article.starred itself; only
      // the boundary (onArticleUpdate) is allowed to commit that value.
      expect(article.starred).toBe(false);
    });

    it("optimistically reflects the desired star state immediately, then reconciles to the committed value once onArticleUpdate resolves", async () => {
      let resolveUpdate: (() => void) | undefined;
      const onArticleUpdate = vi.fn(() => {
        // Simulate the boundary committing the change asynchronously.
        return new Promise<void>((resolve) => {
          resolveUpdate = () => {
            article.starred = true;
            resolve();
          };
        });
      });
      createStarToggle(baseArgs({ callbacks: { onArticleUpdate } }));

      const toggle = actionToolbar.querySelector<HTMLElement>(".rss-dashboard-star-toggle");
      toggle?.click();

      // Optimistic UI update happens synchronously on click.
      expect(toggle?.classList.contains("starred")).toBe(true);
      expect(toggle?.classList.contains("unstarred")).toBe(false);

      resolveUpdate?.();
      await Promise.resolve();
      await Promise.resolve();

      expect(article.starred).toBe(true);
      expect(toggle?.classList.contains("starred")).toBe(true);
    });

    it("reverts the optimistic star state when the boundary leaves article.starred unchanged (e.g. a rejected commit)", async () => {
      let resolveUpdate: (() => void) | undefined;
      const onArticleUpdate = vi.fn(() => {
        // Simulate a failed commit: the boundary resolves without changing
        // article.starred, and the caller is expected to surface an error.
        return new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        });
      });
      createStarToggle(baseArgs({ callbacks: { onArticleUpdate } }));

      const toggle = actionToolbar.querySelector<HTMLElement>(".rss-dashboard-star-toggle");
      toggle?.click();

      expect(toggle?.classList.contains("starred")).toBe(true);

      resolveUpdate?.();
      await Promise.resolve();
      await Promise.resolve();

      // article.starred was never committed (still false), so the icon must
      // reconcile back rather than staying optimistically starred.
      expect(article.starred).toBe(false);
      expect(toggle?.classList.contains("starred")).toBe(false);
      expect(toggle?.classList.contains("unstarred")).toBe(true);
    });
  });

  describe("createTagsToggle", () => {
    it("creates tag dropdown toggle element", () => {
      createTagsToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-tags-toggle");
      expect(toggle).toBeTruthy();
    });

    it("delegates to showTagsDropdown on click", () => {
      const showTagsDropdown = vi.fn();
      createTagsToggle(baseArgs({ deps: { showTagsDropdown } }));

      const toggle = actionToolbar.querySelector(".rss-dashboard-tags-toggle") as HTMLElement;
      toggle.click();

      expect(showTagsDropdown).toHaveBeenCalledWith(toggle, article);
    });

    it("delegates to showTagsDropdown on keyboard space", () => {
      const showTagsDropdown = vi.fn();
      createTagsToggle(baseArgs({ deps: { showTagsDropdown } }));

      const toggle = actionToolbar.querySelector(".rss-dashboard-tags-toggle") as HTMLElement;
      toggle.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

      expect(showTagsDropdown).toHaveBeenCalled();
    });
  });

  describe("createActionButtons", () => {
    it("includes read, save, and star toggles in full mode", () => {
      createActionButtons(baseArgs());

      expect(actionToolbar.querySelector(".rss-dashboard-read-toggle")).toBeTruthy();
      expect(actionToolbar.querySelector(".rss-dashboard-save-toggle")).toBeTruthy();
      expect(actionToolbar.querySelector(".rss-dashboard-star-toggle")).toBeTruthy();
    });

    it("includes tags toggle in full mode", () => {
      createActionButtons(baseArgs());

      expect(actionToolbar.querySelector(".rss-dashboard-tags-toggle")).toBeTruthy();
    });

    it("includes only read toggle in minimal-read mode", () => {
      createActionButtons(baseArgs({ mode: "minimal-read" }));

      expect(actionToolbar.querySelector(".rss-dashboard-read-toggle")).toBeTruthy();
      expect(actionToolbar.querySelector(".rss-dashboard-save-toggle")).toBeFalsy();
      expect(actionToolbar.querySelector(".rss-dashboard-star-toggle")).toBeFalsy();
      expect(actionToolbar.querySelector(".rss-dashboard-tags-toggle")).toBeFalsy();
    });
  });
});
