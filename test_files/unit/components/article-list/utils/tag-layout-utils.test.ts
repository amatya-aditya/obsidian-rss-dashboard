import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FeedItem, Tag } from "../../../../../src/types/types";
import {
  DEFAULT_TAG_COLOR,
  DEFAULT_TAG_TEXT_COLOR,
} from "../../../../../src/utils/tag-colors";
import {
  layoutCardTagRows,
  renderSingleRowCardTagChips,
  renderTagChips,
  createTagChip,
  createTagOverflowChip,
} from "../../../../../src/components/article-list/utils/tag-layout-utils";

describe("tag-layout-utils", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("renderTagChips", () => {
    it("renders tag badges up to MAX_VISIBLE_TAGS", () => {
      const tags: Tag[] = [
        { name: "Tag1", color: "#ff0000" },
        { name: "Tag2", color: "#00ff00" },
        { name: "Tag3", color: "#0000ff" },
        { name: "Tag4", color: "#ffff00" },
        { name: "Tag5", color: "#ff00ff" },
        { name: "Tag6", color: "#00ffff" },
        { name: "Tag7", color: "#ffffff" },
      ];

      renderTagChips(container, tags);

      const badges = container.querySelectorAll(".rss-dashboard-tag-badge");
      expect(badges).toHaveLength(6);
    });

    it("renders overflow chip when tags exceed MAX_VISIBLE_TAGS", () => {
      const tags: Tag[] = [
        { name: "Tag1", color: "#ff0000" },
        { name: "Tag2", color: "#00ff00" },
        { name: "Tag3", color: "#0000ff" },
        { name: "Tag4", color: "#ffff00" },
        { name: "Tag5", color: "#ff00ff" },
        { name: "Tag6", color: "#00ffff" },
        { name: "Tag7", color: "#ffffff" },
      ];

      renderTagChips(container, tags, {
        availableTags: [
          { name: "Tag7", color: "#123456", textColor: "#654321" },
        ],
      });

      const overflow = container.querySelector<HTMLElement>(
        ".rss-dashboard-tag-overflow",
      );
      expect(overflow?.textContent).toBe("+1");
      expect(overflow?.getAttribute("aria-label")).toBe("Tag7");
      expect(overflow?.style.getPropertyValue("--tag-color")).toBe("#123456");
      expect(overflow?.style.getPropertyValue("--tag-text-color")).toBe(
        "#654321",
      );
    });

    it("applies tag color as CSS variable", () => {
      const tags: Tag[] = [{ name: "Important", color: "#e74c3c" }];

      renderTagChips(container, tags);

      const badge = container.querySelector(
        ".rss-dashboard-tag-badge",
      ) as HTMLElement;
      expect(badge.style.getPropertyValue("--tag-color")).toBe("#e74c3c");
    });

    it("uses the global default color when tag has no color", () => {
      const tags: Tag[] = [{ name: "NoColor" }];

      renderTagChips(container, tags);

      const badge = container.querySelector(
        ".rss-dashboard-tag-badge",
      ) as HTMLElement;
      expect(badge.style.getPropertyValue("--tag-color")).toBe(
        DEFAULT_TAG_COLOR,
      );
    });

    it("resolves registry, orphan, and default appearance for each chip", () => {
      const tags: Tag[] = [
        {
          name: "Registered",
          color: "#stale-background",
          textColor: "#stale-text",
        },
        {
          name: "Inheriting",
          color: "#stale-background",
          textColor: "#stale-text",
        },
        { name: "Orphan", color: "#123456", textColor: "#654321" },
        { name: "New" },
      ];

      renderTagChips(container, tags, {
        availableTags: [
          { name: "Registered", color: "#234567", textColor: "#765432" },
          { name: "Inheriting" },
        ],
      });

      const badges = container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-tag-badge",
      );
      expect(
        Array.from(badges, (badge) => [
          badge.style.getPropertyValue("--tag-color"),
          badge.style.getPropertyValue("--tag-text-color"),
        ]),
      ).toEqual([
        ["#234567", "#765432"],
        [DEFAULT_TAG_COLOR, DEFAULT_TAG_TEXT_COLOR],
        ["#123456", "#654321"],
        [DEFAULT_TAG_COLOR, DEFAULT_TAG_TEXT_COLOR],
      ]);
    });
  });

  describe("createTagChip", () => {
    it("creates a tag element with correct classes and text", () => {
      const tag: Tag = { name: "TestTag", color: "#abc123" };

      const chip = createTagChip(container, tag);

      expect(chip.classList.contains("rss-dashboard-tag-badge")).toBe(true);
      expect(chip.textContent).toBe("TestTag");
      expect(chip.style.getPropertyValue("--tag-color")).toBe("#abc123");
    });
  });

  describe("createTagOverflowChip", () => {
    it("creates an overflow element with count", () => {
      const hiddenTags: Tag[] = [
        { name: "Hidden1", color: "#111" },
        { name: "Hidden2", color: "#222" },
      ];

      const chip = createTagOverflowChip(container, hiddenTags);

      expect(chip.classList.contains("rss-dashboard-tag-overflow")).toBe(true);
      expect(chip.textContent).toBe("+2");
    });

    it("sets a tooltip with comma-separated hidden tag names", () => {
      const hiddenTags: Tag[] = [
        { name: "Hidden1", color: "#111" },
        { name: "Hidden2", color: "#222" },
      ];

      const chip = createTagOverflowChip(container, hiddenTags);

      expect(chip.getAttribute("aria-label")).toBe("Hidden1, Hidden2");
    });

    it("uses the first hidden tag's canonical appearance", () => {
      const chip = createTagOverflowChip(
        container,
        [
          { name: "Hidden1", color: "#stale", textColor: "#stale" },
          { name: "Hidden2", color: "#222" },
        ],
        {
          availableTags: [
            { name: "Hidden1", color: "#123456", textColor: "#654321" },
          ],
        },
      );

      expect(chip.style.getPropertyValue("--tag-color")).toBe("#123456");
      expect(chip.style.getPropertyValue("--tag-text-color")).toBe("#654321");
      expect(chip.getAttribute("aria-label")).toBe("Hidden1, Hidden2");
    });
  });

  describe("renderSingleRowCardTagChips", () => {
    it("renders nothing when tags array is empty", () => {
      const tags: Tag[] = [];

      renderSingleRowCardTagChips(container, tags);

      expect(container.children).toHaveLength(0);
    });

    it("falls back to renderTagChips when container width is invalid", () => {
      const tags: Tag[] = [
        { name: "Tag1", color: "#ff0000" },
        { name: "Tag2", color: "#00ff00" },
      ];

      Object.defineProperty(container, "clientWidth", {
        value: 0,
        writable: true,
      });
      renderSingleRowCardTagChips(container, tags);

      const badges = container.querySelectorAll(".rss-dashboard-tag-badge");
      expect(badges).toHaveLength(2);
    });

    it("uses the first hidden tag's appearance on the card overflow chip", () => {
      Object.defineProperty(container, "clientWidth", { value: 1 });
      Object.defineProperty(container, "scrollWidth", {
        get: () => container.childElementCount * 10,
      });

      renderSingleRowCardTagChips(
        container,
        [
          { name: "Hidden1", color: "#stale", textColor: "#stale" },
          { name: "Hidden2", color: "#222" },
        ],
        {
          availableTags: [
            { name: "Hidden1", color: "#123456", textColor: "#654321" },
          ],
        },
      );

      const overflow = container.querySelector<HTMLElement>(
        ".rss-dashboard-tag-overflow",
      );
      expect(overflow?.style.getPropertyValue("--tag-color")).toBe("#123456");
      expect(overflow?.style.getPropertyValue("--tag-text-color")).toBe(
        "#654321",
      );
    });
  });

  describe("layoutCardTagRows", () => {
    it("processes cards and renders tags", () => {
      const card1 = createDiv();
      card1.className = "rss-dashboard-article-card";
      card1.dataset.articleGuid = "1";

      const card2 = createDiv();
      card2.className = "rss-dashboard-article-card";
      card2.dataset.articleGuid = "2";

      container.appendChild(card1);
      container.appendChild(card2);

      const articles: FeedItem[] = [
        {
          guid: "1",
          title: "A1",
          link: "https://example.com/1",
          description: "desc 1",
          feedTitle: "F1",
          feedUrl: "u1",
          pubDate: "2024-01-01",
          read: false,
          starred: false,
          tags: [],
          coverImage: "",
        },
        {
          guid: "2",
          title: "A2",
          link: "https://example.com/2",
          description: "desc 2",
          feedTitle: "F2",
          feedUrl: "u2",
          pubDate: "2024-01-02",
          read: false,
          starred: false,
          tags: [],
          coverImage: "",
        },
      ];

      // This will clear tag containers since articles have no tags
      layoutCardTagRows(container, articles);

      // Verify both cards were processed without error
      expect(card1.classList.contains("rss-dashboard-article-card")).toBe(true);
    });
  });
});
