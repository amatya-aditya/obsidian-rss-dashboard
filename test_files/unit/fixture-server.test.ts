import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { request, type Server } from "node:http";
import { join } from "node:path";
import { Readability } from "@mozilla/readability";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COUNTER_IMAGE_FILE,
  CREDIT_CAPTION_HERO_FILE,
  CREDIT_CAPTION_HERO_URL,
  CREDIT_CAPTION_LINK,
  CREDIT_CAPTION_PAGE,
  EMPTY_DESCRIPTION_LINK,
  EMPTY_DESCRIPTION_PAGE,
  FEED_ADVERTISING_PAGE,
  FIXTURE_FEED_PATH,
  FIXTURE_FEED_URL,
  FIXTURE_PAGES_DIR,
  FIXTURE_SERVER_ORIGIN,
  OG_IMAGE_BODY_FILE,
  OG_IMAGE_FILE,
  OG_IMAGE_HERO_LINK,
  OG_IMAGE_HERO_PAGE,
  OG_IMAGE_NO_FEED_IMAGE_LINK,
  OG_IMAGE_NO_FEED_IMAGE_PAGE,
  OG_IMAGE_URL,
  TEMPLATE_DIR,
  URL_PATTERN_PIXEL_FILE,
} from "../../scripts/generate-fixture-vault.mjs";
import {
  describeRequestIdentity,
  isFixtureFeedPath,
  resolveFixtureFile,
  startFixtureServer,
} from "../../scripts/fixture-server.mjs";
import {
  extractPageImage,
  extractPageMetadata,
  resolveArticleMetadata,
} from "../../src/utils/article-metadata";
import { applyArticleMetadata } from "../../src/utils/article-metadata-persistence";
import { hasMeaningfulArticleContent } from "../../src/utils/reader-html-cleanup";
import { isValidFeed } from "../../src/services/feed-parser/feed-validation";
import type { FeedItem } from "../../src/types/types";

// The seeded "Article with no feed description" scenario (#975): the feed ships
// no text, so the Reader must fetch the linked page and store its description.
// These tests keep the seed item, the committed page, and the fixture server
// that serves it in step, without any server outside the repository.

const SHARD_PATH = join(
  TEMPLATE_DIR,
  "rss-dashboard-data",
  "feeds",
  "fx-rss-tech.json",
);

const PAGE_DESCRIPTION =
  "A page description the Reader stores when the feed publishes no description of its own.";

function seededItems(): FeedItem[] {
  const shard = JSON.parse(readFileSync(SHARD_PATH, "utf8")) as {
    items: FeedItem[];
  };
  return shard.items;
}

