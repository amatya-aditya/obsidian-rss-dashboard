import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEMPLATE_VARIABLES } from "../../../src/services/article-template/template-variables";
import { renderTemplateVariableHelp } from "../../../src/settings/template-variable-help";

const EXPECTED_GROUPS: Record<string, string[]> = {
  "Article dates": [
    "date",
    "dateShort",
    "date:FORMAT",
    "isoDate",
    "isoDateTime",
  ],
  "First-seen dates": ["firstSeen", "firstSeenISO"],
  "Save date and time": ["saveDate", "saveTime12", "saveTime24"],
  "Article and feed details": [
    "title",
    "author",
    "feedTitle",
    "source",
    "guid",
    "tags",
    "language",
  ],
  Content: ["summary", "description", "excerpt", "content"],
  "Links and media": ["link", "image"],
};

describe("renderTemplateVariableHelp", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
    renderTemplateVariableHelp(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("shows the six groups in order, each an h4 followed by a list", () => {
    const headings = Array.from(container.querySelectorAll("h4"));
    expect(headings.map((h) => h.textContent)).toEqual(
      Object.keys(EXPECTED_GROUPS),
    );
    for (const heading of headings) {
      expect(heading.nextElementSibling?.tagName).toBe("UL");
    }
  });

  it("places each variable in its group, in code", () => {
    for (const heading of Array.from(container.querySelectorAll("h4"))) {
      const names = Array.from(
        heading.nextElementSibling?.querySelectorAll("li > code") ?? [],
      ).map((code) => code.textContent);
      expect(names).toEqual(
        EXPECTED_GROUPS[heading.textContent ?? ""]?.map((n) => `{{${n}}}`),
      );
    }
  });

  it("documents every supported variable exactly once", () => {
    const names = Array.from(container.querySelectorAll("li > code")).map(
      (code) => code.textContent,
    );
    const expected = [
      ...Object.keys(TEMPLATE_VARIABLES),
      "content",
      "date:FORMAT",
    ].map((n) => `{{${n}}}`);
    expect([...names].sort()).toEqual([...expected].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it("distinguishes similar variables", () => {
    const text = (name: string) =>
      Array.from(container.querySelectorAll("li")).find(
        (li) => li.querySelector("code")?.textContent === `{{${name}}}`,
      )?.textContent ?? "";
    expect(text("isoDateTime")).toContain(
      "same full ISO 8601 timestamp as {{isoDate}}",
    );
    expect(text("source")).toContain("same value as {{feedTitle}}");
    expect(text("tags")).toContain("tags: [{{tags}}]");
    expect(text("language")).toContain("left out when the language is unknown");
    expect(text("content")).toContain("Save full content");
  });
});
