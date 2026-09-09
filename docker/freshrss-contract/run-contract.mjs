#!/usr/bin/env node
/**
 * FreshRSS pinned Docker read-contract runner (ticket 11 of the FreshRSS
 * portable-state-client workstream).
 *
 * This is intentionally a separate command from `npm run test:unit`: it
 * requires a working Docker daemon and issues real HTTP requests against a
 * disposable, compose-scoped FreshRSS container. See
 * `docs/development/freshrss-docker-contract.md` for prerequisites, what
 * this proves, and its finite compatibility claim.
 *
 * Usage: `node docker/freshrss-contract/run-contract.mjs [--keep]`
 *   --keep   Skip teardown on success (for local debugging). Teardown still
 *            always runs on failure, and always runs unless this flag is
 *            explicitly passed.
 *
 * Exit code is 0 only when every readiness check and scenario passed.
 *
 * IMPORTANT: as of this writing, this script has not yet been executed
 * against a live Docker daemon in any environment (see
 * docs/development/freshrss-docker-contract.md, "Status of this harness").
 * It was written to be correct against FreshRSS's documented Docker
 * Compose conventions and its documented/observed Google-Reader-API
 * response shapes, but the very first real run is still outstanding.
 */

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

import { waitFor } from "./lib/wait-for.mjs";
import { buildContractArtifact } from "./lib/artifact.mjs";
import {
  clientLogin,
  readOnlyProbe,
  modificationTokenProbe,
  listSubscriptions,
  listTags,
  listItemIds,
  getItemContents,
  editTag,
} from "./lib/greader-client.mjs";
import { FIXTURE_FEEDS, findFixtureFeed } from "./fixtures/manifest.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = path.join(__dirname, "docker-compose.yml");
const ENV_FILE = path.join(__dirname, ".env");

const PINNED_IMAGE = {
  reference: "ghcr.io/freshrss/freshrss:1.29.1@sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d",
  tag: "1.29.1",
  digest: "sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d",
};

const FRESHRSS_READ_STREAM_ID = "user/-/state/com.google/read";

function loadEnvFile(filePath) {
  const contents = readFileSync(filePath, "utf8");
  /** @type {Record<string, string>} */
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return values;
}

function runCompose(args, { silent = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", COMPOSE_FILE, "--env-file", ENV_FILE, ...args], {
      stdio: silent ? "pipe" : "inherit",
      env: process.env,
    });
    let stderr = "";
    if (silent) {
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`docker compose ${args.join(" ")} exited with code ${code}${stderr ? `: ${stderr}` : ""}`));
    });
  });
}

async function execCompose(args) {
  const { stdout } = await execFileAsync("docker", [
    "compose",
    "-f",
    COMPOSE_FILE,
    "--env-file",
    ENV_FILE,
    ...args,
  ]);
  return stdout;
}

/** Tracks which relative API paths were actually exercised, for the CI artifact. */
function makePathTracker() {
  const paths = new Set();
  return {
    record: (relativePath) => paths.add(relativePath),
    list: () => [...paths],
  };
}