function seededEmptyDescriptionItem(): FeedItem {
  const item = seededItems().find(
    (entry) => entry.link === EMPTY_DESCRIPTION_LINK,
  );
  if (!item) throw new Error("Seeded empty-description article not found.");
  return item;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

function get(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers }, (res) => {
      const chunks: string[] = [];
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: chunks.join(""),
          contentType: String(res.headers["content-type"] ?? ""),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

/** Fetches a path as raw bytes, for the image responses a string read cannot check. */
function getBytes(
  port: number,
  path: string,
): Promise<{ status: number; body: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks),
          contentType: String(res.headers["content-type"] ?? ""),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

async function listeningPort(): Promise<number> {
  const server = await startFixtureServer({ port: 0 });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Fixture server did not report a listening address.");
  }
  return address.port;
}

describe("Empty-description fixture scenario (#975)", () => {
  it("seeds an article whose feed ships no text and links to the page", () => {
    const item = seededEmptyDescriptionItem();

    expect(item.description).toBe("");
    expect(item.content).toBe("");
    expect(item.summary).toBe("");
  });

  it("stores the fetched page's description on the seeded article", () => {
    const item = seededEmptyDescriptionItem();
    const html = readFileSync(
      join(FIXTURE_PAGES_DIR, EMPTY_DESCRIPTION_PAGE),
      "utf8",
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Read the head metadata before Readability mutates the document, as the
    // reader's own fetch does.
    const pageMetadata = extractPageMetadata(doc);
    const article = new Readability(doc).parse();
    const articleHtml = article?.content ?? "";

    expect(
      resolveArticleMetadata(pageMetadata, { title: item.title, articleHtml })
        .description,
    ).toBe(PAGE_DESCRIPTION);
    // The reader persists the metadata only when the page also yields a real
    // article body, so the page must clear that bar too.
    expect(hasMeaningfulArticleContent(articleHtml)).toBe(true);

    const update = applyArticleMetadata(item, pageMetadata, articleHtml);
    expect(update?.publisherDescription).toBe(PAGE_DESCRIPTION);
    expect(item.publisherDescription).toBe(PAGE_DESCRIPTION);
  });

  it("serves the page over HTTP and 404s anything else", async () => {
    const port = await listeningPort();

    const page = await get(port, `/${EMPTY_DESCRIPTION_PAGE}`);
    expect(page.status).toBe(200);
    expect(page.contentType).toContain("text/html");
    expect(page.body).toContain(PAGE_DESCRIPTION);

    const missing = await get(port, "/not-a-page.html");
    expect(missing.status).toBe(404);
  });
});

// The seeded "Article with a duplicate lead photo credit" scenario (#1305): a
// caption-only <figure> whose credit the publisher repeats as a paragraph above
// the body, with a hero set. These tests keep the seed item, the committed page,
// and the fixture server in step.
describe("Duplicate lead photo credit fixture scenario (#1305)", () => {
  function seededCreditCaptionItem(): FeedItem {
    const item = seededItems().find(
      (entry) => entry.link === CREDIT_CAPTION_LINK,
    );
    if (!item) throw new Error("Seeded credit-caption article not found.");
    return item;
  }

  it("seeds an article with a hero that links to the page", () => {
    const item = seededCreditCaptionItem();

    expect(item.coverImage).toBe(CREDIT_CAPTION_HERO_URL);
    // No feed description, so nothing else competes to be the article lead.
    expect(item.description).toBe("");
  });

  it("keeps the caption and both repeated paragraphs in the fetched page", () => {
    const html = readFileSync(
      join(FIXTURE_PAGES_DIR, CREDIT_CAPTION_PAGE),
      "utf8",
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const articleHtml = new Readability(doc).parse()?.content ?? "";

    // The pairing runs on the page's own blocks, so the caption and the three
    // credit paragraphs must survive Readability for the scenario to hold.
    expect(articleHtml).toContain(
      "<figcaption>Photo credit: Jane Doe</figcaption>",
    );
    expect(articleHtml.match(/Photo credit: Jane Doe/g)).toHaveLength(3);
    expect(articleHtml).toContain("Photo credit: John Roe");
  });

  it("serves the page and its hero over HTTP", async () => {
    const port = await listeningPort();

    const page = await get(port, `/${CREDIT_CAPTION_PAGE}`);
    expect(page.status).toBe(200);
    expect(page.contentType).toContain("text/html");
    expect(page.body).toContain("Photo credit: Jane Doe");

    const hero = await getBytes(port, `/${CREDIT_CAPTION_HERO_FILE}`);
    expect(hero.status).toBe(200);
    expect(hero.contentType).toContain("image/png");
  });
});

// The two page-image scenarios (#812): each committed page declares an og:image
// that differs from the first image in its body, so the fetched version's hero
// can be told apart from the body-image fallback. One seeded article also has a
// feed cover, the other has none. These tests keep the seed items, the committed
// pages, and the fixture server in step.
describe("Page-image hero fixture scenarios (#812)", () => {
  function seededItem(link: string): FeedItem {
    const item = seededItems().find((entry) => entry.link === link);
    if (!item) throw new Error(`Seeded article not found for ${link}.`);
    return item;
  }

  it("seeds one article with a feed cover and one without", () => {
    expect(seededItem(OG_IMAGE_HERO_LINK).coverImage).not.toBe("");
    expect(seededItem(OG_IMAGE_NO_FEED_IMAGE_LINK).coverImage).toBe("");
  });

  it("declares a page image that differs from the first body image", () => {
    for (const page of [OG_IMAGE_HERO_PAGE, OG_IMAGE_NO_FEED_IMAGE_PAGE]) {
      const html = readFileSync(join(FIXTURE_PAGES_DIR, page), "utf8");
      const doc = new DOMParser().parseFromString(html, "text/html");
      // Read the declared image before Readability mutates the document, as the
      // reader's own fetch does.
      expect(
        extractPageImage(doc, `${FIXTURE_SERVER_ORIGIN}/${page}`),
        page,
      ).toBe(OG_IMAGE_URL);
      const articleHtml = new Readability(doc).parse()?.content ?? "";
      expect(articleHtml, page).toContain(OG_IMAGE_BODY_FILE);
      expect(articleHtml, page).not.toContain(OG_IMAGE_FILE);
    }
  });

  it("serves the pages and both images over HTTP", async () => {
    const port = await listeningPort();

    for (const page of [OG_IMAGE_HERO_PAGE, OG_IMAGE_NO_FEED_IMAGE_PAGE]) {
      const response = await get(port, `/${page}`);
      expect(response.status, page).toBe(200);
      expect(response.contentType, page).toContain("text/html");
    }

    for (const file of [OG_IMAGE_FILE, OG_IMAGE_BODY_FILE]) {
      const image = await getBytes(port, `/${file}`);
      expect(image.status, file).toBe(200);
      expect(image.contentType, file).toContain("image/png");
    }
  });
});

// The seeded "User-Agent echo (fixture)" feed (#1162 test drive): refresh it
// with the server running and the terminal prints the headers the fetch sent.
// These tests keep the seed, the address, and the printed lines in step, so the
// check stays usable without a hand-rolled server.
describe("User-Agent echo fixture (#1162)", () => {
  function seededFeed(): { title: string; url: string } {
    const data = JSON.parse(
      readFileSync(
        join(TEMPLATE_DIR, "rss-dashboard-data", "data.json"),
        "utf8",
      ),
    ) as { feeds: Array<{ title: string; url: string }> };
    const feed = data.feeds.find((entry) =>
      entry.url.includes(FIXTURE_FEED_PATH),
    );
    if (!feed) throw new Error("Seeded User-Agent echo feed not found.");
    return feed;
  }

  it("seeds a feed whose address is the fixture server's feed path", () => {
    const feed = seededFeed();

    expect(feed.title).toBe("User-Agent echo (fixture)");
    expect(feed.url).toBe(FIXTURE_FEED_URL);
  });

  it("matches only the feed path, ignoring a query", () => {
    expect(isFixtureFeedPath(FIXTURE_FEED_PATH)).toBe(true);
    expect(isFixtureFeedPath(`${FIXTURE_FEED_PATH}?cache=1`)).toBe(true);
    expect(isFixtureFeedPath(`${FIXTURE_FEED_PATH}/extra`)).toBe(false);
    expect(isFixtureFeedPath(`/${EMPTY_DESCRIPTION_PAGE}`)).toBe(false);
    expect(isFixtureFeedPath("/")).toBe(false);
  });

  it("serves a valid feed at that address", async () => {
    const port = await listeningPort();

    const feed = await get(port, FIXTURE_FEED_PATH);

    expect(feed.status).toBe(200);
    expect(feed.contentType).toContain("application/rss+xml");
    expect(feed.body).toContain("<rss");
    expect(feed.body).toContain("<title>User-Agent echo (fixture)</title>");
    expect(feed.body).toContain(`http://127.0.0.1:${port}/echoed/1`);
  });

  it("prints the identity headers the request carried", async () => {
    const port = await listeningPort();
    const logged: string[] = [];
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.map((arg) => String(arg)).join(" "));
      });

    try {
      await get(port, FIXTURE_FEED_PATH, {
        "User-Agent": "rss-dashboard-test/1.0",
        "sec-ch-ua": '"Chromium";v="120"',
      });
    } finally {
      logSpy.mockRestore();
    }

    const output = logged.join("\n");
    expect(output).toContain(`GET ${FIXTURE_FEED_PATH} -> 200 (fixture feed)`);
    expect(output).toContain("user-agent: rss-dashboard-test/1.0");
    expect(output).toContain('sec-ch-ua: "Chromium";v="120"');
    // A header the request omitted must be visibly absent, not blank: that
    // difference is what tells an override apart from no override.
    expect(output).toContain("sec-ch-ua-platform: (not sent)");
  });

  it("reports a missing identity header as not sent", () => {
    expect(describeRequestIdentity({})).toContain("user-agent: (not sent)");
    expect(
      describeRequestIdentity({ "user-agent": "obsidian/1.14.4" }),
    ).toContain("user-agent: obsidian/1.14.4");
  });
});

