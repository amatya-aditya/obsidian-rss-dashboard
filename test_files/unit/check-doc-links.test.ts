import { describe, expect, it } from "vitest";
import {
  extractLinks,
  isCheckablePath,
  isCheckableTarget,
  isEnforcedFile,
  resolveTarget,
  stripCode,
} from "../../scripts/check-doc-links.mjs";

describe("stripCode", () => {
  it("blanks fenced blocks so example links are not checked", () => {
    const markdown = "See [real](a.md)\n\n```\n[fake](nope.md)\n```\n";

    expect(stripCode(markdown)).toContain("[real](a.md)");
    expect(stripCode(markdown)).not.toContain("nope.md");
  });

  it("blanks inline code spans", () => {
    const markdown = "Append `[GH Issue #N](exact-url)` when applicable.";

    expect(stripCode(markdown)).not.toContain("exact-url");
  });
});

describe("isCheckableTarget", () => {
  it("accepts relative paths", () => {
    expect(isCheckableTarget("../README.md")).toBe(true);
    expect(isCheckableTarget("guide.md#section")).toBe(true);
  });

  it("skips URLs, anchors, and custom schemes", () => {
    expect(isCheckableTarget("https://example.com")).toBe(false);
    expect(isCheckableTarget("mailto:a@b.c")).toBe(false);
    expect(isCheckableTarget("#heading")).toBe(false);
    expect(isCheckableTarget("obsidian://rss-dashboard?action=seek")).toBe(
      false,
    );
    expect(isCheckableTarget("")).toBe(false);
  });
});

describe("isCheckablePath", () => {
  it("skips links into node_modules, which is not tracked", () => {
    expect(isCheckablePath("node_modules/obsidian/obsidian.d.ts")).toBe(false);
  });

  it("checks ordinary repository paths", () => {
    expect(isCheckablePath("src/main.ts")).toBe(true);
    expect(isCheckablePath("docs/README.md")).toBe(true);
  });
});

describe("isEnforcedFile", () => {
  it("does not enforce frozen historical records", () => {
    expect(isEnforcedFile("docs/archive/plans/v2.4.0/thing.md")).toBe(false);
  });

  it("enforces live documentation", () => {
    expect(isEnforcedFile("docs/development/architecture.md")).toBe(true);
    expect(isEnforcedFile("README.md")).toBe(true);
  });
});

describe("extractLinks", () => {
  it("reports the line each link sits on", () => {
    const markdown = "# Title\n\nIntro\n\nSee [guide](../guide.md).\n";
    const links = extractLinks(markdown);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ target: "../guide.md", line: 5 });
  });

  it("ignores links that are only examples in code", () => {
    const markdown = "```\n[x](missing.md)\n```\n";

    expect(extractLinks(markdown)).toEqual([]);
  });

  it("keeps a link carrying a title attribute", () => {
    const links = extractLinks('[x](./a.md "Title")');

    expect(links[0]?.target).toBe("./a.md");
  });
});

describe("resolveTarget", () => {
  it("resolves relative to the file holding the link", () => {
    const { resolved, inside } = resolveTarget(
      "/repo",
      "docs/releases/2.4.0.md",
      "../syncing.md",
    );

    expect(inside).toBe(true);
    expect(resolved.replace(/\\/g, "/")).toContain("/repo/docs/syncing.md");
  });

  it("flags a target that escapes the repository", () => {
    const { inside } = resolveTarget("/repo", "docs/a.md", "../../outside.md");

    expect(inside).toBe(false);
  });
});
