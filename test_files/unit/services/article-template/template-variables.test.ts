import { describe, expect, it } from "vitest";
import {
  TEMPLATE_VARIABLES,
  templatePlacesImage,
} from "../../../../src/services/article-template/template-variables";

describe("TEMPLATE_VARIABLES", () => {
  it("matches each variable's own {{name}} placeholder, every time it appears", () => {
    for (const [name, variable] of Object.entries(TEMPLATE_VARIABLES)) {
      expect(`{{${name}}} {{${name}}}`.replace(variable.placeholder, "V")).toBe(
        "V V",
      );
    }
  });

  it("omits a line holding only {{language}} or {{contentSource}} when it is empty (#246, #1248)", () => {
    const omitting = Object.entries(TEMPLATE_VARIABLES)
      .filter(([, variable]) => variable.omitIfEmpty)
      .map(([name]) => name);
    expect(omitting).toEqual(["language", "contentSource"]);
  });

  it("doesn't match a {{date:FORMAT}} placeholder", () => {
    expect(
      "{{date:YYYY}}".replace(TEMPLATE_VARIABLES.date.placeholder, "V"),
    ).toBe("{{date:YYYY}}");
  });
});

describe("templatePlacesImage", () => {
  it("is true when the note body holds {{image}}", () => {
    expect(templatePlacesImage("![]({{image}})\n\n{{content}}")).toBe(true);
  });

  it("is false for a template that never names the image", () => {
    expect(templatePlacesImage("# {{title}}\n\n{{content}}")).toBe(false);
  });

  it("does not count {{image}} used only in the leading frontmatter block", () => {
    expect(
      templatePlacesImage("---\ncover: {{image}}\n---\n\n{{content}}"),
    ).toBe(false);
    expect(
      templatePlacesImage("---\r\ncover: {{image}}\r\n---\r\n{{content}}"),
    ).toBe(false);
  });

  it("counts {{image}} in the body even when the frontmatter also holds it", () => {
    expect(
      templatePlacesImage(
        "---\ncover: {{image}}\n---\n\n![]({{image}})\n\n{{content}}",
      ),
    ).toBe(true);
  });

  it("treats a thematic break later in the note as body, not frontmatter", () => {
    expect(
      templatePlacesImage("{{content}}\n\n---\n\n![]({{image}})\n\n---\n"),
    ).toBe(true);
  });

  it("gives the same answer on repeated calls", () => {
    // The registry's regex is global; a stateful lastIndex must not leak.
    const template = "![]({{image}})";
    expect(templatePlacesImage(template)).toBe(true);
    expect(templatePlacesImage(template)).toBe(true);
  });
});
