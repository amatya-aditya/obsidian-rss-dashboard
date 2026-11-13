import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const stylesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/styles",
);
const readerCss = readFileSync(path.join(stylesDir, "reader.css"), "utf-8");

describe("Inline Reader font size", () => {
  it("uses Obsidian's Reader text size as its inherited base", () => {
    let fontSize: string | undefined;
    postcss.parse(readerCss).walkRules((rule) => {
      if (!rule.selectors.includes(".inline-reader-content")) return;
      rule.walkDecls("font-size", (declaration) => {
        fontSize = declaration.value;
      });
    });

    expect(fontSize).toBe("var(--font-text-size, 16px)");
  });
});