async function main() {
  const keepOnSuccess = process.argv.includes("--keep");
  const startedAt = new Date().toISOString();
  const env = loadEnvFile(ENV_FILE);
  const baseUrl = `http://127.0.0.1:${env.FRESHRSS_PUBLISHED_PORT}/api/greader.php`;
  const paths = makePathTracker();
  /** @type {Array<{ name: string, passed: boolean, detail?: string }>} */
  const scenarios = [];
  const readiness = {
    reachable: false,
    clientLogin: false,
    readProbe: false,
    modificationTokenProbe: false,
    fixtureDataObserved: false,
  };
  let freshRssVersion = null;
  let torndown = false;

  const teardown = async () => {
    if (torndown) return;
    torndown = true;
    console.log("Tearing down the FreshRSS contract compose project and its test-owned volume...");
    await runCompose(["down", "--volumes", "--remove-orphans"]).catch((error) => {
      console.error("Teardown failed — inspect the project manually with `docker compose ls`:", error);
    });
  };

  process.on("SIGINT", () => {
    teardown().finally(() => process.exit(130));
  });

  try {
    console.log(`Pinned FreshRSS image: ${PINNED_IMAGE.reference}`);
    console.log("Starting the FreshRSS Docker read-contract compose project...");
    await runCompose(["up", "-d", "--build", "--wait", "--wait-timeout", "180"]);

    // --- Readiness: reachability, ClientLogin, an authenticated read-only
    // probe, and a modification-token probe. HTTP liveness alone (compose's
    // own healthcheck) is not sufficient per the contract.
    let authToken = null;
    const loginWait = await waitFor(
      async () => {
        const result = await clientLogin({
          baseUrl,
          username: env.FRESHRSS_ADMIN_USER,
          password: env.FRESHRSS_ADMIN_API_PASSWORD,
        });
        paths.record("/api/greader.php/accounts/ClientLogin");
        readiness.reachable = true;
        return result.ok ? result : false;
      },
      { timeoutMs: 120_000, intervalMs: 3_000 },
    );
    if (!loginWait.ready) {
      throw new Error("FreshRSS never accepted ClientLogin within the readiness window.");
    }
    authToken = loginWait.result.authToken;
    readiness.clientLogin = true;

    const readProbe = await readOnlyProbe({ baseUrl, authToken });
    paths.record("/api/greader.php/reader/api/0/user-info");
    readiness.readProbe = readProbe.ok === true;
    scenarios.push({ name: "authenticated read-only probe", passed: readiness.readProbe });

    const tokenProbe = await modificationTokenProbe({ baseUrl, authToken });
    paths.record("/api/greader.php/reader/api/0/token");
    readiness.modificationTokenProbe = tokenProbe.ok === true;
    scenarios.push({ name: "modification-token probe", passed: readiness.modificationTokenProbe });

    // --- Seed the deterministic fixture subscriptions via the FreshRSS CLI,
    // then force one synchronous refresh so article content is ingested
    // without waiting on the (disabled) cron.
    console.log("Seeding fixture subscriptions via cli/import-for-user.php...");
    await execCompose([
      "exec",
      "-T",
      "freshrss",
      "cli/import-for-user.php",
      "--user",
      env.FRESHRSS_ADMIN_USER,
      "--filename",
      "/contract-fixtures/seed-subscriptions.opml",
    ]);
    await execCompose(["exec", "-T", "freshrss", "cli/actualize-user.php", "--user", env.FRESHRSS_ADMIN_USER]);

    try {
      const { stdout: versionOutput } = await execFileAsync("docker", [
        "compose",
        "-f",
        COMPOSE_FILE,
        "--env-file",
        ENV_FILE,
        "exec",
        "-T",
        "freshrss",
        "php",
        "-r",
        "require 'constants.php'; echo FRESHRSS_VERSION;",
      ]);
      freshRssVersion = versionOutput.trim() || null;
    } catch (error) {
      console.warn("Could not read the reported FreshRSS version:", error);
    }

    // --- Subscription/tag discovery. Match fixtures by their (known,
    // stable) fixture-server URL, never by an assumed opaque FreshRSS ID.
    const subscriptionWait = await waitFor(
      async () => {
        const result = await listSubscriptions({ baseUrl, authToken });
        paths.record("/api/greader.php/reader/api/0/subscription/list");
        if (!result.ok) return false;
        const matched = FIXTURE_FEEDS.every((feed) =>
          result.subscriptions.some((sub) => sub.url?.includes(feed.fileName)),
        );
        return matched ? result : false;
      },
      { timeoutMs: 60_000, intervalMs: 2_000 },
    );
    const subscriptionsDiscovered = subscriptionWait.ready;
    scenarios.push({
      name: "subscription discovery (all fixture feeds present, matched by URL)",
      passed: subscriptionsDiscovered,
    });

    /** @type {Map<string, string>} logical feed id -> opaque FreshRSS subscription id */
    const opaqueSubscriptionIds = new Map();
    let categoriesCorrect = false;
    if (subscriptionsDiscovered) {
      const subscriptions = subscriptionWait.result.subscriptions;
      for (const feed of FIXTURE_FEEDS) {
        const match = subscriptions.find((sub) => sub.url?.includes(feed.fileName));
        if (match) opaqueSubscriptionIds.set(feed.logicalId, match.id);
      }
      const categorized = FIXTURE_FEEDS.filter((feed) => feed.category !== null);
      const uncategorized = FIXTURE_FEEDS.filter((feed) => feed.category === null);
      categoriesCorrect =
        categorized.every((feed) => {
          const match = subscriptions.find((sub) => sub.url?.includes(feed.fileName));
          const categoryLabel = match?.categories?.find((category) => category.label)?.label;
          return categoryLabel === feed.category;
        }) &&
        uncategorized.every((feed) => {
          const match = subscriptions.find((sub) => sub.url?.includes(feed.fileName));
          return !match?.categories || match.categories.length === 0;
        });
    }
    scenarios.push({ name: "categorized vs. uncategorized placement matches fixtures", passed: categoriesCorrect });

    const tagsResult = await listTags({ baseUrl, authToken });
    paths.record("/api/greader.php/reader/api/0/tag/list");
    scenarios.push({ name: "tag/label discovery returns a valid list", passed: tagsResult.ok === true });

    readiness.fixtureDataObserved = subscriptionsDiscovered && categoriesCorrect;

    // --- Item-ID enumeration (paged) and content retrieval for feed-a,
    // requesting a page size smaller than its article count so a real
    // continuation cursor is exercised.
    let itemEnumerationPassed = false;
    let firstArticleRemoteId = null;
    const feedA = findFixtureFeed("feed-a");
    const feedASubscriptionId = opaqueSubscriptionIds.get("feed-a");
    if (feedASubscriptionId) {
      const firstPage = await listItemIds({ baseUrl, authToken, streamId: feedASubscriptionId, n: 2 });
      paths.record("/api/greader.php/reader/api/0/stream/items/ids");
      const secondPage =
        firstPage.ok && firstPage.continuation
          ? await listItemIds({
              baseUrl,
              authToken,
              streamId: feedASubscriptionId,
              n: 2,
              continuation: firstPage.continuation,
            })
          : null;

      const allIds = [...(firstPage.ok ? firstPage.itemRefs : []), ...(secondPage?.ok ? secondPage.itemRefs : [])];
      itemEnumerationPassed =
        firstPage.ok === true &&
        firstPage.continuation !== null &&
        secondPage?.ok === true &&
        allIds.length === feedA.articles.length;

      if (allIds.length > 0) {
        firstArticleRemoteId = allIds[0];
        const contents = await getItemContents({ baseUrl, authToken, itemIds: allIds });
        paths.record("/api/greader.php/reader/api/0/stream/items/contents");
        const titlesMatch =
          contents.ok &&
          feedA.articles.every((article) => contents.items.some((item) => item.title === article.title));
        scenarios.push({ name: "content retrieval returns fixture article titles", passed: Boolean(titlesMatch) });
      }
    }
    scenarios.push({
      name: "item-ID enumeration pages correctly (continuation cursor exercised)",
      passed: itemEnumerationPassed,
    });

    // --- Mutation: mark one article read, verify the exact "OK" acknowledgment
    // body, and confirm it is observable through the read-state stream.
    let mutationPassed = false;
    if (firstArticleRemoteId) {
      const freshToken = await modificationTokenProbe({ baseUrl, authToken });
      paths.record("/api/greader.php/reader/api/0/token");
      if (freshToken.ok) {
        const mutation = await editTag({
          baseUrl,
          authToken,
          modificationToken: freshToken.token,
          itemIds: [firstArticleRemoteId],
          action: "add",
          streamId: FRESHRSS_READ_STREAM_ID,
        });
        paths.record("/api/greader.php/reader/api/0/edit-tag");
        if (mutation.ok) {
          const readStream = await listItemIds({
            baseUrl,
            authToken,
            streamId: FRESHRSS_READ_STREAM_ID,
            n: 100,
          });
          mutationPassed = readStream.ok === true && readStream.itemRefs.includes(firstArticleRemoteId);
        }
      }
    }
    scenarios.push({ name: "read-state mutation acknowledged and observable", passed: mutationPassed });

    // --- Restart persistence: restart the FreshRSS container against the
    // same test-owned volume and confirm the seeded subscriptions and the
    // mutation above both survived, without reseeding anything.
    console.log("Restarting the FreshRSS container to prove volume persistence...");
    await runCompose(["restart", "freshrss"]);
    await runCompose(["up", "-d", "--wait", "--wait-timeout", "120", "freshrss"]);

    const postRestartLogin = await waitFor(
      async () => {
        const result = await clientLogin({
          baseUrl,
          username: env.FRESHRSS_ADMIN_USER,
          password: env.FRESHRSS_ADMIN_API_PASSWORD,
        });
        return result.ok ? result : false;
      },
      { timeoutMs: 90_000, intervalMs: 3_000 },
    );

    let restartPersistencePassed = false;
    if (postRestartLogin.ready) {
      const postRestartToken = postRestartLogin.result.authToken;
      const postRestartSubscriptions = await listSubscriptions({ baseUrl, authToken: postRestartToken });
      const subscriptionsPreserved =
        postRestartSubscriptions.ok === true &&
        FIXTURE_FEEDS.every((feed) => postRestartSubscriptions.subscriptions.some((sub) => sub.url?.includes(feed.fileName)));

      let readStatePreserved = false;
      if (firstArticleRemoteId) {
        const postRestartReadStream = await listItemIds({
          baseUrl,
          authToken: postRestartToken,
          streamId: FRESHRSS_READ_STREAM_ID,
          n: 100,
        });
        readStatePreserved =
          postRestartReadStream.ok === true && postRestartReadStream.itemRefs.includes(firstArticleRemoteId);
      }

      restartPersistencePassed = subscriptionsPreserved && (firstArticleRemoteId ? readStatePreserved : true);
    }
    scenarios.push({
      name: "restart against the same test-owned volume preserves seeded account and contract data",
      passed: restartPersistencePassed,
    });

    const finishedAt = new Date().toISOString();
    const artifact = buildContractArtifact({
      image: PINNED_IMAGE,
      freshRssVersion,
      readiness,
      exercisedApiPaths: paths.list(),
      scenarios,
      startedAt,
      finishedAt,
    });

    const artifactsDir = path.join(__dirname, "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    const artifactPath = path.join(artifactsDir, `contract-result-${finishedAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    console.log(`Wrote contract artifact: ${artifactPath}`);
    console.log(JSON.stringify(artifact, null, 2));

    assert.equal(typeof artifact.overallPassed, "boolean");
    if (!artifact.overallPassed) {
      process.exitCode = 1;
    }

    if (artifact.overallPassed && keepOnSuccess) {
      console.log("--keep passed: leaving the compose project running for inspection.");
      torndown = true; // Skip the finally-block teardown below.
    }
  } catch (error) {
    console.error("FreshRSS Docker contract run failed:", error);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
}

main();