// The feed-advertising page (#1201): the Add feed and Edit feed dialogs' Load
// must resolve a page address to the feed it advertises, the same one Save adds.
// These tests keep the committed page, its advertised address, and the served
// feed in step, so the dialog can be checked without a hand-rolled server.
describe("Feed-advertising fixture page (#1201)", () => {
  it("is served as a page that is not a feed", async () => {
    const port = await listeningPort();
    const page = await get(port, `/${FEED_ADVERTISING_PAGE}`);

    expect(page.status).toBe(200);
    expect(page.contentType).toContain("text/html");
    expect(page.body).toContain("WordPress");
    expect(isValidFeed(page.body)).toBe(false);
  });

  it("advertises the feed the fixture server serves", async () => {
    const port = await listeningPort();
    const page = await get(port, `/${FEED_ADVERTISING_PAGE}`);

    // Discovery reads the link's href and fetches it, so a rename of the feed
    // path must fail here rather than silently unlink the page from its feed.
    expect(page.body).toContain(`href="${FIXTURE_FEED_PATH}"`);

    const feed = await get(port, FIXTURE_FEED_PATH);
    expect(isValidFeed(feed.body)).toBe(true);
  });
});

describe("Fixture server file mapping (#1169)", () => {
  it("maps only committed pages and images in the pages folder", () => {
    expect(resolveFixtureFile(`/${EMPTY_DESCRIPTION_PAGE}`)).toMatchObject({
      name: EMPTY_DESCRIPTION_PAGE,
      contentType: "text/html; charset=utf-8",
    });
    expect(resolveFixtureFile(`/${CREDIT_CAPTION_PAGE}`)).toMatchObject({
      name: CREDIT_CAPTION_PAGE,
      contentType: "text/html; charset=utf-8",
    });
    expect(resolveFixtureFile(`/${CREDIT_CAPTION_HERO_FILE}`)).toMatchObject({
      name: CREDIT_CAPTION_HERO_FILE,
      contentType: "image/png",
    });
    expect(resolveFixtureFile(`/${OG_IMAGE_HERO_PAGE}`)).toMatchObject({
      name: OG_IMAGE_HERO_PAGE,
      contentType: "text/html; charset=utf-8",
    });
    expect(resolveFixtureFile(`/${OG_IMAGE_NO_FEED_IMAGE_PAGE}`)).toMatchObject(
      {
        name: OG_IMAGE_NO_FEED_IMAGE_PAGE,
        contentType: "text/html; charset=utf-8",
      },
    );
    expect(resolveFixtureFile(`/${OG_IMAGE_FILE}`)).toMatchObject({
      name: OG_IMAGE_FILE,
      contentType: "image/png",
    });
    expect(resolveFixtureFile(`/${OG_IMAGE_BODY_FILE}`)).toMatchObject({
      name: OG_IMAGE_BODY_FILE,
      contentType: "image/png",
    });
    expect(resolveFixtureFile(`/${FEED_ADVERTISING_PAGE}`)).toMatchObject({
      name: FEED_ADVERTISING_PAGE,
      contentType: "text/html; charset=utf-8",
    });
    expect(resolveFixtureFile(`/${COUNTER_IMAGE_FILE}`)).toMatchObject({
      name: COUNTER_IMAGE_FILE,
      contentType: "image/gif",
    });
    expect(resolveFixtureFile(`/${URL_PATTERN_PIXEL_FILE}`)).toMatchObject({
      name: URL_PATTERN_PIXEL_FILE,
      contentType: "image/png",
    });
    expect(resolveFixtureFile("/missing.html")).toBeNull();
    expect(resolveFixtureFile("/fixture-server.mjs")).toBeNull();
    expect(resolveFixtureFile("/../scripts/fixture-server.mjs")).toBeNull();
    expect(resolveFixtureFile("/")).toBeNull();
  });

  it("refuses encoded traversal and names outside the folder listing", () => {
    expect(resolveFixtureFile("/%2e%2e%2fpackage.json")).toBeNull();
    expect(resolveFixtureFile("/..%2F..%2Fsecret.html")).toBeNull();
    expect(resolveFixtureFile("/..%5Csecret.html")).toBeNull();
    expect(resolveFixtureFile("/..html")).toBeNull();
    expect(resolveFixtureFile("/%E0%A4%A.html")).toBeNull();
  });

  it("serves the seeded counter and pixel as real images, not 404s (#1169)", async () => {
    const port = await listeningPort();

    // The counter only reproduces the defect when it genuinely loads; a 404
    // takes the card's error path and hides it, so the response must be a GIF.
    const counter = await getBytes(port, `/${COUNTER_IMAGE_FILE}`);
    expect(counter.status).toBe(200);
    expect(counter.contentType).toContain("image/gif");
    expect(counter.body.subarray(0, 6).toString("latin1")).toMatch(
      /^GIF8[79]a$/,
    );

    const pixel = await getBytes(port, `/${URL_PATTERN_PIXEL_FILE}`);
    expect(pixel.status).toBe(200);
    expect(pixel.contentType).toContain("image/png");
    expect(Array.from(pixel.body.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });
});
