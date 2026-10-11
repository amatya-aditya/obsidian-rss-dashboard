import { readFileSync } from "node:fs";
import { request, type Server } from "node:http";
import { join } from "node:path";
import { Readability } from "@mozilla/readability";
import { afterEach, describe, expect, it } from "vitest";

import {
  EMPTY_DESCRIPTION_LINK,
  EMPTY_DESCRIPTION_PAGE,
  FIXTURE_PAGES_DIR,
  TEMPLATE_DIR,
} from "../../scripts/generate-fixture-vault.mjs";
import {
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
): Promise<{ status: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path }, (res) => {
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
