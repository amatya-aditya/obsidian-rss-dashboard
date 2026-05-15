import { describe, expect, it, vi, afterEach } from "vitest";
import { OpmlManager } from "../../../src/services/opml-manager";
import type { Feed, Folder } from "../../../src/types/types";

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed",
    url: "https://example.com/rss.xml",
    folder: "Uncategorized",
    items: [],
    lastUpdated: 0,
    ...overrides,
  };
}

function createFolder(name: string, subfolders: Folder[] = []): Folder {
  return { name, subfolders };
}

describe("OpmlManager.parseOpmlMetadata", () => {
  it("parses feeds and nested folder paths", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech" title="Tech">
      <outline text="AI" title="AI">
        <outline text="Feed A" title="Feed A" type="rss" xmlUrl="https://a.example.com/rss.xml" />
      </outline>
      <outline text="Feed B" title="Feed B" xmlUrl="https://b.example.com/rss.xml" />
    </outline>
    <outline xmlUrl="https://top.example.com/rss.xml" />
  </body>
</opml>`;

    const { feeds, folders } = OpmlManager.parseOpmlMetadata(opml);

    expect(feeds).toHaveLength(3);
    expect(feeds.map((f) => ({ title: f.title, url: f.url, folder: f.folder }))).toEqual([
      { title: "Feed A", url: "https://a.example.com/rss.xml", folder: "Tech/AI" },
      { title: "Feed B", url: "https://b.example.com/rss.xml", folder: "Tech" },
      { title: "Unnamed feed", url: "https://top.example.com/rss.xml", folder: "Uncategorized" },
    ]);

    expect(folders).toEqual([
      {
        name: "Tech",
        subfolders: [{ name: "AI", subfolders: [] }],
      },
    ]);
  });

  it("throws on invalid XML", () => {
    const invalid = "<opml><body><outline></body></opml>";
    expect(() => OpmlManager.parseOpmlMetadata(invalid)).toThrow("Invalid OPML format");
  });

  it("preprocesses unescaped ampersands so parsing does not fail", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Feed" xmlUrl="https://example.com/rss.xml?x=1&y=2" category="A&B" />
  </body>
</opml>`;

    const { feeds } = OpmlManager.parseOpmlMetadata(opml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].url).toBe("https://example.com/rss.xml?x=1&y=2");
    expect(feeds[0].folder).toBe("A&B");
  });
});

describe("OpmlManager.parseOpml", () => {
  it("returns Feed objects with items initialized and builds folder tree", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="AI">
        <outline text="Feed A" type="rss" xmlUrl="https://a.example.com/rss.xml" />
      </outline>
    </outline>
  </body>
</opml>`;

    const { feeds, folders } = OpmlManager.parseOpml(opml);

    expect(feeds).toEqual([
      {
        title: "Feed A",
        url: "https://a.example.com/rss.xml",
        folder: "Tech/AI",
        items: [],
        lastUpdated: 0,
      },
    ]);

    expect(folders).toEqual([{ name: "Tech", subfolders: [{ name: "AI", subfolders: [] }] }]);
  });

  it("throws on invalid XML", () => {
    const invalid = "<opml><body><outline></body></opml>";
    expect(() => OpmlManager.parseOpml(invalid)).toThrow("Invalid OPML format");
  });
});

describe("OpmlManager.importOpml", () => {
  it("merges feeds by url and merges folders", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="Feed A" type="rss" xmlUrl="https://a.example.com/rss.xml" />
      <outline text="Feed B" type="rss" xmlUrl="https://b.example.com/rss.xml" />
    </outline>
  </body>
</opml>`;

    const existingFeeds = [
      createFeed({ title: "Existing A", url: "https://a.example.com/rss.xml", folder: "Old" }),
    ];
    const existingFolders = [createFolder("Old")];

    const result = OpmlManager.importOpml(opml, existingFeeds, existingFolders);

    expect(result.feeds.map((f) => f.url).sort()).toEqual([
      "https://a.example.com/rss.xml",
      "https://b.example.com/rss.xml",
    ]);
    expect(result.folders).toEqual([createFolder("Old"), createFolder("Tech")]);
  });

  it("wraps parse failures with a stable import error", () => {
    expect(() => OpmlManager.importOpml("not xml", [], [])).toThrow(
      "Failed to import OPML: Invalid format",
    );
  });
});

describe("OpmlManager.mergeFolders", () => {
  it("merges matching folders recursively", () => {
    const existing = [createFolder("Tech", [createFolder("AI")])];
    const incoming = [createFolder("Tech", [createFolder("News")]), createFolder("Other")];

    const merged = OpmlManager.mergeFolders(existing, incoming);

    expect(merged).toEqual([
      {
        name: "Tech",
        subfolders: [{ name: "AI", subfolders: [] }, { name: "News", subfolders: [] }],
      },
      { name: "Other", subfolders: [] },
    ]);
  });
});

describe("OpmlManager.generateOpml", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates valid OPML with stable date and escapes XML", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T00:00:00.000Z"));

    const folders: Folder[] = [
      createFolder('Tech & "Stuff"', [createFolder("AI <ML>")]),
    ];
    const feeds: Feed[] = [
      createFeed({
        title: "Top & <Feed>",
        url: "https://top.example.com/rss.xml?x=1&y=2",
        folder: "Other & More",
      }),
      createFeed({
        title: "In Tech",
        url: "https://tech.example.com/rss.xml",
        folder: 'Tech & "Stuff"',
      }),
      createFeed({
        title: "In AI",
        url: "https://ai.example.com/rss.xml",
        folder: 'Tech & "Stuff"/AI <ML>',
      }),
    ];

    const opml = OpmlManager.generateOpml(feeds, folders);

    expect(opml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(opml).toContain('<opml version="2.0">');
    expect(opml).toContain("<title>RSS dashboard feeds</title>");
    expect(opml).toContain("<dateCreated>Sun, 29 Mar 2026 00:00:00 GMT</dateCreated>");

    // Escaping
    expect(opml).toContain('text="Top &amp; &lt;Feed&gt;"');
    expect(opml).toContain('xmlUrl="https://top.example.com/rss.xml?x=1&amp;y=2"');
    expect(opml).toContain('category="Other &amp; More"');
    expect(opml).toContain('text="Tech &amp; &quot;Stuff&quot;"');
    expect(opml).toContain('text="AI &lt;ML&gt;"');

    // Structure: folder outlines exist and nested feed is present
    const xmlDoc = new DOMParser().parseFromString(opml, "text/xml");
    expect(xmlDoc.getElementsByTagName("parsererror")).toHaveLength(0);

    const outlines = Array.from(xmlDoc.getElementsByTagName("outline")).map((n) => ({
      text: n.getAttribute("text"),
      xmlUrl: n.getAttribute("xmlUrl"),
    }));

    expect(outlines).toEqual(
      expect.arrayContaining([
        { text: 'Top & <Feed>', xmlUrl: "https://top.example.com/rss.xml?x=1&y=2" },
        { text: 'Tech & "Stuff"', xmlUrl: null },
        { text: "AI <ML>", xmlUrl: null },
        { text: "In AI", xmlUrl: "https://ai.example.com/rss.xml" },
      ]),
    );
  });

  it("handles empty feeds list", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T00:00:00.000Z"));

    const opml = OpmlManager.generateOpml([], []);
    expect(opml).toContain("<body>");
    expect(opml).toContain("</opml>");

    const xmlDoc = new DOMParser().parseFromString(opml, "text/xml");
    expect(xmlDoc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(xmlDoc.getElementsByTagName("outline")).toHaveLength(0);
  });
});

