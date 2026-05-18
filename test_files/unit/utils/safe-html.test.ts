import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeAndAppendHtml } from "../../../src/utils/safe-html";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type ObsidianBody = HTMLElement & {
  empty: () => void;
  createDiv: () => HTMLDivElement;
};

function getObsidianBody(): ObsidianBody {
  return document.body as ObsidianBody;
}

function createContainer(): HTMLDivElement {
  return getObsidianBody().createDiv();
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  installObsidianDomPolyfills();
  getObsidianBody().empty();
  vi.restoreAllMocks();
});

describe("safe-html.sanitizeAndAppendHtml", () => {
  it("no-ops on empty/whitespace-only input (container remains unchanged)", () => {
    const container = createContainer();
    const existing = document.createElement("p");
    existing.textContent = "existing";
    container.appendChild(existing);

    sanitizeAndAppendHtml(container, "   \n\t  ");

    expect(container.innerHTML).toBe("<p>existing</p>");
  });

  it("removes blocked tags entirely", () => {
    const container = createContainer();

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
    const container = createContainer();

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
    const container = createContainer();

    sanitizeAndAppendHtml(container, `<div><span>Text</span></div>`);

    expect(container.querySelector("div")).toBeNull();
    expect(container.querySelector("span")).toBeNull();
    expect(container.textContent).toBe("Text");
  });

  it("preserves non-blocked structural tags in rich mode", () => {
    const container = createContainer();

    sanitizeAndAppendHtml(
      container,
      `<div class="outer"><span>Text</span></div>`,
      {
        mode: "rich",
      },
    );

    expect(container.querySelector("div.outer")).toBeTruthy();
    expect(container.querySelector("span")?.textContent).toBe("Text");
  });

  it("strips event handler attributes and constrains safe links", () => {
    const container = createContainer();

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
    const container = createContainer();

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

    const anchors = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a"),
    );
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
    const container = createContainer();

    sanitizeAndAppendHtml(
      container,
      `
        <a href="http://example.com">http</a>
        <a href="https://example.com">https</a>
        <a href="mailto:test@example.com">mailto</a>
      `,
    );

    const anchors = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a"),
    );
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
    const container = createContainer();

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

  it("regression: rich mode with complex nested structures does not throw HierarchyRequestError", () => {
    const container = createContainer();

    // This HTML structure previously caused HierarchyRequestError when using
    // Obsidian's createEl() in rich mode sanitization. Now uses standard DOM APIs.
    const richHtml = `
      <article>
        <header>
          <h1>Article Title</h1>
          <p class="byline">By Author</p>
        </header>
        <div class="content">
          <p>First paragraph with <strong>bold</strong> and <em>italic</em>.</p>
          <figure>
            <img src="https://example.com/image.jpg" alt="Example image" />
            <figcaption>A caption</figcaption>
          </figure>
          <blockquote>
            <p>A quote with <a href="https://example.com">a link</a>.</p>
          </blockquote>
          <ul>
            <li>Item one</li>
            <li>Item two with <code>code</code></li>
            <li>Item three</li>
          </ul>
          <pre><code>const x = 42;</code></pre>
          <p>Final paragraph.</p>
        </div>
      </article>
    `;

    // Should not throw any error
    expect(() => {
      sanitizeAndAppendHtml(container, richHtml, { mode: "rich" });
    }).not.toThrow();

    // Verify output is as expected
    expect(container.querySelector("p")).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("blockquote")).toBeTruthy();
    expect(container.querySelector("ul")).toBeTruthy();
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(container.querySelector("code")?.textContent).toBe("code");

    // Verify unsafe content is removed while rich structural tags are preserved
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("article")).toBeTruthy();
    expect(container.querySelector("header")).toBeTruthy();
    expect(container.querySelector("figure")).toBeTruthy();
    expect(container.querySelector("figcaption")).toBeTruthy();

    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("https://example.com/image.jpg");

    // Verify content is preserved
    expect(container.textContent).toContain("Article Title");
    expect(container.textContent).toContain("First paragraph");
    expect(container.textContent).toContain("Final paragraph");
  });
});
