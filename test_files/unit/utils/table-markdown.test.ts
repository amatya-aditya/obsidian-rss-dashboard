import { describe, expect, it } from "vitest";
import { articleHtmlToMarkdown } from "../../../src/utils/article-markdown";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// The block-link normalizer reads Obsidian's `doc.win` helpers, so the
// parsed-document polyfills must be installed first.
installObsidianDomPolyfills();

describe("articleHtmlToMarkdown tables (#1193)", () => {
  it("converts a thead/tbody table to one GFM pipe-table block", () => {
    const markdown = articleHtmlToMarkdown(
      "<table><thead><tr><th>Column A</th><th>Column B</th></tr></thead>" +
        "<tbody><tr><td>Alpha</td><td>1</td></tr><tr><td>Beta</td><td>2</td></tr></tbody></table>",
    );

    expect(markdown).toBe(
      "| Column A | Column B |\n" +
        "| --- | --- |\n" +
        "| Alpha | 1 |\n" +
        "| Beta | 2 |",
    );
    expect(markdown).not.toContain("\n\n");
  });

  it("uses the first row as the header when there is no thead", () => {
    const markdown = articleHtmlToMarkdown(
      "<table><tr><td>Name</td><td>Value</td></tr><tr><td>a</td><td>1</td></tr></table>",
    );

    expect(markdown).toBe(
      "| Name | Value |\n" + "| --- | --- |\n" + "| a | 1 |",
    );
  });

  it("maps header align attributes onto the separator row", () => {
    const markdown = articleHtmlToMarkdown(
      '<table><thead><tr><th align="left">L</th><th align="center">C</th>' +
        '<th align="right">R</th><th>N</th></tr></thead>' +
        "<tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></tbody></table>",
    );

    expect(markdown).toBe(
      "| L | C | R | N |\n" +
        "| :--- | :---: | ---: | --- |\n" +
        "| 1 | 2 | 3 | 4 |",
    );
  });

  it("puts a colspan cell's content in its first column and pads the row", () => {
    const markdown = articleHtmlToMarkdown(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead>" +
        '<tbody><tr><td colspan="3">wide</td></tr></tbody></table>',
    );

    expect(markdown).toBe(
      "| A | B |  |\n" + "| --- | --- | --- |\n" + "| wide |  |  |",
    );
  });

  it("widens the header to the widest row and keeps extra columns", () => {
    const markdown = articleHtmlToMarkdown(
      "<table><tbody><tr><td>only</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>",
    );

    expect(markdown).toBe("| only |  |\n" + "| --- | --- |\n" + "| a | b |");
  });

  it("collapses nested block content and escapes a literal pipe", () => {
    const markdown = articleHtmlToMarkdown(
      "<table><thead><tr><th>Item</th><th>Notes</th></tr></thead><tbody>" +
        "<tr><td><ul><li>one</li><li>two</li></ul></td><td><p>a | b</p></td></tr>" +
        "</tbody></table>",
    );

    expect(markdown).toBe(
      "| Item | Notes |\n" +
        "| --- | --- |\n" +
        "| *   one<br>*   two | a \\| b |",
    );
  });

  it("keeps inline Markdown inside a cell", () => {
    const markdown = articleHtmlToMarkdown(
      "<table><thead><tr><th>Link</th></tr></thead><tbody>" +
        '<tr><td><a href="https://example.com">Example</a></td></tr>' +
        "</tbody></table>",
    );

    expect(markdown).toBe(
      "| Link |\n" + "| --- |\n" + "| [Example](https://example.com) |",
    );
  });

  it("ignores rowspan, keeping the spanning cell only in its own row", () => {
    const markdown = articleHtmlToMarkdown(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>" +
        '<tr><td rowspan="2">spans</td><td>1</td></tr><tr><td>2</td></tr>' +
        "</tbody></table>",
    );

    expect(markdown).toBe(
      "| A | B |\n" + "| --- | --- |\n" + "| spans | 1 |\n" + "| 2 |  |",
    );
  });

  it("produces no output for a table with no rows", () => {
    expect(articleHtmlToMarkdown("<p>Before</p><table></table>")).toBe(
      "Before",
    );
  });

  it("produces no output for a table whose cells are all empty", () => {
    const markdown = articleHtmlToMarkdown(
      "<p>Before</p><table><thead><tr><th></th><th></th></tr></thead>" +
        "<tbody><tr><td></td><td></td></tr></tbody></table>",
    );

    expect(markdown).toBe("Before");
  });

  it("keeps a table as one block between surrounding paragraphs", () => {
    const markdown = articleHtmlToMarkdown(
      "<p>Before</p><table><tbody><tr><td>a</td></tr></tbody></table><p>After</p>",
    );

    expect(markdown).toBe("Before\n\n| a |\n| --- |\n\nAfter");
  });
});
