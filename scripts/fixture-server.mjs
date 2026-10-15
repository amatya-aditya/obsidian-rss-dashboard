// Serves the committed fixture files over HTTP for manual testing, so a
// scenario that needs the Reader to fetch an article page, or a card to load a
// tracking counter, can point at a file owned by this repository instead of an
// off-repo server. It also answers one synthesized feed whose request headers
// it prints, so a tester can see what the plugin claims to be when it fetches.
// See "Fixture pages and the fixture server" in
// docs/development/fixture-vault.md.
//
//   npm run fixture:serve
//
// Dependency-free: it uses Node's built-in http module. It serves the .html
// pages and .gif/.png images directly inside the pages folder, plus the one
// feed address the seed data points at, on the host and port that data uses.

import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EMPTY_DESCRIPTION_PAGE,
  FIXTURE_FEED_PATH,
  FIXTURE_PAGES_DIR,
  FIXTURE_SERVER_HOST,
  FIXTURE_SERVER_PORT,
} from "./generate-fixture-vault.mjs";

// The committed files the server answers for, by extension, with the content
// type each one is served as. HTML backs the "Article with no feed
// description" scenario (#975); the images back the tracking-counter
// scenarios (#1169), whose counter only reproduces the defect when it loads.
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".gif", "image/gif"],
  [".png", "image/png"],
]);

// One file name with an allowed extension, at the folder root: no slashes, so
// a path or `..` can never escape the folder.
const SERVED_FILE_PATTERN = /^\/([A-Za-z0-9._-]+)(\.[A-Za-z0-9]+)$/;

/**
 * The headers a request can use to describe itself as a browser. A request that
 * claims to be Chrome without sending the `sec-ch-ua` family is the mismatch an
 * anti-bot filter reads as "not really a browser"; printing all four makes that
 * visible.
 */
const IDENTITY_HEADERS = [
  "user-agent",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
];

/**
 * Maps a request path to a committed fixture file, or null when it names no
 * servable file in the folder. Only a bare `<name>.<ext>` at the folder root
 * is served: the request is matched against the folder's own listing, and the
 * file path is built from that listing, so no part of the request ever reaches
 * the path.
 */
export function resolveFixtureFile(requestPath) {
  const [pathname = ""] = requestPath.split(/[?#]/);
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const match = SERVED_FILE_PATTERN.exec(decoded);
  if (!match) return null;
  const extension = match[2];
  const contentType = CONTENT_TYPES.get(extension.toLowerCase());
  if (!contentType) return null;

  const requested = decoded.slice(1);
  const name = listFixtureFiles().find((file) => file === requested);
  return name
    ? { name, file: join(FIXTURE_PAGES_DIR, name), contentType }
    : null;
}

/** The servable files directly inside the pages folder, read per request. */
function listFixtureFiles() {
  try {
    return readdirSync(FIXTURE_PAGES_DIR, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          CONTENT_TYPES.has(extname(entry.name).toLowerCase()),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Whether a request path names the synthesized feed. A query is ignored. */
export function isFixtureFeedPath(requestPath) {
  const [pathname = ""] = String(requestPath).split(/[?#]/);
  return pathname === FIXTURE_FEED_PATH;
}

/**
 * What the request said about itself, one indented line per identity header, so
 * the terminal shows the request the plugin actually made. A header the request
 * omitted reads `(not sent)`: telling that apart from an override is the point
 * of this fixture.
 */
export function describeRequestIdentity(headers) {
  return IDENTITY_HEADERS.map((name) => {
    const value = headers?.[name];
    return `    ${name}: ${value === undefined ? "(not sent)" : value}`;
  }).join("\n");
}

/**
 * The feed the seeded "User-Agent echo (fixture)" feed points at. `origin` is
 * the address the request came in on, so the links match whichever port the
 * server is listening on.
 */
export function fixtureFeedXml(origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>User-Agent echo (fixture)</title>
    <link>${origin}/</link>
    <description>Served by the fixture server, which prints the request's identity headers.</description>
    <item>
      <title>First echoed article</title>
      <link>${origin}/echoed/1</link>
      <guid>${origin}/echoed/1</guid>
      <pubDate>Wed, 02 Sep 2026 12:00:00 GMT</pubDate>
      <description>Refresh this feed with the fixture server running and read the terminal.</description>
    </item>
    <item>
      <title>Second echoed article</title>
      <link>${origin}/echoed/2</link>
      <guid>${origin}/echoed/2</guid>
      <pubDate>Tue, 01 Sep 2026 12:00:00 GMT</pubDate>
      <description>The second item, so the feed has more than one entry.</description>
    </item>
  </channel>
</rss>`;
}

/** A server that answers each request from the fixture pages folder. */
export function createFixtureServer() {
  return createServer((request, response) => {
    const requestPath = request.url ?? "/";
    const host =
      request.headers.host ?? `${FIXTURE_SERVER_HOST}:${FIXTURE_SERVER_PORT}`;
    const origin = `http://${host}`;

    if (request.method === "GET" && isFixtureFeedPath(requestPath)) {
      const body = fixtureFeedXml(origin);
      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
        "content-length": String(Buffer.byteLength(body)),
      });
      response.end(body);
      console.log(`GET ${requestPath} -> 200 (fixture feed)`);
      console.log(describeRequestIdentity(request.headers));
      return;
    }

    const file =
      request.method === "GET" ? resolveFixtureFile(requestPath) : null;

    if (!file) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }

    const body = readFileSync(file.file);
    response.writeHead(200, {
      "content-type": file.contentType,
      "content-length": String(body.byteLength),
    });
    response.end(body);
    console.log(`GET ${requestPath} -> 200 (${file.name})`);
    console.log(describeRequestIdentity(request.headers));
  });
}

/** Starts the server and resolves with it once it is listening. */
export function startFixtureServer({
  port = FIXTURE_SERVER_PORT,
  host = FIXTURE_SERVER_HOST,
} = {}) {
  const server = createFixtureServer();
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve(server);
    });
  });
}

async function main() {
  try {
    const server = await startFixtureServer();
    const address = server.address();
    const port =
      address && typeof address === "object"
        ? address.port
        : FIXTURE_SERVER_PORT;
    console.log(
      `Serving fixture pages from ${FIXTURE_PAGES_DIR}\n` +
        `  http://${FIXTURE_SERVER_HOST}:${port}/${EMPTY_DESCRIPTION_PAGE}\n` +
        `  http://${FIXTURE_SERVER_HOST}:${port}${FIXTURE_FEED_PATH}\n` +
        "Each request prints the identity headers it carried.\n" +
        "Press Ctrl+C to stop.",
    );
  } catch (error) {
    console.error(
      `Could not start the fixture server: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
