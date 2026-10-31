import { describe, expect, it } from "vitest";
import {
  bodyLeadsWithHero,
  noteLeadsWithHero,
  removeTemplateImageFromBody,
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

describe("removeTemplateImageFromBody", () => {
  const IMAGE =
    "https://cdn.example.com/uploads/phrased-and-confused.jpg?w=640";

  it("removes the body image that is another size of the same file", () => {
    const html =
      '<p>Lead.</p><img src="https://cdn.example.com/uploads/phrased-and-confused.jpg?resize=1200,630"><p>Body.</p>';

    expect(removeTemplateImageFromBody(html, IMAGE)).toBe(
      "<p>Lead.</p><p>Body.</p>",
    );
  });

  it("removes a resizer-proxied copy whose path differs but whose file name matches", () => {
    const html =
      '<p>Lead.</p><img src="https://images.example.com/t/Y-5ER0kP9/400x0/article-new/2021/08/General-App-Store-South-Korea-Feature.jpg?lossy"><p>Body.</p>';

    expect(
      removeTemplateImageFromBody(
        html,
        "https://images.example.com/article-new/2021/08/General-App-Store-South-Korea-Feature.jpg",
      ),
    ).toBe("<p>Lead.</p><p>Body.</p>");
  });

  it("removes the figure that wrapped the image, not just the image", () => {
    const html =
      '<figure><img src="https://cdn.example.com/uploads/phrased-and-confused-300x200.jpg"></figure><p>Body.</p>';

    expect(removeTemplateImageFromBody(html, IMAGE)).toBe("<p>Body.</p>");
  });

  it("removes only the first matching image", () => {
    const html =
      '<img src="https://cdn.example.com/uploads/phrased-and-confused.jpg"><p>Body.</p><img src="https://cdn.example.com/uploads/phrased-and-confused.jpg">';

    expect(removeTemplateImageFromBody(html, IMAGE)).toBe(
      '<p>Body.</p><img src="https://cdn.example.com/uploads/phrased-and-confused.jpg">',
    );
  });

  it("keeps an unrelated image", () => {
    const html =
      '<img src="https://cdn.example.com/uploads/chart-2026.png"><p>Body.</p>';

    expect(removeTemplateImageFromBody(html, IMAGE)).toBe(html);
  });

  it("keeps an image that only shares a generic file name", () => {
    const html =
      '<img src="https://other.example.com/a/image.jpg"><p>Body.</p>';

    expect(
      removeTemplateImageFromBody(html, "https://cdn.example.com/b/image.jpg"),
    ).toBe(html);
  });

  it("returns the html untouched when there is no image to match", () => {
    const html = '<img src="https://cdn.example.com/uploads/a-photo.jpg">';

    expect(removeTemplateImageFromBody(html, "")).toBe(html);
  });
});
