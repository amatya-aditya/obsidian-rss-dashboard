import { describe, expect, it } from "vitest";
import { renderArticleTemplate } from "../../../../src/services/article-template/render-template";
import type { ArticleTemplateValues } from "../../../../src/services/article-template/template-values";

// {{language}} is the registry's omitIfEmpty variable (#266, #246): an unknown
// language leaves out the whole `lang:` line instead of writing `lang: ""`.
// {{contentSource}} is the second one (#1248): a call site that cannot say
// which version it wrote leaves out the row instead of guessing.
function createValues(language: string): ArticleTemplateValues {
  return {
    title: "Title",
    link: "",
    author: "",
    source: "",
    feedTitle: "",
    summary: "",
    description: "",
    excerpt: "",
    language,
    contentSource: "",
    tags: "",
    guid: "",
    image: "",
    date: "",
    dateShort: "",
    isoDate: "",
    isoDateTime: "",
    firstSeen: "",
    firstSeenISO: "",
    saveDate: "",
    saveTime12: "",
    saveTime24: "",
    saveDateLong: "",
    articleDate: new Date(0),
  };
}

describe("renderArticleTemplate with an omitIfEmpty variable", () => {
  const template =
    '---\nlang: "{{language}}"\ntitle: "{{title}}"\nin {{language}}\n---';

  it("leaves out every line holding the placeholder when the value is empty", () => {
    const text = renderArticleTemplate(
      template,
      [{ kind: "variable", name: "language" }],
      createValues(""),
    );

    expect(text).toBe('---\ntitle: "{{title}}"\n---');
  });

  it("fills the placeholder when the value is not empty", () => {
    const text = renderArticleTemplate(
      template,
      [{ kind: "variable", name: "language" }],
      createValues("de-DE"),
    );

    expect(text).toBe('---\nlang: "de-DE"\ntitle: "{{title}}"\nin de-DE\n---');
  });

  it("fills the step's default rather than leaving the line out", () => {
    const text = renderArticleTemplate(
      'lang: "{{language}}"',
      [{ kind: "variable", name: "language", defaultValue: "und" }],
      createValues(""),
    );

    expect(text).toBe('lang: "und"');
  });

  it("keeps CRLF line endings on the lines it keeps", () => {
    const text = renderArticleTemplate(
      "a\r\n{{language}}\r\nb",
      [{ kind: "variable", name: "language" }],
      createValues(""),
    );

    expect(text).toBe("a\r\nb");
  });
});

describe("renderArticleTemplate with {{contentSource}} (#1248)", () => {
  const template =
    '---\ncontentSource: "{{contentSource}}"\ntitle: "{{title}}"\n---';
  const step = [{ kind: "variable", name: "contentSource" }] as const;

  it("leaves out the row when the call site cannot name the version", () => {
    const text = renderArticleTemplate(template, [...step], createValues(""));

    expect(text).toBe('---\ntitle: "{{title}}"\n---');
  });

  it("fills the row with the version the save wrote", () => {
    const text = renderArticleTemplate(template, [...step], {
      ...createValues(""),
      contentSource: "Fetched content",
    });

    expect(text).toBe(
      '---\ncontentSource: "Fetched content"\ntitle: "{{title}}"\n---',
    );
  });
});
