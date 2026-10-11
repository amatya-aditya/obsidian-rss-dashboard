// Serves the committed fixture pages over HTTP for manual testing, so a
// scenario that needs the Reader to fetch an article page can point at a page
// owned by this repository instead of an off-repo server. See "Fixture pages
// and the fixture server" in docs/development/fixture-vault.md.
//
//   npm run fixture:serve
//
// Dependency-free: it uses Node's built-in http module. It serves only the
// .html files directly inside the pages folder, on the host and port the seed
// data points at.

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EMPTY_DESCRIPTION_PAGE,
  FIXTURE_PAGES_DIR,
  FIXTURE_SERVER_HOST,
  FIXTURE_SERVER_PORT,
} from "./generate-fixture-vault.mjs";

/**
 * Maps a request path to a committed fixture page, or null when it names no
 * page in the folder. Only a bare `<name>.html` at the folder root is served,
 * so a path with slashes or `..` can never escape it.
 */
export function resolveFixturePage(requestPath) {
  const [pathname = ""] = requestPath.split(/[?#]/);
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!/^\/[A-Za-z0-9._-]+\.html$/.test(decoded)) return null;

  const name = decoded.slice(1);
  const file = join(FIXTURE_PAGES_DIR, name);
  return existsSync(file) ? { name, file } : null;
}

/** A server that answers each request from the fixture pages folder. */
export function createFixtureServer() {
  return createServer((request, response) => {
    const requestPath = request.url ?? "/";
    const page =
      request.method === "GET" ? resolveFixturePage(requestPath) : null;

    if (!page) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }

    const body = readFileSync(page.file);
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(body.byteLength),
    });
    response.end(body);
    console.log(`GET ${requestPath} -> 200 (${page.name})`);
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
