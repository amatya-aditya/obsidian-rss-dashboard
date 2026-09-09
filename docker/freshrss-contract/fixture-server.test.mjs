/**
 * Real, runnable-without-Docker tests for the deterministic fixture HTTP
 * server. These use Node's built-in test runner (`node --test`), not
 * Vitest: they live outside `test_files/unit/`, so the ordinary
 * `npm run test:unit` suite (whose Vitest config only discovers
 * `test_files/unit/**\/*.test.ts`) never picks them up and gains no
 * dependency on this harness. Run them directly with:
 *
 *   node --test docker/freshrss-contract
 *
 * The server itself only ever binds to the loopback interface for this
 * test, so this exercises real HTTP behavior without requiring Docker or
 * any external network access.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFixtureServer, loadFixtureRoutes } from "./fixture-server.mjs";
import { FIXTURE_FEEDS, totalFixtureArticleCount, findFixtureFeed } from "./fixtures/manifest.mjs";

test("fixture manifest declares at least two categorized feeds and one uncategorized feed", () => {
  const categorized = FIXTURE_FEEDS.filter((feed) => feed.category !== null);
  const uncategorized = FIXTURE_FEEDS.filter((feed) => feed.category === null);
  assert.ok(categorized.length >= 2, "expected at least two categorized fixture feeds");
  assert.ok(uncategorized.length >= 1, "expected at least one uncategorized fixture feed");
  // Every categorized feed must have a distinct category so the read
  // contract can prove per-category discovery, not just per-feed.
  const categoryNames = new Set(categorized.map((feed) => feed.category));
  assert.equal(categoryNames.size, categorized.length, "categorized fixture feeds must use distinct categories");
});

test("loadFixtureRoutes serves every manifest feed byte-for-byte and deterministically", () => {
  const routesA = loadFixtureRoutes();
  const routesB = loadFixtureRoutes();

  for (const feed of FIXTURE_FEEDS) {
    const route = `/${feed.fileName}`;
    assert.ok(routesA.has(route), `expected a route for ${route}`);
    const bodyA = routesA.get(route)?.body;
    const bodyB = routesB.get(route)?.body;
    assert.equal(bodyA, bodyB, `${route} must be byte-identical across independent loads`);
    for (const article of feed.articles) {
      assert.ok(bodyA?.includes(article.guid), `${route} must contain guid ${article.guid}`);
      assert.ok(bodyA?.includes(article.title), `${route} must contain title ${article.title}`);
    }
  }
});

test("createFixtureServer serves each fixture feed over real loopback HTTP with the right content type", async () => {
  const { url, close } = await createFixtureServer(0);
  try {
    for (const feed of FIXTURE_FEEDS) {
      const response = await fetch(`${url}/${feed.fileName}`);
      assert.equal(response.status, 200);
      const contentType = response.headers.get("content-type") ?? "";
      assert.ok(
        feed.format === "atom" ? contentType.includes("atom+xml") : contentType.includes("rss+xml"),
        `unexpected content-type for ${feed.fileName}: ${contentType}`,
      );
      const body = await response.text();
      for (const article of feed.articles) {
        assert.ok(body.includes(article.guid));
        assert.ok(body.includes(article.title));
      }
    }
  } finally {
    await close();
  }
});

test("createFixtureServer exposes a deterministic /healthz route", async () => {
  const { url, close } = await createFixtureServer(0);
  try {
    const response = await fetch(`${url}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
  } finally {
    await close();
  }
});

test("createFixtureServer returns 404 for unknown routes", async () => {
  const { url, close } = await createFixtureServer(0);
  try {
    const response = await fetch(`${url}/not-a-fixture.xml`);
    assert.equal(response.status, 404);
  } finally {
    await close();
  }
});

test("findFixtureFeed and totalFixtureArticleCount stay consistent with the manifest", () => {
  assert.equal(
    totalFixtureArticleCount(),
    FIXTURE_FEEDS.reduce((sum, feed) => sum + feed.articles.length, 0),
  );
  assert.equal(findFixtureFeed("feed-a").title, "Contract Feed A");
  assert.throws(() => findFixtureFeed("does-not-exist"));
});
