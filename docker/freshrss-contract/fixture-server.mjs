#!/usr/bin/env node
/**
 * Deterministic RSS/Atom fixture HTTP server for the FreshRSS Docker read
 * contract (ticket 11 of the FreshRSS portable-state-client workstream).
 *
 * This server has nothing to do with the Obsidian plugin runtime. It exists
 * purely so the pinned FreshRSS container has something deterministic to
 * subscribe to: it serves the fixed XML files under `fixtures/` byte-for-byte
 * on every request (read once at startup, never regenerated), plus a
 * `/healthz` route. It is intentionally plain Node (no bundler, no
 * dependencies) so it can run unmodified both as a standalone process (for
 * `fixture-server.test.mjs`, which needs no Docker or network access beyond
 * the loopback interface) and inside the `fixture-server` container defined
 * by `docker-compose.yml`.
 *
 * Usage as a script: `node fixture-server.mjs` (reads `PORT`, defaults 8081).
 * Usage as a module: `import { createFixtureServer } from "./fixture-server.mjs"`.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { FIXTURE_FEEDS } from "./fixtures/manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * Reads every fixture feed file into memory once. Returns a Map from
 * `/<fileName>` route to `{ body, contentType }`. Reading eagerly (rather
 * than per-request) is what makes the server's responses byte-identical and
 * deterministic across the whole contract run, including after a FreshRSS
 * container restart.
 */
export function loadFixtureRoutes() {
  const routes = new Map();
  for (const feed of FIXTURE_FEEDS) {
    const filePath = path.join(FIXTURES_DIR, feed.fileName);
    const body = readFileSync(filePath, "utf8");
    const contentType =
      feed.format === "atom" ? "application/atom+xml; charset=utf-8" : "application/rss+xml; charset=utf-8";
    routes.set(`/${feed.fileName}`, { body, contentType });
  }
  return routes;
}

/**
 * Starts the fixture server on `port` (0 for an OS-assigned ephemeral port).
 * Returns the running `http.Server`, the resolved `port`, and a `close()`
 * helper. Every fixture route and `/healthz` are deterministic: the same
 * request always gets the same response body.
 */
export function createFixtureServer(port = 0) {
  const routes = loadFixtureRoutes();

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture-server.invalid");

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }

    if (url.pathname === "/healthz") {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("ok");
      return;
    }

    const route = routes.get(url.pathname);
    if (!route) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": route.contentType });
    response.end(request.method === "HEAD" ? undefined : route.body);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      resolve({
        server,
        port: resolvedPort,
        url: `http://127.0.0.1:${resolvedPort}`,
        close: () => new Promise((res) => server.close(() => res(undefined))),
      });
    });
  });
}

async function main() {
  const port = Number(process.env.PORT ?? "8081");
  const { url } = await createFixtureServer(port);
  console.log(`FreshRSS contract fixture server listening on ${url}`);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((error) => {
    console.error("Fixture server failed to start:", error);
    process.exitCode = 1;
  });
}
