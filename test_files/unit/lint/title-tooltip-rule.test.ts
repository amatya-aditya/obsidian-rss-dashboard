import { Linter } from "eslint";
import * as tsparser from "@typescript-eslint/parser";
import { describe, expect, it } from "vitest";
import config from "../../../eslint.config.mjs";

type RestrictedSyntaxOption = { selector: string; message: string };

// Reuse the project's own no-restricted-syntax selectors, so a selector edit
// that stops matching fails here rather than passing lint silently (#591).
function titleTooltipSelectors(): RestrictedSyntaxOption[] {
  const found: RestrictedSyntaxOption[] = [];
  for (const entry of config as Array<{
    files?: string[];
    rules?: Record<string, unknown>;
  }>) {
    const rule = entry.rules?.["no-restricted-syntax"];
    if (!Array.isArray(rule) || !entry.files?.includes("**/*.ts")) continue;
    for (const option of rule.slice(1) as RestrictedSyntaxOption[]) {
      if (option.message.includes("setTooltip")) found.push(option);
    }
  }
  return found;
}

function flaggedLines(source: string): number[] {
  const linter = new Linter();
  const messages = linter.verify(
    source,
    [
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tsparser as never },
        rules: {
          "no-restricted-syntax": ["error", ...titleTooltipSelectors()],
        },
      },
    ],
    { filename: "snippet.ts" },
  );
  const fatal = messages.filter((m) => m.fatal);
  expect(fatal).toEqual([]);
  return messages.map((m) => m.line);
}

describe("title tooltip lint rule", () => {
  it("loads the title tooltip selectors from the project config", () => {
    expect(titleTooltipSelectors().length).toBeGreaterThanOrEqual(5);
  });

  it("flags a title in a direct attr object", () => {
    expect(flaggedLines(`createDiv({ attr: { title: t } });`)).toEqual([1]);
  });

  it("flags a quoted 'title' key", () => {
    expect(flaggedLines(`createDiv({ attr: { "title": t } });`)).toEqual([1]);
  });

  it("flags a title in a conditional attr value (#587)", () => {
    const source = [
      "createDiv({",
      "  attr: cond ? { title: t } : undefined,",
      "});",
    ].join("\n");
    expect(flaggedLines(source)).toEqual([2]);
  });

  it("flags a title in a logical or nested conditional attr value", () => {
    expect(flaggedLines(`createDiv({ attr: cond && { title: t } });`)).toEqual([
      1,
    ]);
    expect(
      flaggedLines(`createDiv({ attr: a ? (b ? { title: t } : {}) : {} });`),
    ).toEqual([1]);
  });

  it("flags a title in the createEl options form", () => {
    expect(flaggedLines(`parent.createEl("div", { title: t });`)).toEqual([1]);
  });

  it("flags setAttribute and .title assignment", () => {
    expect(flaggedLines(`el.setAttribute("title", t);`)).toEqual([1]);
    expect(flaggedLines(`headerEl.title = t;`)).toEqual([1]);
  });

  it("does not flag a title key nested in an unrelated value of attr", () => {
    const source = `createDiv({ attr: { "data-x": JSON.stringify({ title: t }) } });`;
    expect(flaggedLines(source)).toEqual([]);
  });

  it("does not flag an aria-label attr", () => {
    expect(flaggedLines(`createDiv({ attr: { "aria-label": t } });`)).toEqual(
      [],
    );
  });

  it("does not flag a title key outside attr and create* options", () => {
    expect(flaggedLines(`const article = { title: t };`)).toEqual([]);
  });

  it("flags a variable passed as attr (blind spot, #591)", () => {
    const source = `const a = { title: t };
createDiv({ attr: a });`;
    expect(flaggedLines(source)).toEqual([2]);
  });

  it("flags a spread of a variable inside attr (blind spot, #591)", () => {
    expect(flaggedLines(`createDiv({ attr: { ...base } });`)).toEqual([1]);
  });

  it("does not flag a conditional spread inside attr", () => {
    const source = `createEl("video", { attr: { controls: "true", ...(c ? { poster: p } : {}) } });`;
    expect(flaggedLines(source)).toEqual([]);
  });
});
