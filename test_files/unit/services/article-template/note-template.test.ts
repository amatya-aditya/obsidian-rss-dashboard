import { describe, expect, it } from "vitest";
import {
  bodyLeadsWithHero,
  noteLeadsWithHero,
  resolveNoteTemplate,
  templateImageUrl,
} from "../../../../src/services/article-template/note-template";
import type { FeedItem, SavedTemplate } from "../../../../src/types/types";

const BUILT_IN = "# {{title}}\n\n{{content}}\n\n[Source]({{link}})";
const IMAGE_TEMPLATE = "![]({{image}})\n\n{{content}}";

function savedTemplate(template: string): SavedTemplate {
  return { id: "saved", name: "Saved", template };
}

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test Article",
    link: "https://example.com/article",
    description: "<p>Desc</p>",
    pubDate: "2024-01-01T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    ...overrides,
  };
}

const WITH_IMAGE = createItem({ coverImage: "https://img.example.com/c.jpg" });
const WITHOUT_IMAGE = createItem();

describe("resolveNoteTemplate", () => {
  it("prefers a custom template over the settings default", () => {
    expect(
      resolveNoteTemplate({ defaultTemplate: "default" }, "custom", undefined),
    ).toBe("custom");
  });

  it("uses the settings default when no custom template is given", () => {
    expect(
      resolveNoteTemplate({ defaultTemplate: "default" }, undefined, undefined),
    ).toBe("default");
  });

  it("falls back to the built-in template when nothing is set", () => {
    expect(
      resolveNoteTemplate({ defaultTemplate: "" }, undefined, undefined),
    ).toBe(BUILT_IN);
    expect(resolveNoteTemplate({ defaultTemplate: "" }, "", undefined)).toBe(
      BUILT_IN,
    );
  });

  it("uses a saved template's own text and never the settings default", () => {
    expect(
      resolveNoteTemplate(
        { defaultTemplate: "default" },
        undefined,
        savedTemplate("saved text"),
      ),
    ).toBe("saved text");
  });

  it("lets a custom template replace the saved template's text, even when empty", () => {
    const saved = savedTemplate("saved text");

    expect(
      resolveNoteTemplate({ defaultTemplate: "default" }, "custom", saved),
    ).toBe("custom");
    expect(resolveNoteTemplate({ defaultTemplate: "default" }, "", saved)).toBe(
      "",
    );
  });
});

describe("templateImageUrl", () => {
  it("reads the cover first, then the feed's image, an iTunes image, and an image enclosure", () => {
    expect(
      templateImageUrl(
        createItem({
          coverImage: "https://img.example.com/cover.jpg",
          image: "https://img.example.com/image.jpg",
        }),
      ),
    ).toBe("https://img.example.com/cover.jpg");
    expect(
      templateImageUrl(
        createItem({ image: "https://img.example.com/image.jpg" }),
      ),
    ).toBe("https://img.example.com/image.jpg");
    expect(
      templateImageUrl(
        createItem({
          itunes: { image: { href: "https://img.example.com/itunes.jpg" } },
        }),
      ),
    ).toBe("https://img.example.com/itunes.jpg");
    expect(
      templateImageUrl(
        createItem({
          enclosure: {
            url: "https://img.example.com/enclosure.jpg",
            length: "0",
            type: "image/jpeg",
          },
        }),
      ),
    ).toBe("https://img.example.com/enclosure.jpg");
  });

  it("is empty for an item with no image, and ignores a non-image enclosure", () => {
    expect(templateImageUrl(WITHOUT_IMAGE)).toBe("");
    expect(
      templateImageUrl(
        createItem({
          enclosure: {
            url: "https://cdn.example.com/episode.mp3",
            length: "0",
            type: "audio/mpeg",
          },
        }),
      ),
    ).toBe("");
  });
});

describe("bodyLeadsWithHero", () => {
  it("leads with the hero when the template never names the image", () => {
    expect(bodyLeadsWithHero("{{content}}", WITH_IMAGE)).toBe(true);
  });

  it("drops the hero lead when the body places {{image}} and the item has an image", () => {
    expect(bodyLeadsWithHero(IMAGE_TEMPLATE, WITH_IMAGE)).toBe(false);
  });

  it("keeps the hero lead when the body places {{image}} but the item has no image for it", () => {
    expect(bodyLeadsWithHero(IMAGE_TEMPLATE, WITHOUT_IMAGE)).toBe(true);
  });

  it("keeps the hero lead when the image sits only in frontmatter", () => {
    expect(
      bodyLeadsWithHero(
        "---\ncover: {{image}}\n---\n\n{{content}}",
        WITH_IMAGE,
      ),
    ).toBe(true);
  });
});

describe("noteLeadsWithHero", () => {
  const settings = { defaultTemplate: "{{content}}" };

  it("leads with the hero for the built-in template, which has no image", () => {
    expect(
      noteLeadsWithHero(
        { defaultTemplate: "" },
        undefined,
        undefined,
        WITH_IMAGE,
      ),
    ).toBe(true);
  });

  it("drops the hero lead when the default template places the image in the body", () => {
    expect(
      noteLeadsWithHero(
        { defaultTemplate: IMAGE_TEMPLATE },
        undefined,
        undefined,
        WITH_IMAGE,
      ),
    ).toBe(false);
  });

  it("reads the custom template rather than the default", () => {
    expect(
      noteLeadsWithHero(settings, IMAGE_TEMPLATE, undefined, WITH_IMAGE),
    ).toBe(false);
    expect(
      noteLeadsWithHero(
        { defaultTemplate: IMAGE_TEMPLATE },
        "{{content}}",
        undefined,
        WITH_IMAGE,
      ),
    ).toBe(true);
  });

  it("reads the saved template rather than the default", () => {
    expect(
      noteLeadsWithHero(
        settings,
        undefined,
        savedTemplate(IMAGE_TEMPLATE),
        WITH_IMAGE,
      ),
    ).toBe(false);
    expect(
      noteLeadsWithHero(
        { defaultTemplate: IMAGE_TEMPLATE },
        undefined,
        savedTemplate("{{content}}"),
        WITH_IMAGE,
      ),
    ).toBe(true);
  });

  it("keeps the hero lead for an item with no image, whatever the template", () => {
    expect(
      noteLeadsWithHero(settings, IMAGE_TEMPLATE, undefined, WITHOUT_IMAGE),
    ).toBe(true);
  });
});
