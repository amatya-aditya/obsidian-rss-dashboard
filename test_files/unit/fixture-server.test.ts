import { readFileSync } from "node:fs";
import { request, type Server } from "node:http";
import { join } from "node:path";
import { Readability } from "@mozilla/readability";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_DESCRIPTION_LINK,
  EMPTY_DESCRIPTION_PAGE,
  FIXTURE_FEED_PATH,
  FIXTURE_FEED_URL,
  FIXTURE_PAGES_DIR,
  TEMPLATE_DIR,
} from "../../scripts/generate-fixture-vault.mjs";
import {
  describeRequestIdentity,
  isFixtureFeedPath,
  resolveFixturePage,
  startFixtureServer,
} from "../../scripts/fixture-server.mjs";
import {
  extractPageMetadata,
  resolveArticleMetadata,
} from "../../src/utils/article-metadata";
import { applyArticleMetadata } from "../../src/utils/article-metadata-persistence";
import { hasMeaningfulArticleContent } from "../../src/utils/reader-html-cleanup";
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

  it("maps only committed page names to files in the pages folder", () => {
    expect(resolveFixturePage(`/${EMPTY_DESCRIPTION_PAGE}`)?.name).toBe(
      EMPTY_DESCRIPTION_PAGE,
    );
    expect(resolveFixturePage("/missing.html")).toBeNull();
    expect(resolveFixturePage("/../scripts/fixture-server.mjs")).toBeNull();
    expect(resolveFixturePage("/")).toBeNull();
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
