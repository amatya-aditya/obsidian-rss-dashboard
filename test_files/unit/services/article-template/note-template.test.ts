import { describe, expect, it } from "vitest";
import {
  noteLeadsWithHero,
  resolveNoteTemplate,
} from "../../../../src/services/article-template/note-template";
import type { SavedTemplate } from "../../../../src/types/types";

const BUILT_IN = "# {{title}}\n\n{{content}}\n\n[Source]({{link}})";

function savedTemplate(template: string): SavedTemplate {
  return { id: "saved", name: "Saved", template };
}

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

describe("noteLeadsWithHero", () => {
  const settings = { defaultTemplate: "{{content}}" };

  it("leads with the hero when the resolved template never names the image", () => {
    expect(noteLeadsWithHero(settings, undefined, undefined)).toBe(true);
  });

  it("leads with the hero for the built-in template, which has no image", () => {
    expect(
      noteLeadsWithHero({ defaultTemplate: "" }, undefined, undefined),
    ).toBe(true);
  });

  it("drops the hero lead when the default template places the image in the body", () => {
    expect(
      noteLeadsWithHero(
        { defaultTemplate: "![]({{image}})\n\n{{content}}" },
        undefined,
        undefined,
      ),
    ).toBe(false);
  });

  it("reads the custom template rather than the default", () => {
    expect(
      noteLeadsWithHero(settings, "![]({{image}})\n\n{{content}}", undefined),
    ).toBe(false);
    expect(
      noteLeadsWithHero(
        { defaultTemplate: "![]({{image}})" },
        "{{content}}",
        undefined,
      ),
    ).toBe(true);
  });

  it("reads the saved template rather than the default", () => {
    expect(
      noteLeadsWithHero(
        settings,
        undefined,
        savedTemplate("![]({{image}})\n\n{{content}}"),
      ),
    ).toBe(false);
    expect(
      noteLeadsWithHero(
        { defaultTemplate: "![]({{image}})" },
        undefined,
        savedTemplate("{{content}}"),
      ),
    ).toBe(true);
  });

  it("keeps the hero lead when the image sits only in frontmatter", () => {
    expect(
      noteLeadsWithHero(
        settings,
        "---\ncover: {{image}}\n---\n\n{{content}}",
        undefined,
      ),
    ).toBe(true);
  });
});
