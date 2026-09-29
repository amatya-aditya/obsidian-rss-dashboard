import { beforeEach, describe, expect, it } from "vitest";
import { sanitizeAndAppendHtml } from "../../../src/utils/safe-html";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type ObsidianBody = HTMLElement & {
  empty: () => void;
  createDiv: () => HTMLDivElement;
};

function getObsidianBody(): ObsidianBody {
  return document.body as ObsidianBody;
}

function render(html: string, mode: "strict" | "rich"): string {
  const container = getObsidianBody().createDiv();
  sanitizeAndAppendHtml(container, html, { mode });
  return container.innerHTML;
}

function tagsOf(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.querySelectorAll("*")).map((el) =>
    el.tagName.toLowerCase(),
  );
}

beforeEach(() => {
  installObsidianDomPolyfills();
  getObsidianBody().empty();
});

describe("safe-html tag handling (characterization)", () => {
  describe("rich mode keeps common article tags", () => {
    const families: Record<string, string> = {
      headings: "<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6>",
      "block text":
        "<div><p>one<br>two<wbr>three</p><hr><span>inline</span></div>",
      links: '<p><a href="https://example.com/">link</a></p>',
      media:
        '<figure><picture><source srcset="https://example.com/a.webp 1x"><img src="https://example.com/a.png" alt="a"></picture><figcaption>cap</figcaption></figure>',
      lists:
        "<ul><li>a</li></ul><ol><li>b</li></ol><dl><dt>t</dt><dd>d</dd></dl>",
      quotes: "<blockquote><p>q</p></blockquote><pre>pre</pre><q>inline</q>",
      "code-like": "<code>c</code><kbd>k</kbd><samp>s</samp><var>v</var>",
      emphasis:
        "<em>e</em><strong>s</strong><b>b</b><i>i</i><u>u</u><s>s</s><del>d</del><ins>i</ins><mark>m</mark><small>sm</small>",
      "sub and sup": "<sub>2</sub><sup>3</sup><abbr>ab</abbr><cite>c</cite>",
      time: '<time datetime="2026-01-01">Jan</time>',
      details: "<details><summary>sum</summary>body</details>",
      tables:
        "<table><caption>c</caption><colgroup><col></colgroup><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot></table>",
      "audio and video":
        '<video src="https://example.com/v.mp4"><track src="https://example.com/t.vtt"></video><audio src="https://example.com/a.mp3"></audio>',
      "page sections":
        "<article><header><h1>t</h1></header><section><p>s</p></section><nav><a>n</a></nav><aside>a</aside><main>m</main><footer>f</footer></article>",
    };

    for (const [family, html] of Object.entries(families)) {
      it(`keeps ${family} markup unchanged`, () => {
        expect(tagsOf(render(html, "rich"))).toEqual(tagsOf(html));
      });
    }

    it("keeps math-container text with comparison operators", () => {
      expect(
        render(
          String.raw`<p><span class="math-container">$a<b$</span></p>`,
          "rich",
        ),
      ).toBe(
        String.raw`<p><span class="math-container">$a&lt;b$</span></p>`,
      );
    });

    it("keeps footnote and syntax-highlight markup", () => {
      const html =
        '<p>text<sup id="fnref1"><a href="https://example.com/#fn1">1</a></sup></p><pre><code class="hljs"><span class="hljs-keyword">const</span> x</code></pre>';
      expect(render(html, "rich")).toBe(
        '<p>text<sup id="fnref1"><a href="https://example.com/#fn1" target="_blank" rel="noopener noreferrer">1</a></sup></p><pre><code class="hljs"><span class="hljs-keyword">const</span> x</code></pre>',
      );
    });
  });

  describe("rich mode with tags outside the common set", () => {
    // Pinned as-is: rich mode keeps every tag that is not blocked; replaced by an allowlist
    // A leading paragraph keeps template and noscript out of the parsed head.
    const unusual: Record<string, [string, string]> = {
      font: ["font", "<font>text</font>"],
      center: ["center", "<center>text</center>"],
      marquee: ["marquee", "<marquee>text</marquee>"],
      form: ["form", "<form>text</form>"],
      input: ["input", "<input>"],
      button: ["button", "<button>text</button>"],
      svg: ["svg", "<svg><title>icon</title></svg>"],
      math: ["math", "<math><mi>x</mi></math>"],
      dialog: ["dialog", "<dialog>text</dialog>"],
      template: ["template", "<p>a</p><template><p>text</p></template>"],
      noscript: ["noscript", "<p>a</p><noscript><img src=x></noscript>"],
      "custom element": ["x-widget", "<x-widget>text</x-widget>"],
    };

    for (const [name, [tag, html]] of Object.entries(unusual)) {
      it(`currently keeps ${name} as an element`, () => {
        expect(tagsOf(render(html, "rich"))).toContain(tag);
      });
    }
  });

  describe("strict mode", () => {
    it("keeps its small set of tags", () => {
      const html =
        '<p>a<br>b</p><ul><li><strong>s</strong><em>e</em><code>c</code></li></ul><ol><li>o</li></ol><pre>p</pre><blockquote>q</blockquote><a href="https://example.com/">l</a>';
      expect(tagsOf(render(html, "strict"))).toEqual(tagsOf(html));
    });

    it("unwraps every other tag and keeps its text", () => {
      expect(
        render(
          "<div><font>a</font><center>b</center><marquee>c</marquee><form>d</form><button>e</button><h2>f</h2><table><tbody><tr><td>g</td></tr></tbody></table></div>",
          "strict",
        ),
      ).toBe("abcdefg");
    });

    it("unwraps custom elements, dialog, math, and svg text", () => {
      expect(
        render(
          "<x-widget>a</x-widget><dialog>b</dialog><math><mi>c</mi></math><p>d</p><noscript>e</noscript>",
          "strict",
        ),
      ).toBe("abc<p>d</p>e");
    });
  });

  describe("blocked tags", () => {
    const html =
      '<p>keep</p><script>drop1</script><style>drop2</style><iframe src="https://example.com/"></iframe><object data="https://example.com/"></object><embed src="https://example.com/"><link rel="x" href="https://example.com/"><meta name="x"><base href="https://example.com/">';

    for (const mode of ["rich", "strict"] as const) {
      it(`drops blocked tags and their content in ${mode} mode`, () => {
        expect(render(html, mode)).toBe("<p>keep</p>");
      });
    }

    it("drops a blocked tag nested inside kept markup", () => {
      expect(
        render(
          "<div><p>a<script>x</script><span>b<style>y</style></span></p></div>",
          "rich",
        ),
      ).toBe("<div><p>a<span>b</span></p></div>");
    });
  });
});
