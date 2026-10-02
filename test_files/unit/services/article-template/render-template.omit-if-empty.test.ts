import { describe, expect, it, vi } from "vitest";
import { renderArticleTemplate } from "../../../../src/services/article-template/render-template";
import type { ArticleTemplateValues } from "../../../../src/services/article-template/template-values";

// No variable sets omitIfEmpty yet ({{language}} will, #266), so give
// {{author}} the flag to show what the renderer does with it.
vi.mock(
  "../../../../src/services/article-template/template-variables",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../../src/services/article-template/template-variables")
      >();
    return {
      ...original,
      TEMPLATE_VARIABLES: {
        ...original.TEMPLATE_VARIABLES,
        author: { ...original.TEMPLATE_VARIABLES.author, omitIfEmpty: true },
      },
    };
  },
);

function createValues(author: string): ArticleTemplateValues {
  return {
    title: "Title",
    link: "",
    author,
    source: "",
    feedTitle: "",
    summary: "",
    tags: "",
    guid: "",
    image: "",
    date: "",
    dateShort: "",
    isoDate: "",
    isoDateTime: "",
    firstSeen: "",
    saveDate: "",
    saveTime12: "",
    saveTime24: "",
    saveDateLong: "",
    articleDate: new Date(0),
  };
}

describe("renderArticleTemplate with an omitIfEmpty variable", () => {
  const template = '---\nauthor: "{{author}}"\ntitle: "{{title}}"\nby {{author}}\n---';

  it("leaves out every line holding the placeholder when the value is empty", () => {
    const text = renderArticleTemplate(
      template,
      [{ kind: "variable", name: "author" }],
      createValues(""),
    );

    expect(text).toBe('---\ntitle: "{{title}}"\n---');
  });

  it("fills the placeholder when the value is not empty", () => {
    const text = renderArticleTemplate(
      template,
      [{ kind: "variable", name: "author" }],
      createValues("Ann"),
    );

    expect(text).toBe('---\nauthor: "Ann"\ntitle: "{{title}}"\nby Ann\n---');
  });

  it("fills the step's default rather than leaving the line out", () => {
    const text = renderArticleTemplate(
      'author: "{{author}}"',
      [{ kind: "variable", name: "author", defaultValue: "Unknown" }],
      createValues(""),
    );

    expect(text).toBe('author: "Unknown"');
  });

  it("keeps CRLF line endings on the lines it keeps", () => {
    const text = renderArticleTemplate(
      "a\r\n{{author}}\r\nb",
      [{ kind: "variable", name: "author" }],
      createValues(""),
    );

    expect(text).toBe("a\r\nb");
  });
});
