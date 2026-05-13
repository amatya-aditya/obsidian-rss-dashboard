import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeAndAppendHtml } from "../../../src/utils/safe-html";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("safe-html.sanitizeAndAppendHtml", () => {
  it("no-ops on empty/whitespace-only input (container remains unchanged)", () => {
    const container = document.body.createDiv();
    container.innerHTML = "<p>existing</p>";

    sanitizeAndAppendHtml(container, "   \n\t  ");

    expect(container.innerHTML).toBe("<p>existing</p>");
  });

  it("removes blocked tags entirely", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(
      container,
      `
        <p>ok</p>
        <script>alert(1)</script>
        <style>body{background:red}</style>
        <iframe src="https://evil.example"></iframe>
        <object data="x"></object>
        <embed src="x" />
        <link rel="stylesheet" href="x" />
        <meta charset="utf-8" />
        <base href="https://example.com/" />
      `,
    );

    expect(container.querySelector("p")?.textContent).toBe("ok");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("object")).toBeNull();
    expect(container.querySelector("embed")).toBeNull();
    expect(container.querySelector("link")).toBeNull();
    expect(container.querySelector("meta")).toBeNull();
    expect(container.querySelector("base")).toBeNull();
  });

  it("preserves allowed tags and text structure", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(
      container,
      `
        <p>Hello <strong>World</strong><br><em>Em</em></p>
        <ul><li>One</li><li><code>Two</code></li></ul>
        <pre><code>code</code></pre>
        <blockquote>Quote</blockquote>
      `,
    );

    expect(container.querySelector("p")).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("World");
    expect(container.querySelector("br")).toBeTruthy();
    expect(container.querySelector("em")?.textContent).toBe("Em");

    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelector("ul li code")?.textContent).toBe("Two");
    expect(container.querySelector("pre code")?.textContent).toBe("code");
    expect(container.querySelector("blockquote")?.textContent).toBe("Quote");
  });

  it("unwraps disallowed tags (children preserved, wrapper tags removed)", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(container, `<div><span>Text</span></div>`);

    expect(container.querySelector("div")).toBeNull();
    expect(container.querySelector("span")).toBeNull();
    expect(container.textContent).toBe("Text");
  });

  it("preserves non-blocked structural tags in rich mode", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(container, `<div class="outer"><span>Text</span></div>`, {
      mode: "rich",
    });

    expect(container.querySelector("div.outer")).toBeTruthy();
    expect(container.querySelector("span")?.textContent).toBe("Text");
  });

  it("strips event handler attributes and constrains safe links", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(
      container,
      `<a href=" https://example.com " onclick="evil()">Link</a>`,
    );

    const a = container.querySelector("a") as HTMLAnchorElement;
    expect(a).toBeTruthy();
    expect(a.getAttribute("onclick")).toBeNull();
    expect(a.getAttribute("href")).toBe("https://example.com");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("drops unsafe hrefs but preserves anchor text", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(
      container,
      `
        <p>
          <a href="javascript:alert(1)">js</a>
          <a href=" JAVASCRIPT:alert(1) ">js2</a>
          <a href="   ">empty</a>
          <a href="ftp://example.com/file">ftp</a>
        </p>
      `,
    );

    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors.map((a) => a.textContent)).toEqual([
      "js",
      "js2",
      "empty",
      "ftp",
    ]);

    anchors.forEach((a) => {
      expect(a.getAttribute("href")).toBeNull();
      expect(a.getAttribute("target")).toBeNull();
      expect(a.getAttribute("rel")).toBeNull();
    });
  });

  it("allows http/https/mailto links and applies target+rel", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(
      container,
      `
        <a href="http://example.com">http</a>
        <a href="https://example.com">https</a>
        <a href="mailto:test@example.com">mailto</a>
      `,
    );

    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors).toHaveLength(3);
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "http://example.com",
      "https://example.com",
      "mailto:test@example.com",
    ]);
    anchors.forEach((a) => {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    });
  });

  it("sanitizes mixed nested structures deterministically and ignores non-element nodes", () => {
    const container = document.body.createDiv();

    sanitizeAndAppendHtml(
      container,
      `
        <!-- comment -->
        <div>
          before
          <script>alert(1)</script>
          <p>para <span>inner <em>em</em></span></p>
          <iframe src="x"></iframe>
          after
        </div>
      `,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("div")).toBeNull();
    expect(container.querySelector("span")).toBeNull();
    expect(container.querySelector("p")).toBeTruthy();
    expect(container.querySelector("em")?.textContent).toBe("em");

    expect(normalizeWhitespace(container.textContent || "")).toBe(
      "before para inner em after",
    );

    const hasComment = Array.from(container.childNodes).some(
      (n) => n.nodeType === Node.COMMENT_NODE,
    );
    expect(hasComment).toBe(false);
  });
});
