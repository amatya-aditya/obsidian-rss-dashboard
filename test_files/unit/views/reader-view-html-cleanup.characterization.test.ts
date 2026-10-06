// Characterization tests for the Reader HTML cleanup utilities extracted in
// #612 (part of #436). They pin current behavior, quirks included, before the
// remaining ReaderView delegates are removed in #621. The full-article tests
// still go through `displayItem` to pin the wiring of that path.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cleanup from "../../../src/utils/reader-html-cleanup";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS, FeedItem } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type ReaderViewTestHarness = {
  readingContainer: HTMLElement;
  currentDisplayTitle?: string;
  fetchFullArticleContent: ReturnType<typeof vi.fn>;
};

const parse = (html: string): Document =>
  new DOMParser().parseFromString(html, "text/html");
const bodyOf = (doc: Document): string => doc.body.innerHTML;
const spans = (n: number): string => "<span>s</span>".repeat(n);
/** A paragraph of exactly `n` characters (after whitespace collapsing). */
const para = (n: number): string => `<p>${"x".repeat(n)}</p>`;
const LONG = para(200);
const nav = (extra = ""): string =>
  `<nav${extra}><ul><li><a href="/">Home</a></li><li><a href="/s">Section</a></li></ul></nav>`;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Feed Item Title",
    link: "https://example.com/article",
    description: "",
    content: "",
    pubDate: "2024-03-05T10:20:30.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("Reader HTML cleanup utilities (characterization)", () => {
  let view: ReaderView;
  let viewHarness: ReaderViewTestHarness;

  beforeEach(async () => {
    activeDocument.body.empty();
    const app = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: { getAbstractFileByPath: vi.fn() },
    };
    view = new ReaderView(
      new MockLeaf(app) as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false, feeds: [] },
      { saveArticle: vi.fn(), checkSavedFileExists: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );
    view.contentEl = createDiv();
    viewHarness = view as unknown as ReaderViewTestHarness;
    await view.onOpen();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    activeDocument.body.empty();
  });

  describe("stripTopHeadlineFromDocument / stripTopHeadlineFromHtml", () => {
    it("removes the first h1 when it is near the top", () => {
      const doc = parse(`<h1>Title</h1><p>Body</p>`);
      cleanup.stripTopHeadlineFromDocument(doc);
      expect(bodyOf(doc)).toBe("<p>Body</p>");
    });

    it("removes an h1 at element index 9 but keeps one at index 10", () => {
      const at9 = parse(`${spans(9)}<h1>Title</h1>`);
      cleanup.stripTopHeadlineFromDocument(at9);
      expect(at9.body.querySelector("h1")).toBeNull();

      const at10 = parse(`${spans(10)}<h1>Title</h1>`);
      cleanup.stripTopHeadlineFromDocument(at10);
      expect(at10.body.querySelector("h1")).not.toBeNull();
    });

    it("counts elements in document order, so a nested h1 is measured by depth-first position", () => {
      const doc = parse(`<header><div><h1>Title</h1></div></header><p>B</p>`);
      cleanup.stripTopHeadlineFromDocument(doc);
      expect(bodyOf(doc)).toBe("<header><div></div></header><p>B</p>");
    });

    it("looks only at the first h1, so a later near-top h1 stays when the first is deep", () => {
      // The first h1 in document order is the only candidate; a second one is
      // never examined, so two early h1s lose only the first.
      const doc = parse(`<h1>One</h1><h1>Two</h1>`);
      cleanup.stripTopHeadlineFromDocument(doc);
      expect(bodyOf(doc)).toBe("<h1>Two</h1>");
    });

    it("leaves a document without an h1 untouched", () => {
      const doc = parse(`<p>Body</p>`);
      cleanup.stripTopHeadlineFromDocument(doc);
      expect(bodyOf(doc)).toBe("<p>Body</p>");
    });

    it("does nothing for a document with no body", () => {
      const xml = new DOMParser().parseFromString("<root/>", "text/xml");
      expect(xml.body).toBeNull();
      expect(() => cleanup.stripTopHeadlineFromDocument(xml)).not.toThrow();
    });

    it("stripTopHeadlineFromHtml returns the serialized body without the h1", () => {
      expect(
        cleanup.stripTopHeadlineFromHtml("<h1>T</h1><p>a &amp; b</p>"),
      ).toBe("<p>a &amp; b</p>");
    });

    it("stripTopHeadlineFromHtml returns empty input as is", () => {
      expect(cleanup.stripTopHeadlineFromHtml("")).toBe("");
    });

    it("stripTopHeadlineFromHtml normalizes markup it did not change", () => {
      expect(cleanup.stripTopHeadlineFromHtml("plain <b>text")).toBe(
        "plain <b>text</b>",
      );
    });

    it("stripTopHeadlineFromHtml returns the original string when parsing throws", () => {
      vi.stubGlobal(
        "DOMParser",
        class {
          parseFromString(): never {
            throw new Error("boom");
          }
        },
      );
      expect(cleanup.stripTopHeadlineFromHtml("<h1>T</h1>")).toBe("<h1>T</h1>");
    });
  });

  describe("stripNavigationChromeFromDocument / stripNavigationChromeFromHtml", () => {
    const strip = (html: string): string => {
      const doc = parse(html);
      cleanup.stripNavigationChromeFromDocument(doc);
      return bodyOf(doc);
    };

    it("removes a nav element near the top and keeps the article", () => {
      expect(strip(`${nav()}${LONG}`)).toBe(LONG);
    });

    it("removes any element with role=navigation, case-insensitively", () => {
      expect(strip(`<div role="Navigation"><span>x</span></div>${LONG}`)).toBe(
        LONG,
      );
    });

    it.each([
      ['aria-label="Site Breadcrumb"', "aria-label"],
      ['data-testid="my-BREADCRUMB-box"', "data-testid"],
      ['class="top breadcrumbs"', "class"],
      ['id="breadcrumb-trail"', "id"],
    ])("removes an element whose %s names a breadcrumb", (attrs) => {
      expect(strip(`<div ${attrs}>Home</div>${LONG}`)).toBe(LONG);
    });

    it("removes a body that is a single nav element", () => {
      expect(strip("<nav>x</nav>")).toBe("");
    });

    it.each([
      ["class", "BreadCrumb-Wrap"],
      ["id", "BREADCRUMBS"],
    ])("reads the %s attribute case-insensitively", (attr, value) => {
      expect(strip(`<div ${attr}="${value}">Home</div>${LONG}`)).toBe(LONG);
    });

    it("matches the breadcrumb word as a substring of a longer token", () => {
      expect(strip(`<div class="mybreadcrumbs-x">Home</div>${LONG}`)).toBe(
        LONG,
      );
    });

    it("removes a breadcrumb element that sits inside a kept container", () => {
      expect(
        strip(
          `<div><span class="breadcrumb">Home</span><p>kept</p></div>${LONG}`,
        ),
      ).toBe(`<div><p>kept</p></div>${LONG}`);
    });

    it("removes a header holding a nav and everything inside it", () => {
      expect(strip(`<header><h1>Headline</h1>${nav()}</header>${LONG}`)).toBe(
        LONG,
      );
    });

    it.each([
      ["role=navigation", `<header><div role="navigation">x</div></header>`],
      [
        "aria-label breadcrumb",
        `<header><div aria-label="BreadCrumb">x</div></header>`,
      ],
      [
        "data-testid breadcrumb",
        `<header><div data-testid="the-breadcrumb">x</div></header>`,
      ],
      ["own breadcrumb class", `<header class="breadcrumbs"><p>x</p></header>`],
      ["own role=navigation", `<header role="navigation"><p>x</p></header>`],
    ])(
      "removes a header with a navigation descendant signal: %s",
      (_n, html) => {
        expect(strip(`${html}${LONG}`)).toBe(LONG);
      },
    );

    it.each(["header", "footer", "aside"])(
      "removes a %s that is only a few links",
      (tag) => {
        const links = `<a href="/1">One</a><a href="/2">Two</a><a href="/3">Three</a>`;
        expect(strip(`<${tag}>${links}</${tag}>${LONG}`)).toBe(LONG);
      },
    );

    it("keeps a header with only two links", () => {
      const html = `<header><a href="/1">One</a><a href="/2">Two</a></header>${LONG}`;
      expect(strip(html)).toBe(html);
    });

    it("keeps a header with three links and a paragraph", () => {
      const html = `<header><a href="/1">One</a><a href="/2">Two</a><a href="/3">Three</a><p>Intro</p></header>${LONG}`;
      expect(strip(html)).toBe(html);
    });

    it("removes a link-only header at 199 characters but keeps it at 200", () => {
      const links = (last: number): string =>
        `<a href="/1">${"a".repeat(100)}</a><a href="/2">${"b".repeat(60)}</a><a href="/3">${"c".repeat(last)}</a>`;
      expect(strip(`<header>${links(39)}</header>${LONG}`)).toBe(LONG);
      const kept = `<header>${links(40)}</header>${LONG}`;
      expect(strip(kept)).toBe(kept);
    });

    it("keeps an aside that is a plain paragraph", () => {
      const html = `<aside><p>Related</p></aside>${LONG}`;
      expect(strip(html)).toBe(html);
    });

    it("never removes a plain div of links", () => {
      const html = `<div><a href="/1">One</a><a href="/2">Two</a><a href="/3">Three</a></div>${LONG}`;
      expect(strip(html)).toBe(html);
    });

    describe("breadcrumb lists", () => {
      const li = (text: string, link = true): string =>
        link ? `<li><a href="/x">${text}</a></li>` : `<li>${text}</li>`;

      it.each(["ul", "ol"])("removes a short %s of links", (tag) => {
        expect(
          strip(`<${tag}>${li("Home")}${li("News")}</${tag}>${LONG}`),
        ).toBe(LONG);
      });

      it("removes a list of 2 items and of 10 items, but not 1 or 11", () => {
        const list = (n: number): string =>
          `<ul>${Array.from({ length: n }, () => li("a")).join("")}</ul>`;
        expect(strip(`${list(2)}${LONG}`)).toBe(LONG);
        expect(strip(`${list(10)}${LONG}`)).toBe(LONG);
        expect(strip(`${list(1)}${LONG}`)).toBe(`${list(1)}${LONG}`);
        expect(strip(`${list(11)}${LONG}`)).toBe(`${list(11)}${LONG}`);
      });

      it("counts only li children toward the item limits", () => {
        expect(
          strip(`<ol>${li("a")}${li("b")}<div>skip me</div></ol>${LONG}`),
        ).toBe(LONG);
      });

      it("removes a list at 140 characters of text but keeps it at 141", () => {
        const four = (last: number): string =>
          `<ul>${li("a".repeat(35))}${li("b".repeat(35))}${li("c".repeat(35))}${li("d".repeat(last))}</ul>`;
        expect(strip(`${four(35)}${LONG}`)).toBe(LONG);
        expect(strip(`${four(36)}${LONG}`)).toBe(`${four(36)}${LONG}`);
      });

      it("accepts a link of 40 characters and rejects one of 41", () => {
        const two = (len: number): string =>
          `<ul>${li("a".repeat(len))}${li("b".repeat(len))}</ul>`;
        expect(strip(`${two(40)}${LONG}`)).toBe(LONG);
        expect(strip(`${two(41)}${LONG}`)).toBe(`${two(41)}${LONG}`);
      });

      it("needs at least 70% of the items to be single short links", () => {
        const seven = `${li("a").repeat(7)}${li("b", false).repeat(3)}`;
        expect(strip(`<ul>${seven}</ul>${LONG}`)).toBe(LONG);
        const twoOfThree = `<ul>${li("a")}${li("b")}${li("c", false)}</ul>${LONG}`;
        expect(strip(twoOfThree)).toBe(twoOfThree);
      });

      it("does not count a list item with an empty link, a non-link child, or two children", () => {
        const empty = `<ul><li><a href="/x"></a></li><li><a href="/x"></a></li></ul>${LONG}`;
        expect(strip(empty)).toBe(empty);
        const span = `<ul><li><span>a</span></li><li><span>b</span></li></ul>${LONG}`;
        expect(strip(span)).toBe(span);
        const two = `<ul><li><a href="/x">a</a><b>x</b></li><li><a href="/x">b</a><b>y</b></li></ul>${LONG}`;
        expect(strip(two)).toBe(two);
      });

      it("does not treat a div shaped like a list as a breadcrumb", () => {
        const html = `<div>${li("a")}${li("b")}</div>${LONG}`;
        expect(strip(html)).toBe(html);
      });
    });

    describe("index cutoff", () => {
      it("removes a nav at element index 29 but keeps one at index 30", () => {
        const at29 = strip(`${spans(29)}<nav>x</nav>`);
        expect(at29).not.toContain("<nav");
        const at30 = strip(`${spans(30)}<nav>x</nav>`);
        expect(at30).toContain("<nav");
      });

      it("moves the cutoff to just before the first substantial paragraph", () => {
        // 40 spans, nav at index 40, paragraph at index 41. Substantial text
        // (>= 120) lifts the cutoff to 40, so the nav goes; 119 does not.
        expect(strip(`${spans(40)}<nav>x</nav>${para(120)}`)).not.toContain(
          "<nav",
        );
        expect(strip(`${spans(40)}<nav>x</nav>${para(119)}`)).toContain("<nav");
      });

      it("measures substantial text after collapsing whitespace", () => {
        const padded = `<p>${"x".repeat(60)}   \n   ${"y".repeat(58)}</p>`;
        expect(strip(`${spans(40)}<nav>x</nav>${padded}`)).toContain("<nav");
        const enough = `<p>${"x".repeat(60)}   \n   ${"y".repeat(59)}</p>`;
        expect(strip(`${spans(40)}<nav>x</nav>${enough}`)).not.toContain(
          "<nav",
        );
      });

      it("counts only p elements as substantial", () => {
        const html = `${spans(40)}<nav>x</nav><div>${"x".repeat(200)}</div>`;
        expect(strip(html)).toContain("<nav");
      });

      it("never lowers the cutoff below 29 when the paragraph comes early", () => {
        // Paragraph at index 5; the cutoff stays at 29, so a nav after the
        // paragraph at index 29 still goes and one at index 30 stays.
        const at29 = strip(`${LONG}${spans(28)}<nav>x</nav>`);
        expect(at29).not.toContain("<nav");
        const at30 = strip(`${LONG}${spans(29)}<nav>x</nav>`);
        expect(at30).toContain("<nav");
      });

      it("keeps a nav that follows a late substantial paragraph", () => {
        const html = `${spans(40)}${para(200)}<nav>x</nav>`;
        expect(strip(html)).toContain("<nav");
      });

      it("keeps the substantial paragraph itself even when it carries a chrome signal", () => {
        const html = `${spans(40)}<p class="breadcrumb">${"x".repeat(200)}</p>`;
        expect(strip(html)).toBe(html);
      });

      it("trims the paragraph text before measuring it", () => {
        const padded = `<p>  ${"x".repeat(119)}  </p>`;
        expect(strip(`${spans(40)}<nav>x</nav>${padded}`)).toContain("<nav");
      });
    });

    it("leaves an empty body and a body-less document alone", () => {
      expect(strip("")).toBe("");
      const xml = new DOMParser().parseFromString("<root/>", "text/xml");
      expect(() =>
        cleanup.stripNavigationChromeFromDocument(xml),
      ).not.toThrow();
    });

    it("leaves a document with no chrome untouched", () => {
      expect(strip(`<p>One</p>${LONG}`)).toBe(`<p>One</p>${LONG}`);
    });

    it("stripNavigationChromeFromHtml returns the serialized body without the chrome", () => {
      expect(
        cleanup.stripNavigationChromeFromHtml(`${nav()}<p>a &amp; b</p>`),
      ).toBe("<p>a &amp; b</p>");
    });

    it("stripNavigationChromeFromHtml returns empty input as is", () => {
      expect(cleanup.stripNavigationChromeFromHtml("")).toBe("");
    });

    it("stripNavigationChromeFromHtml returns the original string when parsing throws", () => {
      vi.stubGlobal(
        "DOMParser",
        class {
          parseFromString(): never {
            throw new Error("boom");
          }
        },
      );
      expect(cleanup.stripNavigationChromeFromHtml("<nav>x</nav>")).toBe(
        "<nav>x</nav>",
      );
    });
  });

  describe("extractDisplayTitleFromHtml / isAcceptableDisplayTitle", () => {
    const title = (text: string): string | null =>
      cleanup.extractDisplayTitleFromHtml(`<h1>${text}</h1><p>body</p>`);

    it("returns the first h1 text with whitespace collapsed", () => {
      expect(title("  A   good\n headline  here ")).toBe(
        "A good headline here",
      );
    });

    it("reads text through nested elements", () => {
      expect(title("<span>Alpha</span> beta <em>gamma</em>")).toBe(
        "Alpha beta gamma",
      );
    });

    it("returns null for empty html and for html with no h1", () => {
      expect(cleanup.extractDisplayTitleFromHtml("")).toBeNull();
      expect(
        cleanup.extractDisplayTitleFromHtml("<p>No heading in here</p>"),
      ).toBeNull();
    });

    it("accepts an h1 at element index 9 and rejects one at index 10", () => {
      const html = (n: number): string =>
        `${spans(n)}<h1>A perfectly fine headline</h1>`;
      expect(cleanup.extractDisplayTitleFromHtml(html(9))).toBe(
        "A perfectly fine headline",
      );
      expect(cleanup.extractDisplayTitleFromHtml(html(10))).toBeNull();
    });

    it("judges only the first h1, even when a later one would pass", () => {
      expect(
        cleanup.extractDisplayTitleFromHtml(
          "<h1>Short</h1><h1>A perfectly fine headline</h1>",
        ),
      ).toBeNull();
    });

    it("returns null when parsing throws", () => {
      vi.stubGlobal(
        "DOMParser",
        class {
          parseFromString(): never {
            throw new Error("boom");
          }
        },
      );
      expect(title("A perfectly fine headline")).toBeNull();
    });

    it("accepts a title of 10 characters and rejects one of 9", () => {
      expect(title("a b cdefgh")).toBe("a b cdefgh");
      expect(title("a b cdefg")).toBeNull();
    });

    it("accepts a title of 200 characters and rejects one of 201", () => {
      const of = (n: number): string => `aaa bbb ${"c".repeat(n - 8)}`;
      expect(title(of(200))).toBe(of(200));
      expect(title(of(201))).toBeNull();
    });

    it("needs at least three words", () => {
      expect(title("abcdefghij klmnopqrs")).toBeNull();
      expect(title("abcdefg hij klmnopq")).toBe("abcdefg hij klmnopq");
    });

    it.each([
      "sign in",
      "log in",
      "login",
      "subscribe",
      "advertisement",
      "sponsored",
    ])("rejects a title containing %s, in any case", (phrase) => {
      expect(title(`Please ${phrase.toUpperCase()} to read more`)).toBeNull();
    });

    it("rejects boilerplate words found inside longer words", () => {
      // Plain substring test: "subscribers" contains "subscribe".
      expect(title("Why subscribers are leaving in droves")).toBeNull();
    });

    it("isAcceptableDisplayTitle normalizes whitespace before measuring", () => {
      expect(cleanup.isAcceptableDisplayTitle("  a   b \n cdefgh  ")).toBe(
        true,
      );
      expect(cleanup.isAcceptableDisplayTitle("")).toBe(false);
      expect(cleanup.isAcceptableDisplayTitle("   \n ")).toBe(false);
    });
  });

  describe("normalizeComparableText", () => {
    it("strips markup, folds case, collapses whitespace and trims", () => {
      expect(
        cleanup.normalizeComparableText("  <p>Hello\n\n  <b>WORLD</b></p>  "),
      ).toBe("hello world");
    });

    it("turns curly single and double quotes into straight ones", () => {
      expect(cleanup.normalizeComparableText("‘a’ “b”")).toBe("'a' \"b\"");
    });

    it("decodes entities, and treats a non-breaking space as whitespace", () => {
      expect(cleanup.normalizeComparableText("a&nbsp;&amp;&nbsp;b")).toBe(
        "a & b",
      );
    });

    it("leaves other punctuation, such as dashes and ellipses, as it is", () => {
      expect(cleanup.normalizeComparableText("a – b…")).toBe("a – b…");
    });

    it("returns an empty string for empty input and for tags without text", () => {
      expect(cleanup.normalizeComparableText("")).toBe("");
      expect(cleanup.normalizeComparableText("<p> </p><br>")).toBe("");
    });

    it("counts script text as text", () => {
      expect(
        cleanup.normalizeComparableText("<p>a</p><script>var z</script>"),
      ).toBe("avar z");
    });
  });

  describe("stripDuplicateLeadContentFromDocument", () => {
    const strip = (html: string, description?: string): string => {
      const doc = parse(html);
      cleanup.stripDuplicateLeadContentFromDocument(doc, description);
      return bodyOf(doc);
    };

    it.each([undefined, "", "   ", "<br>", "<p> </p>"])(
      "changes nothing for the empty description %j",
      (description) => {
        const html = `<p>Byline</p><p>Desc</p>${LONG}`;
        expect(strip(html, description)).toBe(html);
      },
    );

    it("does nothing for a body-less document", () => {
      const xml = new DOMParser().parseFromString("<root/>", "text/xml");
      expect(() =>
        cleanup.stripDuplicateLeadContentFromDocument(xml, "Desc"),
      ).not.toThrow();
    });

    describe("direct-child path", () => {
      it("removes a block equal to the description when it precedes the first substantial block", () => {
        expect(
          strip(`<p>Some description text</p>${LONG}`, "Some description text"),
        ).toBe(LONG);
      });

      it("compares markup, case, quotes and spacing loosely", () => {
        expect(
          strip(
            `<p>It’s   a  <b>Description</b></p>${LONG}`,
            `<div>it's A description</div>`,
          ),
        ).toBe(LONG);
      });

      it("also removes short lead-in blocks directly above the duplicate", () => {
        expect(
          strip(`<p>By Jane</p><p>Posted today</p><p>Desc</p>${LONG}`, "Desc"),
        ).toBe(LONG);
      });

      it("keeps blocks between the duplicate and the first substantial block", () => {
        expect(strip(`<p>Desc</p><p>after</p>${LONG}`, "Desc")).toBe(
          `<p>after</p>${LONG}`,
        );
      });

      it("removes lead media blocks above the duplicate, past short lead-ins", () => {
        expect(
          strip(
            `<figure><img src="a.jpg"></figure><p>Credit</p><img src="b.jpg"><p>Desc</p>${LONG}`,
            "Desc",
          ),
        ).toBe(LONG);
      });

      it("stops walking up at the first block that is neither a short lead-in nor media", () => {
        const keep = para(90);
        expect(strip(`${keep}<p>Byline</p><p>Desc</p>${LONG}`, "Desc")).toBe(
          `${keep}${LONG}`,
        );
      });

      it("stops walking up at an empty block", () => {
        expect(
          strip(`<p>Byline</p><div></div><p>Desc</p>${LONG}`, "Desc"),
        ).toBe(`<p>Byline</p><div></div>${LONG}`);
      });

      it("treats a block of 79 characters and 12 words as a short lead-in, but not 80 characters or 13 words", () => {
        const words12 = Array.from({ length: 12 }, () => "w").join(" ");
        const words13 = `${words12} w`;
        const c79 = "y".repeat(79);
        const c80 = "y".repeat(80);
        expect(strip(`<p>${words12}</p><p>Desc</p>${LONG}`, "Desc")).toBe(LONG);
        expect(strip(`<p>${c79}</p><p>Desc</p>${LONG}`, "Desc")).toBe(LONG);
        expect(strip(`<p>${words13}</p><p>Desc</p>${LONG}`, "Desc")).toBe(
          `<p>${words13}</p>${LONG}`,
        );
        expect(strip(`<p>${c80}</p><p>Desc</p>${LONG}`, "Desc")).toBe(
          `<p>${c80}</p>${LONG}`,
        );
      });

      it("treats a block with an image and 60 characters of text as a short lead-in", () => {
        const text = "t".repeat(60);
        expect(
          strip(
            `<div><img src="a.jpg">${text}</div><p>Desc</p>${LONG}`,
            "Desc",
          ),
        ).toBe(LONG);
      });

      it("keeps a block holding a formula image above the duplicate", () => {
        const formula = `<p><img class="latex" src="f.png"></p>`;
        expect(strip(`${formula}<p>Desc</p>${LONG}`, "Desc")).toBe(
          `${formula}${LONG}`,
        );
      });

      it("only matches a duplicate before the first substantial block", () => {
        const html = `${LONG}<p>Desc</p>`;
        expect(strip(html, "Desc")).toBe(html);
      });

      it("is skipped when the first block is substantial", () => {
        const html = `${LONG}${LONG}`;
        expect(strip(html, "x".repeat(200))).toBe(html);
      });

      it("is skipped when no block is substantial, so the description stays", () => {
        const html = `<p>Byline</p><p>Desc</p>`;
        expect(strip(html, "Desc")).toBe(html);
      });

      it("treats 119 characters as not substantial and 120 as substantial", () => {
        expect(strip(`<p>Desc</p>${para(119)}`, "Desc")).toBe(
          `<p>Desc</p>${para(119)}`,
        );
        expect(strip(`<p>Desc</p>${para(120)}`, "Desc")).toBe(para(120));
      });

      it("removes only the first matching duplicate", () => {
        expect(strip(`<p>Desc</p><p>Desc</p>${LONG}`, "Desc")).toBe(
          `<p>Desc</p>${LONG}`,
        );
      });

      it("returns after the direct-child hit without touching a header copy", () => {
        const html = `<p>Desc</p><header><p>Desc</p></header>${LONG}`;
        expect(strip(html, "Desc")).toBe(`<header><p>Desc</p></header>${LONG}`);
      });
    });

    describe("prefix match (#247 slice 2)", () => {
      const DESC =
        "The council voted on Tuesday to approve the new harbor budget";

      it("removes a lead block that is the start of a longer description", () => {
        expect(
          strip(
            `<p>${DESC}</p>${LONG}`,
            `${DESC} after months of debate, officials said.`,
          ),
        ).toBe(LONG);
      });

      it("removes a lead block that starts with a truncated description", () => {
        expect(
          strip(`<p>${DESC} after months of debate.</p>${LONG}`, `${DESC}…`),
        ).toBe(LONG);
      });

      it("keeps a lead block whose match with the description is under 30 characters", () => {
        const html = `<p>Short desc and more</p>${LONG}`;
        expect(strip(html, "Short desc")).toBe(html);
      });

      it("keeps a lightly reworded lead block", () => {
        const html = `<p>The council voted on Tuesday to quickly approve the new harbor budget</p>${LONG}`;
        expect(strip(html, DESC)).toBe(html);
      });

      it("removes a header copy that starts with the description", () => {
        const html = `<div><header><p>${DESC} after months.</p></header>${LONG}</div>`;
        expect(strip(html, DESC)).toBe(`<div><header></header>${LONG}</div>`);
      });
    });

    describe("header-descendant path", () => {
      it("removes header p and div descendants equal to the description", () => {
        const html = `<div><header><h2>Title</h2><p>Desc</p><div>Desc</div></header>${LONG}</div>`;
        expect(strip(html, "Desc")).toBe(
          `<div><header><h2>Title</h2></header>${LONG}</div>`,
        );
      });

      it("removes every matching header descendant, not only the first", () => {
        const html = `<div><header><p>Desc</p></header><header><p>Desc</p></header>${LONG}</div>`;
        expect(strip(html, "Desc")).toBe(
          `<div><header></header><header></header>${LONG}</div>`,
        );
      });

      it("leaves a matching paragraph outside any header", () => {
        const html = `<div><p>Desc</p>${LONG}</div>`;
        expect(strip(html, "Desc")).toBe(html);
      });

      it("does not remove the header itself", () => {
        const html = `<div><header>Desc</header>${LONG}</div>`;
        expect(strip(html, "Desc")).toBe(html);
      });

      it("runs when the direct-child path finds no duplicate", () => {
        const html = `<p>other</p>${LONG}<header><p>Desc</p></header>`;
        expect(strip(html, "Desc")).toBe(
          `<p>other</p>${LONG}<header></header>`,
        );
      });
    });
  });

  describe("stripLeadMediaBeforeContent", () => {
    const strip = (html: string): string => {
      const doc = parse(html);
      cleanup.stripLeadMediaBeforeContent(doc);
      return bodyOf(doc);
    };

    it("removes every media block before the first substantial block, not only a leading run", () => {
      expect(
        strip(
          `<figure><img src="a.jpg"></figure><p>kept</p><picture><img src="b.jpg"></picture><img src="c.jpg">${LONG}`,
        ),
      ).toBe(`<p>kept</p>${LONG}`);
    });

    it("keeps media after the first substantial block", () => {
      const html = `${para(200)}<figure><img src="a.jpg"></figure>`;
      expect(strip(html)).toBe(html);
    });

    it("does nothing when the first block is itself substantial", () => {
      const html = `${LONG}<img src="a.jpg">${LONG}`;
      expect(strip(html)).toBe(html);
    });

    it("does nothing when there is no substantial block", () => {
      const html = `<img src="a.jpg"><p>short</p>`;
      expect(strip(html)).toBe(html);
    });

    it("treats a wrapper with an image and under 40 characters of text as media", () => {
      const media = (n: number): string =>
        `<div><img src="a.jpg">${"t".repeat(n)}</div>`;
      expect(strip(`${media(39)}${LONG}`)).toBe(LONG);
      expect(strip(`${media(40)}${LONG}`)).toBe(`${media(40)}${LONG}`);
    });

    it("treats a linked image as media", () => {
      expect(strip(`<a href="/x"><img src="a.jpg"></a>${LONG}`)).toBe(LONG);
    });

    it("keeps a block with a formula image", () => {
      const html = `<figure><img class="latex" src="f.png"></figure>${LONG}`;
      expect(strip(html)).toBe(html);
      const php = `<img src="https://x.test/latex.php?latex=x%5E2">${LONG}`;
      expect(strip(php)).toBe(php);
    });

    it("does not treat video or iframe blocks as media", () => {
      const html = `<video src="v.mp4"></video><iframe src="/f"></iframe>${LONG}`;
      expect(strip(html)).toBe(html);
    });

    it("does nothing for a body-less document", () => {
      const xml = new DOMParser().parseFromString("<root/>", "text/xml");
      expect(() => cleanup.stripLeadMediaBeforeContent(xml)).not.toThrow();
    });
  });

  describe("block helpers", () => {
    const block = (html: string): HTMLElement => {
      const el = parse(html).body.firstElementChild;
      if (!el) throw new Error("fixture has no element");
      return el as HTMLElement;
    };

    it("getNormalizedBlockText normalizes the block's text, ignoring markup", () => {
      expect(
        cleanup.getNormalizedBlockText(block("<div> A <b>B</b>’s </div>")),
      ).toBe("a b's");
    });

    it("getNormalizedBlockText gives an empty string for a block with no text", () => {
      expect(cleanup.getNormalizedBlockText(block("<div></div>"))).toBe("");
    });

    it("isLeadMediaBlock is true for img, figure and picture elements", () => {
      expect(cleanup.isLeadMediaBlock(block('<img src="a.jpg">'))).toBe(true);
      expect(cleanup.isLeadMediaBlock(block("<figure></figure>"))).toBe(true);
      expect(cleanup.isLeadMediaBlock(block("<picture></picture>"))).toBe(true);
    });

    it("isLeadMediaBlock is true for a caption-less wrapper and false once the text reaches 40", () => {
      expect(
        cleanup.isLeadMediaBlock(block('<div><img src="a.jpg">cap</div>')),
      ).toBe(true);
      expect(
        cleanup.isLeadMediaBlock(
          block(`<div><img src="a.jpg">${"t".repeat(40)}</div>`),
        ),
      ).toBe(false);
      expect(cleanup.isLeadMediaBlock(block("<p>no media</p>"))).toBe(false);
    });

    it("isLeadMediaBlock is false for a formula image, bare or wrapped", () => {
      expect(
        cleanup.isLeadMediaBlock(block('<img class="LaTeX" src="f.png">')),
      ).toBe(false);
      expect(
        cleanup.isLeadMediaBlock(
          block('<p><img class="latex" src="f.png"></p>'),
        ),
      ).toBe(false);
    });

    it("isShortLeadInBlock requires text of under 80 characters and at most 12 words", () => {
      expect(cleanup.isShortLeadInBlock(block("<p>By Jane</p>"))).toBe(true);
      expect(cleanup.isShortLeadInBlock(block("<p></p>"))).toBe(false);
      expect(
        cleanup.isShortLeadInBlock(block(`<p>${"y".repeat(80)}</p>`)),
      ).toBe(false);
      expect(cleanup.isShortLeadInBlock(block('<img src="a.jpg">'))).toBe(
        false,
      );
      expect(
        cleanup.isShortLeadInBlock(
          block('<p><img class="latex" src="f.png">x</p>'),
        ),
      ).toBe(false);
    });
  });

  describe("removeLeadImageElement", () => {
    const run = (html: string): string => {
      const doc = parse(html);
      const img = doc.body.querySelector("img");
      if (!img) throw new Error("fixture has no img");
      cleanup.removeLeadImageElement(img);
      return bodyOf(doc);
    };

    it("removes the closest figure", () => {
      expect(run(`<figure><img src="a.jpg"></figure><p>t</p>`)).toBe(
        "<p>t</p>",
      );
    });

    it("keeps a figure caption when removing its image", () => {
      expect(
        run(
          `<figure><img src="a.jpg"><figcaption>caption</figcaption></figure>`,
        ),
      ).toBe("<figure><figcaption>caption</figcaption></figure>");
    });

    it("removes the closest picture, leaving an outer figure", () => {
      expect(run(`<figure><picture><img src="a.jpg"></picture></figure>`)).toBe(
        "<figure></figure>",
      );
    });

    it("removes a wrapping link, leaving its parent", () => {
      expect(run(`<p><a href="/x"><img src="a.jpg"></a>text</p>`)).toBe(
        "<p>text</p>",
      );
    });

    // BUG: pinned, see #629
    it("keeps story text in a link when removing its lead image", () => {
      expect(
        run(`<a href="/x"><div><img src="a.jpg"><p>story</p></div></a>`),
      ).toBe(`<a href="/x"><div><p>story</p></div></a>`);
    });

    it("keeps another image in a link when removing the lead image", () => {
      expect(run(`<a href="/x"><img src="a.jpg"><img src="b.jpg"></a>`)).toBe(
        `<a href="/x"><img src="b.jpg"></a>`,
      );
    });

    it("removes just the image when it has no figure, picture or link around it", () => {
      expect(run(`<div><img src="a.jpg">text</div>`)).toBe("<div>text</div>");
    });
  });

  describe("stripSkipLinksFromDocument", () => {
    const strip = (html: string): string => {
      const doc = parse(html);
      cleanup.stripSkipLinksFromDocument(doc);
      return bodyOf(doc);
    };

    it.each([
      ['<a href="/x">Skip to content</a>', "text: skip to content"],
      ['<a href="/x">SKIP TO MAIN CONTENT</a>', "text: skip to main content"],
      [
        '<a href="/x">please  skip   to content now</a>',
        "text inside a sentence",
      ],
      ['<a href="#main">Skip to navigation</a>', "# href and text start"],
      ['<a href=" #main ">Skip to navigation</a>', "padded # href"],
      ['<a href="#x" class="Skip-Link">Go</a>', "# href and skip class"],
      ['<a href="#x" id="skip-main">Go</a>', "# href and skip id"],
      ['<a href="#x" aria-label="SKIP">Go</a>', "# href and skip aria-label"],
      [
        '<a href="/x" aria-label="Skip to content area">Go</a>',
        "content aria-label that also says skip",
      ],
      [
        '<a class="skip" aria-label="content">Go</a>',
        "no href, content aria-label and skip class",
      ],
    ])("removes %s (%s)", (html) => {
      expect(strip(`${html}<p>kept</p>`)).toBe("<p>kept</p>");
    });

    it.each([
      [
        '<a href="https://x.test/">Skip to navigation</a>',
        "external href without content aria",
      ],
      ['<a href="#top">Back to top</a>', "# href without any skip signal"],
      ['<a href="#a">Jump</a>', "# href, no skip signal"],
      [
        '<a href="/x" class="skip">Go</a>',
        "skip class but no # href or content aria",
      ],
      [
        '<a href="/x" aria-label="content">Go</a>',
        "content aria without a skip signal",
      ],
      [
        '<a href="/x">Skip to the main content</a>',
        "wording the phrases do not cover",
      ],
    ])("keeps %s (%s)", (html) => {
      const full = `${html}<p>kept</p>`;
      expect(strip(full)).toBe(full);
    });

    it("removes only the anchor and leaves its wrapper", () => {
      expect(
        strip(`<div class="wrap"><a href="/x">Skip to content</a></div>`),
      ).toBe(`<div class="wrap"></div>`);
    });

    it("removes every skip link, wherever it sits", () => {
      expect(
        strip(
          `<a href="/x">Skip to content</a><p>kept</p><section><a href="/y">Skip to main content</a></section>`,
        ),
      ).toBe("<p>kept</p><section></section>");
    });

    it("does nothing for a body-less document", () => {
      const xml = new DOMParser().parseFromString("<root/>", "text/xml");
      expect(() => cleanup.stripSkipLinksFromDocument(xml)).not.toThrow();
    });
  });

  describe("findFirstSubstantialParagraph / isBeforeBoundary", () => {
    it("returns the first p of at least 120 characters after collapsing whitespace", () => {
      const doc = parse(
        `<p>short</p>${para(119)}<p id="hit">${"x ".repeat(61)}</p>${LONG}`,
      );
      expect(cleanup.findFirstSubstantialParagraph(doc)?.id).toBe("hit");
    });

    it("returns null when no paragraph is long enough", () => {
      expect(
        cleanup.findFirstSubstantialParagraph(parse(`${para(119)}`)),
      ).toBeNull();
    });

    it("ignores non-paragraph elements, and finds a nested paragraph", () => {
      const doc = parse(
        `<div>${"x".repeat(300)}</div><section><p id="hit">${"y".repeat(120)}</p></section>`,
      );
      expect(cleanup.findFirstSubstantialParagraph(doc)?.id).toBe("hit");
    });

    describe("isBeforeBoundary", () => {
      const doc = parse(
        `<img id="before"><div id="ancestor"><span id="inner"></span><p id="boundary"><b id="child"></b></p></div><img id="after">`,
      );
      const get = (id: string): HTMLElement => {
        const el = doc.getElementById(id);
        if (!el) throw new Error(`missing #${id}`);
        return el;
      };

      it("is true for everything when there is no boundary", () => {
        expect(cleanup.isBeforeBoundary(get("after"), null)).toBe(true);
      });

      it("is true for an element that precedes the boundary", () => {
        expect(cleanup.isBeforeBoundary(get("before"), get("boundary"))).toBe(
          true,
        );
        expect(cleanup.isBeforeBoundary(get("inner"), get("boundary"))).toBe(
          true,
        );
      });

      it("is true for an ancestor of the boundary", () => {
        expect(cleanup.isBeforeBoundary(get("ancestor"), get("boundary"))).toBe(
          true,
        );
      });

      it("is false for the boundary itself, its descendants, and later elements", () => {
        expect(cleanup.isBeforeBoundary(get("boundary"), get("boundary"))).toBe(
          false,
        );
        expect(cleanup.isBeforeBoundary(get("child"), get("boundary"))).toBe(
          false,
        );
        expect(cleanup.isBeforeBoundary(get("after"), get("boundary"))).toBe(
          false,
        );
      });
    });
  });

  describe("stripDuplicateLeadMediaMatchingHero", () => {
    const strip = (html: string, hero: string): string => {
      const doc = parse(html);
      cleanup.stripDuplicateLeadMediaMatchingHero(doc, hero);
      return bodyOf(doc);
    };
    const HERO = "https://cdn.example.com/images/hero.jpg";

    it("removes a lead image equal to the hero, with its figure, picture or link", () => {
      expect(strip(`<figure><img src="${HERO}"></figure>${LONG}`, HERO)).toBe(
        LONG,
      );
      expect(strip(`<picture><img src="${HERO}"></picture>${LONG}`, HERO)).toBe(
        LONG,
      );
      expect(strip(`<a href="/p"><img src="${HERO}"></a>${LONG}`, HERO)).toBe(
        LONG,
      );
      expect(strip(`<img src="${HERO}">${LONG}`, HERO)).toBe(LONG);
    });

    it("matches by host and path, ignoring query, size suffix and case", () => {
      const src = "https://CDN.example.com/Images/Hero-800x600.JPG?w=300";
      expect(strip(`<img src="${src}">${LONG}`, HERO)).toBe(LONG);
    });

    it("keeps a different image", () => {
      const html = `<img src="https://cdn.example.com/images/other.jpg">${LONG}`;
      expect(strip(html, HERO)).toBe(html);
    });

    it("keeps an image after the first substantial paragraph", () => {
      const html = `${LONG}<img src="${HERO}">`;
      expect(strip(html, HERO)).toBe(html);
    });

    it("treats every image as leading when there is no substantial paragraph", () => {
      expect(strip(`<p>short</p><img src="${HERO}">`, HERO)).toBe(
        "<p>short</p>",
      );
    });

    it("does nothing for an empty hero URL", () => {
      const html = `<img src="${HERO}">${LONG}`;
      expect(strip(html, "")).toBe(html);
    });

    it("skips an image whose src is empty or blank", () => {
      const html = `<img><img src="  ">${LONG}`;
      expect(strip(html, HERO)).toBe(html);
    });

    it("trims the src before comparing", () => {
      expect(strip(`<img src="  ${HERO}  ">${LONG}`, HERO)).toBe(LONG);
    });

    it("removes every matching lead image", () => {
      expect(strip(`<img src="${HERO}"><img src="${HERO}">${LONG}`, HERO)).toBe(
        LONG,
      );
    });

    it("treats 119 characters as short of the boundary and 120 as the boundary", () => {
      // 119 characters is not substantial, so an image after it still counts as leading.
      expect(strip(`${para(119)}<img src="${HERO}">`, HERO)).toBe(para(119));
      expect(strip(`${para(120)}<img src="${HERO}">`, HERO)).toBe(
        `${para(120)}<img src="${HERO}">`,
      );
    });

    it("does nothing for a body-less document", () => {
      const xml = new DOMParser().parseFromString("<root/>", "text/xml");
      expect(() =>
        cleanup.stripDuplicateLeadMediaMatchingHero(xml, HERO),
      ).not.toThrow();
    });
  });

  describe("stripDuplicateLeadCaptionBlocks", () => {
    const strip = (html: string): string => {
      const doc = parse(html);
      cleanup.stripDuplicateLeadCaptionBlocks(doc);
      return bodyOf(doc);
    };

    it("removes a lead figcaption that looks like a credit, and keeps the figure", () => {
      expect(
        strip(
          `<figure><img src="a.jpg"><figcaption>Photo: Jane Doe</figcaption></figure>${LONG}`,
        ),
      ).toBe(`<figure><img src="a.jpg"></figure>${LONG}`);
    });

    it.each(["credit", "photo", "image", "source"])(
      "treats the word %s, in any case and inside longer words, as a credit marker",
      (word) => {
        expect(
          strip(
            `<figcaption>Big ${word.toUpperCase()}s here</figcaption>${LONG}`,
          ),
        ).toBe(LONG);
      },
    );

    it("keeps a caption with no credit marker", () => {
      const html = `<figcaption>A lovely sunset</figcaption>${LONG}`;
      expect(strip(html)).toBe(html);
    });

    it("keeps an empty caption", () => {
      const html = `<figcaption>   </figcaption>${LONG}`;
      expect(strip(html)).toBe(html);
    });

    it("removes a caption of 300 normalized characters but keeps one of 301", () => {
      const cap = (n: number): string => `Photo ${"a".repeat(n - 6)}`;
      expect(strip(`<figcaption>${cap(300)}</figcaption>${LONG}`)).toBe(LONG);
      const kept = `<figcaption>${cap(301)}</figcaption>${LONG}`;
      expect(strip(kept)).toBe(kept);
    });

    it("keeps a credit caption after the first substantial paragraph", () => {
      const html = `${LONG}<figcaption>Photo: Jane</figcaption>`;
      expect(strip(html)).toBe(html);
    });

    it("also removes elements whose id starts with or contains caption-", () => {
      expect(
        strip(
          `<div id="caption-123">Image credit: X</div><span id="my-caption-1">Source: Y</span>${LONG}`,
        ),
      ).toBe(LONG);
    });

    it("treats every caption as leading when there is no substantial paragraph", () => {
      expect(strip(`<figcaption>Photo: Jane</figcaption><p>short</p>`)).toBe(
        "<p>short</p>",
      );
    });

    it("removes a repeated lead paragraph equal to a removed caption", () => {
      expect(
        strip(
          `<figure><figcaption>Photo: Jane Doe</figcaption></figure><p>photo:  JANE doe</p><p>Other</p>${LONG}`,
        ),
      ).toBe(`<figure></figure><p>Other</p>${LONG}`);
    });

    it("keeps the repeated paragraph when it falls after the first substantial paragraph", () => {
      const html = `<figcaption>Photo: Jane</figcaption>${LONG}<p>Photo: Jane</p>`;
      expect(strip(html)).toBe(`${LONG}<p>Photo: Jane</p>`);
    });

    it("keeps a credit-like paragraph when no caption was removed", () => {
      const html = `<p>Photo: Jane</p>${LONG}`;
      expect(strip(html)).toBe(html);
    });

    it("keeps a paragraph that differs from every removed caption", () => {
      const html = `<figcaption>Photo: Jane</figcaption><p>Photo: John</p>${LONG}`;
      expect(strip(html)).toBe(`<p>Photo: John</p>${LONG}`);
    });

    it("does nothing for a body-less document", () => {
      const xml = new DOMParser().parseFromString("<root/>", "text/xml");
      expect(() => cleanup.stripDuplicateLeadCaptionBlocks(xml)).not.toThrow();
    });
  });

  describe("isLikelySameImageSource / normalizeImageSourceKey", () => {
    it("keys an absolute URL by lowercase host and path, dropping scheme, query and hash", () => {
      expect(
        cleanup.normalizeImageSourceKey(
          "HTTPS://Cdn.Example.COM/A/B.JPG?w=1#x",
        ),
      ).toBe("cdn.example.com/a/b.jpg");
    });

    it("drops a size suffix that sits just before the extension", () => {
      expect(
        cleanup.normalizeImageSourceKey("https://x.test/p/photo-300x200.jpg"),
      ).toBe("x.test/p/photo.jpg");
      expect(
        cleanup.normalizeImageSourceKey(
          "https://x.test/p/photo-300x200-final.jpg",
        ),
      ).toBe("x.test/p/photo-300x200-final.jpg");
      expect(
        cleanup.normalizeImageSourceKey("https://x.test/p/photo-300x200"),
      ).toBe("x.test/p/photo-300x200");
    });

    it("keys a relative URL against a placeholder host", () => {
      expect(cleanup.normalizeImageSourceKey("/img/a-10x10.png")).toBe(
        "example.invalid/img/a.png",
      );
    });

    it("returns an empty key for empty or blank input", () => {
      expect(cleanup.normalizeImageSourceKey("")).toBe("");
      expect(cleanup.normalizeImageSourceKey("   ")).toBe("");
    });

    it("unwraps Substack CDN fetch URLs before keying", () => {
      const wrapped =
        "https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto/https%3A%2F%2Fbucket.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc.png";
      expect(cleanup.normalizeImageSourceKey(wrapped)).toBe(
        "bucket.s3.amazonaws.com/public/images/abc.png",
      );
      expect(
        cleanup.isLikelySameImageSource(
          wrapped,
          "https://bucket.s3.amazonaws.com/public/images/abc.png",
        ),
      ).toBe(true);
    });

    it("falls back to the lowercased string, minus the size suffix, when the URL is invalid", () => {
      expect(
        cleanup.normalizeImageSourceKey("http://[bad/Photo-300x200.JPG"),
      ).toBe("http://[bad/photo.jpg");
      expect(
        cleanup.isLikelySameImageSource(
          "http://[bad/Photo-300x200.JPG",
          "http://[bad/photo.jpg",
        ),
      ).toBe(true);
      // The fallback keeps the query string, which the URL path drops.
      expect(
        cleanup.isLikelySameImageSource(
          "http://[bad/a.jpg?x=1",
          "http://[bad/a.jpg",
        ),
      ).toBe(false);
    });

    it("matches the same image across schemes, queries, sizes and case", () => {
      expect(
        cleanup.isLikelySameImageSource(
          "http://X.test/a/pic-640x480.png?w=1",
          "https://x.test/A/pic.PNG",
        ),
      ).toBe(true);
    });

    it("does not match different hosts or paths", () => {
      expect(
        cleanup.isLikelySameImageSource(
          "https://a.test/p.jpg",
          "https://b.test/p.jpg",
        ),
      ).toBe(false);
      expect(
        cleanup.isLikelySameImageSource(
          "https://a.test/p.jpg",
          "https://a.test/q.jpg",
        ),
      ).toBe(false);
    });

    it("never matches when either side is empty, including both", () => {
      expect(cleanup.isLikelySameImageSource("", "https://a.test/p.jpg")).toBe(
        false,
      );
      expect(cleanup.isLikelySameImageSource("https://a.test/p.jpg", "")).toBe(
        false,
      );
      expect(cleanup.isLikelySameImageSource("", "")).toBe(false);
      expect(cleanup.isLikelySameImageSource("  ", "  ")).toBe(false);
    });

    it("matches a relative URL to the placeholder host, and relative URLs to each other", () => {
      expect(cleanup.isLikelySameImageSource("/a.jpg", "/a.jpg?v=2")).toBe(
        true,
      );
      expect(
        cleanup.isLikelySameImageSource(
          "/a.jpg",
          "https://example.invalid/a.jpg",
        ),
      ).toBe(true);
    });
  });

  describe("hasMeaningfulArticleContent", () => {
    it("is false for null and empty html", () => {
      expect(cleanup.hasMeaningfulArticleContent(null)).toBe(false);
      expect(cleanup.hasMeaningfulArticleContent("")).toBe(false);
    });

    it("needs more than 200 characters of trimmed text", () => {
      expect(
        cleanup.hasMeaningfulArticleContent(`<p>${"x".repeat(200)}</p>`),
      ).toBe(false);
      expect(
        cleanup.hasMeaningfulArticleContent(`<p>${"x".repeat(201)}</p>`),
      ).toBe(true);
    });

    it("trims the ends but counts whitespace between words", () => {
      expect(
        cleanup.hasMeaningfulArticleContent(
          `  <p>  ${"x".repeat(200)}  </p>  `,
        ),
      ).toBe(false);
      expect(
        cleanup.hasMeaningfulArticleContent(`<p>a${" ".repeat(199)}b</p>`),
      ).toBe(true);
    });

    it("counts text only, not markup", () => {
      expect(
        cleanup.hasMeaningfulArticleContent(
          `<div class="${"c".repeat(300)}"><img src="${"s".repeat(300)}">short</div>`,
        ),
      ).toBe(false);
    });
  });

  describe("whitespace and boundary details", () => {
    const parseBlock = (html: string): HTMLElement => {
      const el = parse(html).body.firstElementChild;
      if (!el) throw new Error("fixture has no element");
      return el as HTMLElement;
    };
    const stripNav = (html: string): string => {
      const doc = parse(html);
      cleanup.stripNavigationChromeFromDocument(doc);
      return bodyOf(doc);
    };
    const li = (text: string): string => `<li><a href="/x">${text}</a></li>`;

    it("collapses runs of whitespace before measuring a breadcrumb list's text", () => {
      const gap = " ".repeat(40);
      const html = `<ul>${li("a".repeat(30))}${gap}${li("b".repeat(30))}${gap}${li("c".repeat(30))}</ul>${LONG}`;
      expect(stripNav(html)).toBe(LONG);
    });

    it("trims a breadcrumb list's text before the 140-character limit", () => {
      const four = `${li("a".repeat(35))}${li("b".repeat(35))}${li("c".repeat(35))}${li("d".repeat(35))}`;
      expect(stripNav(`<ul> ${four} </ul>${LONG}`)).toBe(LONG);
    });

    it("trims and collapses a breadcrumb link's text before the 40-character limit", () => {
      const padded = `<ul><li><a href="/x"> ${"a".repeat(40)} </a></li><li><a href="/x">\n${"b".repeat(40)}\n</a></li></ul>${LONG}`;
      expect(stripNav(padded)).toBe(LONG);
      const gapped = `<ul><li><a href="/x">a${" ".repeat(45)}b</a></li><li><a href="/x">c${" ".repeat(45)}d</a></li></ul>${LONG}`;
      expect(stripNav(gapped)).toBe(LONG);
    });

    it("trims and collapses a link-only header's text before the 200-character limit", () => {
      const sep = " ".repeat(20);
      const links = `<a href="/1">${"a".repeat(100)}</a>${sep}<a href="/2">${"b".repeat(60)}</a>${sep}<a href="/3">${"c".repeat(37)}</a>`;
      expect(stripNav(`<header>     ${links}     </header>${LONG}`)).toBe(LONG);
    });

    it("isAcceptableDisplayTitle collapses and trims before measuring", () => {
      expect(cleanup.isAcceptableDisplayTitle("a  b   cdefg")).toBe(false);
      expect(cleanup.isAcceptableDisplayTitle(" a b cdefg ")).toBe(false);
    });

    it("getNormalizedBlockText reads the block's html, so escaped markup stays text", () => {
      expect(
        cleanup.getNormalizedBlockText(
          parseBlock("<p>&lt;i&gt;Hello&lt;/i&gt;</p>"),
        ),
      ).toBe("<i>hello</i>");
    });

    it("isLeadMediaBlock finds a figure or picture inside a plain wrapper", () => {
      expect(
        cleanup.isLeadMediaBlock(parseBlock("<div><figure></figure></div>")),
      ).toBe(true);
      expect(
        cleanup.isLeadMediaBlock(parseBlock("<div><picture></picture></div>")),
      ).toBe(true);
    });

    it("isShortLeadInBlock is false for a short media wrapper", () => {
      expect(
        cleanup.isShortLeadInBlock(
          parseBlock('<div><img src="a.jpg">cap</div>'),
        ),
      ).toBe(false);
    });

    it("keeps a block equal to a long description when it is the first substantial block", () => {
      const html = `<p>intro</p>${LONG}`;
      const doc = parse(html);
      cleanup.stripDuplicateLeadContentFromDocument(doc, "x".repeat(200));
      expect(bodyOf(doc)).toBe(html);
    });

    it("starts removing lead-ins from the block above a description that is itself long", () => {
      const desc = "d".repeat(90);
      const doc = parse(`<p>Byline</p><p>${desc}</p>${LONG}`);
      cleanup.stripDuplicateLeadContentFromDocument(doc, desc);
      expect(bodyOf(doc)).toBe(LONG);
    });

    it("does not treat a missing description as the text Z", () => {
      const html = `<p>Z</p>${LONG}`;
      const doc = parse(html);
      cleanup.stripDuplicateLeadContentFromDocument(doc);
      expect(bodyOf(doc)).toBe(html);
    });

    it("stripLeadMediaBeforeContent counts 120 characters, not 119 or 121, as substantial", () => {
      const run = (p: string): string => {
        const doc = parse(`<img src="a.jpg">${p}`);
        cleanup.stripLeadMediaBeforeContent(doc);
        return bodyOf(doc);
      };
      expect(run(para(120))).toBe(para(120));
      expect(run(para(119))).toBe(`<img src="a.jpg">${para(119)}`);
    });

    it("stripLeadMediaBeforeContent keeps a figure that is itself the first substantial block", () => {
      const figure = `<figure><img src="b.jpg"><figcaption>${"x".repeat(200)}</figcaption></figure>`;
      const doc = parse(`<img src="a.jpg">${figure}`);
      cleanup.stripLeadMediaBeforeContent(doc);
      expect(bodyOf(doc)).toBe(figure);
    });

    it("matches skip-link text after trimming leading whitespace", () => {
      const doc = parse(
        `<a href="#main">\n  Skip to navigation</a><p>kept</p>`,
      );
      cleanup.stripSkipLinksFromDocument(doc);
      expect(bodyOf(doc)).toBe("<p>kept</p>");
    });

    it("matches a skip id case-insensitively", () => {
      const doc = parse(`<a href="#x" id="SKIP-MAIN">Go</a><p>kept</p>`);
      cleanup.stripSkipLinksFromDocument(doc);
      expect(bodyOf(doc)).toBe("<p>kept</p>");
    });

    it.each(["credit", "photo", "image", "source"])(
      "removes a lead paragraph repeating a %s caption, matching case-insensitively",
      (word) => {
        const doc = parse(
          `<figcaption>${word}: Jane</figcaption><p>${word.toUpperCase()}: JANE</p>${LONG}`,
        );
        cleanup.stripDuplicateLeadCaptionBlocks(doc);
        expect(bodyOf(doc)).toBe(LONG);
      },
    );

    it("findFirstSubstantialParagraph collapses and trims whitespace", () => {
      const gappy = parse(`<p>${"x".repeat(60)}${" ".repeat(70)}yyyyy</p>`);
      expect(cleanup.findFirstSubstantialParagraph(gappy)).toBeNull();
      const padded = parse(`<p>  ${"x".repeat(119)}  </p>`);
      expect(cleanup.findFirstSubstantialParagraph(padded)).toBeNull();
    });

    it("strips a size suffix only when the extension ends the path, for digits too", () => {
      expect(
        cleanup.normalizeImageSourceKey("https://x.test/a-300x200.jpg.bak"),
      ).toBe("x.test/a-300x200.jpg.bak");
      expect(
        cleanup.normalizeImageSourceKey("https://x.test/a-300x200.mp4"),
      ).toBe("x.test/a.mp4");
      expect(
        cleanup.normalizeImageSourceKey("http://[bad/a-300x200.jpg.bak"),
      ).toBe("http://[bad/a-300x200.jpg.bak");
      expect(cleanup.normalizeImageSourceKey("http://[bad/a-300x200.mp4")).toBe(
        "http://[bad/a.mp4",
      );
    });
  });

  describe("full-article path through displayItem", () => {
    it("strips chrome, skip links, the top headline and lead duplicates, and takes the title from the h1", async () => {
      const description = "A short summary of the article";
      const body = `<p>${"Body sentence of the article. ".repeat(8)}</p>`;
      const html = [
        `<a href="#main" class="skip-link">Skip to content</a>`,
        nav(' data-testid="breadcrumb-container"'),
        `<h1>An Article Headline Worth Reading</h1>`,
        `<p>${description}</p>`,
        body,
      ].join("");
      viewHarness.fetchFullArticleContent = vi.fn().mockResolvedValue(html);

      await view.displayItem(makeItem({ description }));

      const content = viewHarness.readingContainer.querySelector(
        ".rss-reader-article-content",
      );
      expect(content).not.toBeNull();
      expect(content?.querySelector("nav")).toBeNull();
      expect(content?.querySelector("h1")).toBeNull();
      expect(content?.querySelector("a.skip-link")).toBeNull();
      expect(content?.textContent).toContain("Body sentence of the article.");
      expect(content?.textContent).not.toContain(description);
      expect(viewHarness.currentDisplayTitle).toBe(
        "An Article Headline Worth Reading",
      );
    });

    it("keeps story text inside a link when removing the fetched lead image", async () => {
      const hero = "https://img.example.com/images/hero.jpg";
      const leadText =
        "The first paragraph of the story, which is the content the reader came for. ".repeat(
          2,
        );
      const moreText = "Further article text. ".repeat(12);
      viewHarness.fetchFullArticleContent = vi
        .fn()
        .mockResolvedValue(
          `<a href="/story"><div><img src="${hero}"><p>${leadText}</p></div></a><p>${moreText}</p>`,
        );

      await view.displayItem(makeItem({ coverImage: hero }));

      const content = viewHarness.readingContainer.querySelector(
        ".rss-reader-article-content",
      );
      expect(content).not.toBeNull();
      expect(content?.querySelector("img")).toBeNull();
      const leadParagraph = content?.querySelector("a p");
      expect(leadParagraph).not.toBeNull();
      expect(leadParagraph?.textContent).toContain(
        "The first paragraph of the story",
      );
      expect(content?.textContent).toContain("Further article text.");
    });
  });
});
