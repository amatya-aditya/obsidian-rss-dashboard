// Page-metadata extraction and resolution (#247 slice 3, ADR 0007). Extraction
// reads every raw signal from the fetched page's Document before Readability
// mutates it; resolution applies precedence and the degenerate-value guard
// against feed-level fallbacks. Both are pure, so these tests run against
// Document fixtures rather than live fetches.
import { describe, expect, it } from "vitest";
import {
  extractPageMetadata,
  resolveArticleMetadata,
  type RawArticleMetadata,
} from "../../../src/utils/article-metadata";

function docFrom(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function emptyRaw(overrides: Partial<RawArticleMetadata> = {}) {
  const raw: RawArticleMetadata = {
    metaDescription: "",
    ogDescription: "",
    twitterDescription: "",
    htmlLang: "",
    metaAuthor: "",
    jsonLdAuthors: [],
    microdataAuthors: [],
    relAuthors: [],
    canonicalUrl: "",
    readabilityExcerpt: "",
    ...overrides,
  };
  return raw;
}

const LONG_A =
  "A detailed look at how the harbor budget was negotiated over many months of council debate";
const LONG_B =
  "The publisher's own summary of the harbor budget story, written for search results pages";
const LONG_C =
  "Twitter card text that describes the harbor budget story in a slightly different way";
const FEED_BLURB =
  "Feed blurb: the council approved the harbor budget after a long and tense session";

describe("extractPageMetadata", () => {
  it("reads the description signals, language and canonical link", () => {
    const doc = docFrom(`<!doctype html><html lang="en-GB"><head>
      <meta name="description" content="${LONG_A}">
      <meta property="og:description" content="${LONG_B}">
      <meta name="twitter:description" content="${LONG_C}">
      <link rel="canonical" href="https://example.com/harbor-budget">
    </head><body><p>Body</p></body></html>`);

    expect(extractPageMetadata(doc)).toEqual(
      emptyRaw({
        metaDescription: LONG_A,
        ogDescription: LONG_B,
        twitterDescription: LONG_C,
        htmlLang: "en-GB",
        canonicalUrl: "https://example.com/harbor-budget",
      }),
    );
  });

  it("reads twitter:description when a publisher uses the property attribute", () => {
    const doc = docFrom(
      `<html><head><meta property="twitter:description" content="${LONG_C}"></head><body></body></html>`,
    );

    expect(extractPageMetadata(doc).twitterDescription).toBe(LONG_C);
  });

  it("reads each page-level author signal separately", () => {
    const doc = docFrom(`<html><head>
      <meta name="author" content="Meta Writer">
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"NewsArticle","author":{"@type":"Person","name":"Json Writer"}}
      </script>
    </head><body>
      <span itemprop="author" itemscope itemtype="https://schema.org/Person">
        <span itemprop="name">Micro Writer</span>
      </span>
      <a rel="author" href="/people/rel-writer">Rel Writer</a>
    </body></html>`);

    const raw = extractPageMetadata(doc);

    expect(raw.metaAuthor).toBe("Meta Writer");
    expect(raw.jsonLdAuthors).toEqual(["Json Writer"]);
    expect(raw.microdataAuthors).toEqual(["Micro Writer"]);
    expect(raw.relAuthors).toEqual(["Rel Writer"]);
  });

  it("reads JSON-LD authors given as strings, arrays and @graph entries", () => {
    const doc = docFrom(`<html><head>
      <script type="application/ld+json">
        {"@graph":[{"@type":"WebSite","name":"Site"},
          {"@type":"Article","author":[{"name":"First Author"},"Second Author"]}]}
      </script>
      <script type="application/ld+json">not json at all</script>
    </head><body></body></html>`);

    expect(extractPageMetadata(doc).jsonLdAuthors).toEqual([
      "First Author",
      "Second Author",
    ]);
  });

  it("reads a microdata author given as plain text or a content attribute", () => {
    const doc = docFrom(`<html><body>
      <span itemprop="author">Plain Writer</span>
      <meta itemprop="author" content="Attribute Writer">
    </body></html>`);

    expect(extractPageMetadata(doc).microdataAuthors).toEqual([
      "Plain Writer",
      "Attribute Writer",
    ]);
  });

  it("ignores a relative or non-http canonical link", () => {
    const relative = docFrom(
      `<html><head><link rel="canonical" href="/harbor"></head><body></body></html>`,
    );
    const script = docFrom(
      `<html><head><link rel="canonical" href="javascript:alert(1)"></head><body></body></html>`,
    );

    expect(extractPageMetadata(relative).canonicalUrl).toBe("");
    expect(extractPageMetadata(script).canonicalUrl).toBe("");
  });

  it("returns an all-empty result for a page with no signals", () => {
    expect(extractPageMetadata(docFrom("<html><body>x</body></html>"))).toEqual(
      emptyRaw(),
    );
  });

  it("swallows internal errors and returns an all-empty result", () => {
    const broken = {
      querySelector: () => {
        throw new Error("boom");
      },
      querySelectorAll: () => {
        throw new Error("boom");
      },
      documentElement: null,
    } as unknown as Document;

    expect(extractPageMetadata(broken)).toEqual(emptyRaw());
  });
});

describe("resolveArticleMetadata description tier", () => {
  it("prefers meta description, then og:description, then twitter:description", () => {
    const all = emptyRaw({
      metaDescription: LONG_A,
      ogDescription: LONG_B,
      twitterDescription: LONG_C,
    });
    expect(resolveArticleMetadata(all, {}).description).toBe(LONG_A);
    expect(
      resolveArticleMetadata({ ...all, metaDescription: "" }, {}).description,
    ).toBe(LONG_B);
    expect(
      resolveArticleMetadata(
        { ...all, metaDescription: "", ogDescription: "" },
        {},
      ).description,
    ).toBe(LONG_C);
  });

  it("falls back to the feed description as the last candidate, as plain text", () => {
    const resolved = resolveArticleMetadata(emptyRaw(), {
      description: `<p>${FEED_BLURB}</p>`,
    });

    expect(resolved.description).toBe(FEED_BLURB);
  });

  it("normalizes whitespace in the accepted value", () => {
    const resolved = resolveArticleMetadata(
      emptyRaw({ metaDescription: `  ${LONG_A.replace(/ /g, "  ")}\n` }),
      {},
    );

    expect(resolved.description).toBe(LONG_A);
  });

  it("re-runs the guard on every fallthrough so a good later candidate wins", () => {
    // Substack-style: placeholders in the first signals, real text later.
    const resolved = resolveArticleMetadata(
      emptyRaw({
        metaDescription: "...",
        ogDescription: "…",
        twitterDescription: LONG_C,
      }),
      { title: "Harbor budget" },
    );

    expect(resolved.description).toBe(LONG_C);
  });

  it("leaves the description empty when every candidate is rejected", () => {
    const resolved = resolveArticleMetadata(
      emptyRaw({
        metaDescription: "...",
        ogDescription: "...",
        twitterDescription: "...",
      }),
      { description: "..." },
    );

    expect(resolved.description).toBe("");
  });

  describe("degenerate-value guard", () => {
    it("rejects a candidate under 40 normalized characters", () => {
      const short = "A short description of 39 characters!!"; // 38
      expect(short.length).toBeLessThan(40);
      const resolved = resolveArticleMetadata(
        emptyRaw({ metaDescription: short, ogDescription: LONG_B }),
        {},
      );

      expect(resolved.description).toBe(LONG_B);
    });

    it("accepts a candidate of exactly 40 normalized characters", () => {
      const exact = "x".repeat(10) + " " + "y".repeat(29);
      expect(exact).toHaveLength(40);

      expect(
        resolveArticleMetadata(emptyRaw({ metaDescription: exact }), {})
          .description,
      ).toBe(exact);
    });

    it("rejects a candidate equal to the title, ignoring case and spacing", () => {
      const title = "The harbor budget story: how the council decided it";
      const resolved = resolveArticleMetadata(
        emptyRaw({
          metaDescription: title.toUpperCase(),
          ogDescription: LONG_B,
        }),
        { title: `  ${title}  ` },
      );

      expect(resolved.description).toBe(LONG_B);
    });

    it("rejects a long punctuation- or ellipsis-only candidate", () => {
      const resolved = resolveArticleMetadata(
        emptyRaw({
          metaDescription: ". ".repeat(30),
          ogDescription: "…".repeat(45),
          twitterDescription: LONG_C,
        }),
        {},
      );

      expect(resolved.description).toBe(LONG_C);
    });

    it("rejects a duplicate intro of the article body", () => {
      const articleHtml = `<p>${LONG_A}. The vote followed a long public hearing.</p>`;
      const resolved = resolveArticleMetadata(
        emptyRaw({ metaDescription: LONG_A, ogDescription: LONG_B }),
        { articleHtml },
      );

      expect(resolved.description).toBe(LONG_B);
    });
  });
});

describe("resolveArticleMetadata excerpt tier", () => {
  it("leaves the excerpt empty when the description tier resolved a value", () => {
    const resolved = resolveArticleMetadata(
      emptyRaw({ metaDescription: LONG_A, readabilityExcerpt: LONG_B }),
      { description: FEED_BLURB, articleHtml: `<p>${LONG_C}</p>` },
    );

    expect(resolved.description).toBe(LONG_A);
    expect(resolved.excerpt).toBe("");
  });

  it("seeds the excerpt with a duplicate-intro candidate, ahead of the other fallbacks", () => {
    const articleHtml = `<p>${LONG_A}. The vote followed a long public hearing.</p>`;
    const resolved = resolveArticleMetadata(
      emptyRaw({ metaDescription: LONG_A, readabilityExcerpt: LONG_C }),
      { articleHtml },
    );

    expect(resolved.description).toBe("");
    expect(resolved.excerpt).toBe(LONG_A);
  });

  it.each([
    ["too short", "Too short."],
    ["title-equal", "The harbor budget story: how the council decided it"],
    ["punctuation-only", "…".repeat(45)],
  ])("does not seed the excerpt with a %s rejection", (_label, value) => {
    const resolved = resolveArticleMetadata(
      emptyRaw({ metaDescription: value }),
      {
        title: "The harbor budget story: how the council decided it",
        articleHtml: `<p>${LONG_B}. Then more text follows here.</p>`,
      },
    );

    expect(resolved.description).toBe("");
    expect(resolved.excerpt).not.toContain(value);
    expect(resolved.excerpt).toBe(`${LONG_B}. Then more text follows here.`);
  });

  it("uses the Readability excerpt when it did not come from a page meta tag", () => {
    const resolved = resolveArticleMetadata(
      emptyRaw({ readabilityExcerpt: LONG_B }),
      { description: "...", articleHtml: `<p>${LONG_C}</p>` },
    );

    expect(resolved.description).toBe("");
    expect(resolved.excerpt).toBe(LONG_B);
  });

  it("skips a Readability excerpt that is just a meta tag already tried", () => {
    // Readability copies the meta description into its excerpt, so it adds
    // nothing new once that candidate was rejected.
    const resolved = resolveArticleMetadata(
      emptyRaw({
        metaDescription: "Too short.",
        readabilityExcerpt: "Too short.",
      }),
      { description: "...", articleHtml: `<p>${LONG_C}</p>` },
    );

    expect(resolved.excerpt).toBe(LONG_C);
  });

  it("falls back to the feed description, then to truncated article text", () => {
    const withFeed = resolveArticleMetadata(emptyRaw(), {
      description: "<p>Short feed text</p>",
      articleHtml: `<p>${LONG_C}</p>`,
    });
    expect(withFeed.description).toBe("");
    expect(withFeed.excerpt).toBe("Short feed text");

    const longBody = `<p>${"word ".repeat(200)}</p>`;
    const derived = resolveArticleMetadata(emptyRaw(), {
      articleHtml: longBody,
    });
    expect(derived.excerpt.length).toBeLessThanOrEqual(201);
    expect(derived.excerpt.endsWith("…")).toBe(true);
    expect(derived.excerpt.startsWith("word word")).toBe(true);
  });

  it("leaves the excerpt empty when nothing is available", () => {
    expect(resolveArticleMetadata(emptyRaw(), {}).excerpt).toBe("");
  });
});

describe("resolveArticleMetadata language", () => {
  it("uses <html lang> ahead of the feed-level value", () => {
    const resolved = resolveArticleMetadata(emptyRaw({ htmlLang: "fr" }), {
      language: "en",
    });

    expect(resolved.language).toBe("fr");
    expect(resolved.languageSource).toBe("page");
  });

  it("falls back to the feed-level value and records it as the source", () => {
    const resolved = resolveArticleMetadata(emptyRaw(), { language: "de-AT" });

    expect(resolved.language).toBe("de-AT");
    expect(resolved.languageSource).toBe("feed");
  });

  it("preserves regional subtags instead of truncating to the base language", () => {
    expect(
      resolveArticleMetadata(emptyRaw({ htmlLang: "pt-BR" }), {}).language,
    ).toBe("pt-BR");
    expect(
      resolveArticleMetadata(emptyRaw({ htmlLang: "zh-Hant-TW" }), {}).language,
    ).toBe("zh-Hant-TW");
  });

  it("normalizes case and underscore separators to a BCP-47 form", () => {
    expect(
      resolveArticleMetadata(emptyRaw({ htmlLang: "EN_us" }), {}).language,
    ).toBe("en-US");
  });

  it("falls through to the feed value when <html lang> is not a language tag", () => {
    const resolved = resolveArticleMetadata(emptyRaw({ htmlLang: "x" }), {
      language: "es",
    });

    expect(resolved.language).toBe("es");
    expect(resolved.languageSource).toBe("feed");
  });

  it("stays unset when neither source resolves", () => {
    const resolved = resolveArticleMetadata(emptyRaw({ htmlLang: "" }), {
      language: "  ",
    });

    expect(resolved.language).toBeUndefined();
    expect(resolved.languageSource).toBeUndefined();
  });
});

describe("resolveArticleMetadata authors", () => {
  const signals = {
    metaAuthor: "Meta Writer",
    jsonLdAuthors: ["Json Writer"],
    microdataAuthors: ["Micro Writer"],
    relAuthors: ["Rel Writer"],
  };

  it("prefers meta, then JSON-LD, then microdata, then rel=author", () => {
    expect(resolveArticleMetadata(emptyRaw(signals), {}).authors).toEqual([
      "Meta Writer",
    ]);
    expect(
      resolveArticleMetadata(emptyRaw({ ...signals, metaAuthor: "" }), {})
        .authors,
    ).toEqual(["Json Writer"]);
    expect(
      resolveArticleMetadata(
        emptyRaw({ ...signals, metaAuthor: "", jsonLdAuthors: [] }),
        {},
      ).authors,
    ).toEqual(["Micro Writer"]);
    expect(
      resolveArticleMetadata(
        emptyRaw({
          relAuthors: signals.relAuthors,
        }),
        {},
      ).authors,
    ).toEqual(["Rel Writer"]);
  });

  it("lets the page-level author replace a single feed author", () => {
    const resolved = resolveArticleMetadata(emptyRaw(signals), {
      authors: ["Jane Doe, Senior Editor, Big Institute"],
    });

    expect(resolved.authors).toEqual(["Meta Writer"]);
  });

  it("trusts a multi-entry feed result as-is", () => {
    const resolved = resolveArticleMetadata(emptyRaw(signals), {
      authors: ["First Author", "Second Author"],
    });

    expect(resolved.authors).toEqual(["First Author", "Second Author"]);
  });

  it("keeps the feed author when the page has no author signal", () => {
    const resolved = resolveArticleMetadata(emptyRaw(), {
      authors: ["Feed Writer"],
    });

    expect(resolved.authors).toEqual(["Feed Writer"]);
  });

  it("is empty when no source has an author", () => {
    expect(resolveArticleMetadata(emptyRaw(), {}).authors).toEqual([]);
  });
});

describe("resolveArticleMetadata canonical URL", () => {
  it("passes the page's canonical link through, unset when absent", () => {
    expect(
      resolveArticleMetadata(
        emptyRaw({ canonicalUrl: "https://example.com/a" }),
        {},
      ).canonicalUrl,
    ).toBe("https://example.com/a");
    expect(resolveArticleMetadata(emptyRaw(), {}).canonicalUrl).toBeUndefined();
  });
});
