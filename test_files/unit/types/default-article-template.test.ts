import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

describe("shipped default article template", () => {
  const template = DEFAULT_SETTINGS.articleSaving.defaultTemplate;
  const closing = template.indexOf("\n---\n", 3);
  const body = template.slice(closing + "\n---\n".length);

  it("starts the body immediately after the closing frontmatter delimiter", () => {
    expect(closing).toBeGreaterThan(0);
    expect(body.startsWith("# {{title}}")).toBe(true);
  });

  it("has no leading whitespace on any body line", () => {
    for (const line of body.split("\n")) {
      expect(line).toBe(line.trimStart());
    }
  });

  it("keeps blank lines between body blocks", () => {
    expect(body).toBe("# {{title}}\n\n{{content}}\n\n[Source]({{link}})");
  });
});
