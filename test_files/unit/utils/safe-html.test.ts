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

  it('regression: malformed attributes from Substack (src":"https:) do not throw and preserve content', () => {
    const container = createContainer();

    // Substack feed sometimes produces malformed attribute names like:
    // data-attrs="{&quot;src&quot;:&quot;https: which becomes src\":\"https: in rich mode
    const substackMalformedHtml = `
      <div class="image-wrapper">
        <img 
          src="https://example.com/image.jpg" 
          src":"https: 
          alt="Example"
          srcset="https://example.com/image.jpg 424w, https://example.com/image@2x.jpg 848w"
        />
        <p>Image caption text</p>
      </div>
    `;

    // Should NOT throw InvalidCharacterError or any exception
    expect(() => {
      sanitizeAndAppendHtml(container, substackMalformedHtml, { mode: "rich" });
    }).not.toThrow();

    // Verify valid content is preserved
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("https://example.com/image.jpg");
    expect(img?.getAttribute("alt")).toBe("Example");

    // Valid srcset should be preserved
    expect(img?.getAttribute("srcset")).toBeTruthy();

    // Malformed attribute should NOT be present
    expect(img?.getAttribute("src\":'https:")).toBeNull();
    expect(img?.getAttribute('src\\":\\"https:')).toBeNull();

    // Text content should still render
    expect(container.textContent).toContain("Image caption text");
  });

  it("regression: multiple malformed attributes do not truncate downstream DOM", () => {
    const container = createContainer();

    const malformedHtml = `
      <div>
        <img src="https://example.com/image.jpg" invalid-attr-1":"{data invalid-attr-2":"{more />
        <p>This text should render</p>
        <a href="https://example.com">This link should work</a>
      </div>
    `;

    expect(() => {
      sanitizeAndAppendHtml(container, malformedHtml, { mode: "rich" });
    }).not.toThrow();

    // Downstream elements should still be rendered despite malformed attrs above
    expect(container.querySelector("p")?.textContent).toBe(
      "This text should render",
    );
    expect(container.querySelector("a")?.textContent).toBe(
      "This link should work",
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com",
    );
  });

  it("regression: strict mode handles malformed attributes gracefully", () => {
    const container = createContainer();

    const malformedHtml = `
      <a href="https://example.com" bad-attr":"{data>Click me</a>
      <p>This paragraph should render</p>
    `;

    expect(() => {
      sanitizeAndAppendHtml(container, malformedHtml);
    }).not.toThrow();

    // Link should be preserved with valid href
    const anchor = container.querySelector("a");
    expect(anchor?.textContent).toBe("Click me");
    expect(anchor?.getAttribute("href")).toBe("https://example.com");

    // Paragraph should render
    expect(container.querySelector("p")?.textContent).toBe(
      "This paragraph should render",
    );
  });

  it("preserves valid attributes while silently dropping invalid attribute names", () => {
    const container = createContainer();

    // Mix of valid and invalid attributes
    const mixedHtml = `
      <img 
        src="https://example.com/valid.jpg"
        data-valid="valid-value"
        src":"https:
        class="image-class"
        invalid-attr-with-quotes":"{...}
        alt="Valid alt text"
      />
    `;

    expect(() => {
      sanitizeAndAppendHtml(container, mixedHtml, { mode: "rich" });
    }).not.toThrow();

    const img = container.querySelector("img");
    expect(img).toBeTruthy();

    // Valid attributes should be present
    expect(img?.getAttribute("src")).toBe("https://example.com/valid.jpg");
    expect(img?.getAttribute("alt")).toBe("Valid alt text");

    // Invalid attributes should not be present
    expect(img?.getAttribute("src\":'https:")).toBeNull();
    expect(img?.getAttribute("invalid-attr-with-quotes\":'{...}")).toBeNull();
  });

  it("normalizes Substack CDN image URLs before sanitizing src and srcset", () => {
    const container = createContainer();
    const decodedImageUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png";

    const html = `
      <picture>
        <source
          type="image/webp"
          srcset="https://substackcdn.com/image/fetch/$s_!hPfO!,w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png 424w, https://substackcdn.com/image/fetch/$s_!hPfO!,w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png 848w"
          sizes="100vw"
        >
        <img
          src="https://substackcdn.com/image/fetch/$s_!hPfO!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png"
          srcset="https://substackcdn.com/image/fetch/$s_!hPfO!,w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png 424w, https://substackcdn.com/image/fetch/$s_!hPfO!,w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png 848w"
          sizes="100vw"
          alt=""
        >
      </picture>
    `;

    sanitizeAndAppendHtml(container, html, { mode: "rich" });

    const source = container.querySelector("source");
    const img = container.querySelector("img");

    expect(source).toBeTruthy();
    expect(img).toBeTruthy();
    expect(source?.getAttribute("srcset") || "").toContain(decodedImageUrl);
    expect(source?.getAttribute("srcset") || "").not.toContain(
      "substackcdn.com/image/fetch/",
    );
    expect(img?.getAttribute("srcset") || "").toContain(decodedImageUrl);
    expect(img?.getAttribute("srcset") || "").not.toContain(
      "substackcdn.com/image/fetch/",
    );
    expect(img?.getAttribute("src")).toBe(decodedImageUrl);
  });
});
