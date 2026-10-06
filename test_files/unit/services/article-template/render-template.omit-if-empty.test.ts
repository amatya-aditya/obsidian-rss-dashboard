import { describe, expect, it } from "vitest";
import { renderArticleTemplate } from "../../../../src/services/article-template/render-template";
import type { ArticleTemplateValues } from "../../../../src/services/article-template/template-values";

// {{language}} is the registry's omitIfEmpty variable (#266, #246): an unknown
// language leaves out the whole `lang:` line instead of writing `lang: ""`.
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
