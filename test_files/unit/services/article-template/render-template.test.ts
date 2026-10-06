import { describe, expect, it } from "vitest";
import { moment } from "obsidian";
import {
  renderArticleTemplate,
  type TemplateStep,
} from "../../../../src/services/article-template/render-template";
import type { ArticleTemplateValues } from "../../../../src/services/article-template/template-values";

// The real `obsidian` types `moment` as the moment namespace, which is not
// callable; production code casts it the same way.
type MomentFactory = (input?: Date) => { format: (fmt: string) => string };
const callMoment = moment as unknown as MomentFactory;

const ARTICLE_DATE = new Date("2024-04-21T12:00:00Z");

function createValues(
  overrides: Partial<ArticleTemplateValues> = {},
): ArticleTemplateValues {
  return {
    title: "Title",
    link: "https://example.com/a",
    author: "Ann",
    source: "Feed",
    feedTitle: "Feed",
    summary: "Sum",
    description: "Desc",
    excerpt: "Exc",
    language: "en-GB",
    tags: "News",
    guid: "g-1",
    image: "https://img.example/a.png",
    date: "April 21, 2024",
    dateShort: "2024-04-21",
    isoDate: "2024-04-21T12:00:00.000Z",
    isoDateTime: "2024-04-21T12:00:00.000Z",
    firstSeen: "April 20, 2024",
    firstSeenISO: "2024-04-20",
    saveDate: "2026-03-31",
    saveTime12: "08:30 PM",
    saveTime24: "20:30",
    saveDateLong: "March 31, 2026",
    articleDate: ARTICLE_DATE,
    ...overrides,
  };
}

describe("renderArticleTemplate", () => {
  it("fills each step's variable and leaves every other placeholder", () => {
    const steps: TemplateStep[] = [
      { kind: "variable", name: "title" },
      { kind: "variable", name: "link" },
    ];

    const text = renderArticleTemplate(
      "{{title}} {{link}} {{title}} {{author}} {{unknown}}",
      steps,
      createValues(),
    );

    expect(text).toBe(
      "Title https://example.com/a Title {{author}} {{unknown}}",
    );
  });

  it("fills a placeholder inside a value only when a later step substitutes it", () => {
    const values = createValues({ title: "A {{link}} B" });
    const titleFirst: TemplateStep[] = [
      { kind: "variable", name: "title" },
      { kind: "variable", name: "link" },
    ];
    const linkFirst: TemplateStep[] = [
      { kind: "variable", name: "link" },
      { kind: "variable", name: "title" },
    ];

    expect(renderArticleTemplate("{{title}}", titleFirst, values)).toBe(
      "A https://example.com/a B",
    );
    expect(renderArticleTemplate("{{title}}", linkFirst, values)).toBe(
      "A {{link}} B",
    );
  });

  it("writes an empty value in place, keeping its line", () => {
    const text = renderArticleTemplate(
      'a: "{{author}}"\nt: "{{title}}"',
      [
        { kind: "variable", name: "author" },
        { kind: "variable", name: "title" },
      ],
      createValues({ author: "" }),
    );

    expect(text).toBe('a: ""\nt: "Title"');
  });

  it("uses the step's default when the value is empty", () => {
    const steps: TemplateStep[] = [
      { kind: "variable", name: "source", defaultValue: "Web viewer" },
    ];

    expect(
      renderArticleTemplate("{{source}}", steps, createValues({ source: "" })),
    ).toBe("Web viewer");
    expect(renderArticleTemplate("{{source}}", steps, createValues())).toBe(
      "Feed",
    );
  });

  it("escapes the value for a double-quoted YAML scalar, default included, when the step asks", () => {
    const steps: TemplateStep[] = [
      { kind: "variable", name: "title", yamlEscape: true },
      {
        kind: "variable",
        name: "feedTitle",
        defaultValue: 'Web "viewer"',
        yamlEscape: true,
      },
    ];

    const text = renderArticleTemplate(
      't: "{{title}}"\nf: "{{feedTitle}}"',
      steps,
      createValues({ title: 'T "t"\nx', feedTitle: "" }),
    );

    expect(text).toBe('t: "T \\"t\\"\\nx"\nf: "Web \\"viewer\\""');
  });

  it("reads another value for the variable when the step names one", () => {
    const text = renderArticleTemplate(
      "{{date}}",
      [{ kind: "variable", name: "date", value: "saveDateLong" }],
      createValues(),
    );

    expect(text).toBe("March 31, 2026");
  });

  it("formats {{date:FORMAT}} placeholders from the article date with moment", () => {
    const text = renderArticleTemplate(
      "Custom: {{date:YYYY/MM/DD}} Time: {{date:HH:mm}} Long: {{date:dddd, MMMM Do YYYY}}",
      [{ kind: "dateFormat" }],
      createValues(),
    );

    expect(text).toBe(
      `Custom: ${callMoment(ARTICLE_DATE).format("YYYY/MM/DD")} Time: ${callMoment(ARTICLE_DATE).format("HH:mm")} Long: ${callMoment(ARTICLE_DATE).format("dddd, MMMM Do YYYY")}`,
    );
  });

  it("keeps $ sequences in {{content}} as they are", () => {
    const text = renderArticleTemplate(
      "{{content}}|{{content}}",
      [{ kind: "content" }],
      createValues(),
      "$$x^2$$ and $& and $'",
    );

    expect(text).toBe("$$x^2$$ and $& and $'|$$x^2$$ and $& and $'");
  });

  it("leaves the template as it is when there are no steps", () => {
    expect(renderArticleTemplate("{{title}}", [], createValues())).toBe(
      "{{title}}",
    );
  });
});
