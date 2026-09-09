#!/usr/bin/env node
/**
 * FreshRSS pinned Docker read/state/OPML-contract runner (ticket 11 and
 * ticket 12 of the FreshRSS portable-state-client workstream).
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
 * Ticket 12 extends ticket 11's read-only contract with:
 *   - deeper (3-page) item-ID pagination and a read/starred/mapped-label
 *     state-mutation scenario, each with a distinct control article proving
 *     the mutation did NOT leak onto an untouched article (feed-d);
 *   - restart persistence now covers all three mutated facets, not just one;
 *   - an OPML round-trip scenario: RSS Dashboard's real, production
 *     `generateFreshRssSubscriptionOpml` (ticket 09) export is imported into
 *     the live container mid-run, FreshRSS's own OPML export is parsed back,
 *     and the two are compared for URL/title/flat-category/duplicate-collapse
 *     agreement, plus confirming a pre-existing baseline subscription (feed-c)
 *     is untouched by the import;
 *   - a `findings` list on the artifact for a real, observed protocol-shape
 *     discrepancy this run turned up (see the tag/list scenario below) that
 *     is not itself a scenario failure but is worth a follow-up ticket.
 */

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

import { waitFor } from "./lib/wait-for.mjs";
import { buildContractArtifact } from "./lib/artifact.mjs";
import { loadFreshRssOpmlExportModule } from "./lib/opml-export-bridge.mjs";
import { parseFreshRssOpml, findOpmlEntriesByUrlFragment } from "./lib/opml-compare.mjs";
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
import { FIXTURE_FEEDS, OPML_ROUND_TRIP_FEED, findFixtureFeed } from "./fixtures/manifest.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = path.join(__dirname, "docker-compose.yml");
const ENV_FILE = path.join(__dirname, ".env");
const TMP_DIR = path.join(__dirname, "tmp");

const PINNED_IMAGE = {
  reference: "ghcr.io/freshrss/freshrss:1.29.1@sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d",
  tag: "1.29.1",
  digest: "sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d",
};

const FRESHRSS_READ_STREAM_ID = "user/-/state/com.google/read";
const FRESHRSS_STARRED_STREAM_ID = "user/-/state/com.google/starred";
/** Ticket 12: the mapped-label name the contract seeds via edit-tag onto one feed-d article. */
const CONTRACT_LABEL_NAME = "Contract Label";

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

/**
 * Pages through an entire item-ID stream via repeated `listItemIds` calls,
 * following the real continuation cursor FreshRSS returns, until a page
 * comes back with no continuation. Returns every collected item ID in
 * server-reported order plus the continuation value observed after each
 * page, so callers can assert both "a real cursor was exercised on an
 * early page" and "the final page reports no further continuation" (the
 * conservative completeness/no-false-completion signal ticket 12 asks the
 * contract to check compatibility with) without duplicating the paging loop
 * per scenario.
 *
 * @param {{ baseUrl: string, authToken: string, streamId: string, pageSize: number, paths: ReturnType<typeof makePathTracker> }} args
 */
async function enumerateAllItemIds({ baseUrl, authToken, streamId, pageSize, paths }) {
  /** @type {string[]} */
  const ids = [];
  /** @type {Array<string | null>} */
  const continuationsSeen = [];
  let continuation;
  let pageCount = 0;

  // Bounded by fixture size in practice, but cap defensively so a genuine
  // protocol mismatch (e.g. FreshRSS always returning a non-null
  // continuation) fails fast instead of looping forever.
  const MAX_PAGES = 25;

  do {
    if (pageCount >= MAX_PAGES) {
      return { ok: false, ids, continuationsSeen, reason: "exceeded MAX_PAGES without a null continuation" };
    }
    const page = await listItemIds({ baseUrl, authToken, streamId, n: pageSize, continuation });
    paths.record("/api/greader.php/reader/api/0/stream/items/ids");
    pageCount += 1;
    if (!page.ok) {
      return { ok: false, ids, continuationsSeen, reason: `page ${pageCount} request failed` };
    }
    ids.push(...page.itemRefs);
    continuationsSeen.push(page.continuation);
    continuation = page.continuation ?? undefined;
  } while (continuation);

  return { ok: true, ids, continuationsSeen, pageCount };
}

async function main() {
  const keepOnSuccess = process.argv.includes("--keep");
  const startedAt = new Date().toISOString();
  const env = loadEnvFile(ENV_FILE);
  const baseUrl = `http://127.0.0.1:${env.FRESHRSS_PUBLISHED_PORT}/api/greader.php`;
  const paths = makePathTracker();
  /** @type {Array<{ name: string, passed: boolean, detail?: string }>} */
  const scenarios = [];
  /** @type {string[]} */
  const findings = [];
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
    // Ticket 12: the run-scoped, writable scratch directory the OPML
    // round-trip scenario writes RSS Dashboard's generated export into (bind
    // mounted read-write at /contract-tmp; see docker-compose.yml). Created
    // fresh on every run; git-ignored.
    mkdirSync(TMP_DIR, { recursive: true });

    console.log(`Pinned FreshRSS image: ${PINNED_IMAGE.reference}`);
    console.log("Starting the FreshRSS Docker read/state/OPML-contract compose project...");
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
    // without waiting on the (disabled) cron. FIXTURE_FEEDS now includes
    // ticket 12's feed-d (state-mutation/paging fixture); feed-e (the OPML
    // round-trip fixture) is deliberately not part of this initial seed.
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
    /** Pre-import snapshot of feed-c's reported category, for the ticket 12 "baseline survives OPML import untouched" check below. */
    let baselineFeedCBefore = null;
    if (subscriptionsDiscovered) {
      const subscriptions = subscriptionWait.result.subscriptions;

      // Real-run finding: this pinned FreshRSS image auto-creates one demo
      // subscription for a brand-new account on first install
      // (`FRESHRSS_INSTALL`/`FRESHRSS_USER`), unrelated to anything this
      // harness seeds. It does not break any check here (every check below
      // uses `.some`/`.every` against the known fixtures, never an exact
      // subscription count), but it is worth recording explicitly so a
      // future contributor does not mistake it for a harness bug if they
      // ever do add a strict count assertion.
      const knownFileNames = new Set([...FIXTURE_FEEDS, OPML_ROUND_TRIP_FEED].map((feed) => feed.fileName));
      const unexpectedSubscriptions = subscriptions.filter(
        (sub) => ![...knownFileNames].some((fileName) => sub.url?.includes(fileName)),
      );
      if (unexpectedSubscriptions.length > 0) {
        findings.push(
          "FreshRSS's pinned image auto-creates one or more demo subscriptions for a brand-new account on " +
            `first install, unrelated to any fixture this harness seeds (observed: ${JSON.stringify(
              unexpectedSubscriptions.map((sub) => sub.url),
            )}). Every check in this harness matches fixtures by URL fragment rather than asserting an exact ` +
            "subscription count, so this does not affect any scenario result -- recorded here so it is not " +
            "mistaken for a harness bug later.",
        );
      }

      for (const feed of FIXTURE_FEEDS) {
        const match = subscriptions.find((sub) => sub.url?.includes(feed.fileName));
        if (match) opaqueSubscriptionIds.set(feed.logicalId, match.id);
      }
      const categorized = FIXTURE_FEEDS.filter((feed) => feed.category !== null);
      const uncategorized = FIXTURE_FEEDS.filter((feed) => feed.category === null);
      const categoryLabelFor = (feed) => {
        const match = subscriptions.find((sub) => sub.url?.includes(feed.fileName));
        return match?.categories?.find((category) => category.label)?.label ?? null;
      };

      // Real-run finding (first live execution of this harness): FreshRSS's
      // subscription/list response is NEVER `categories: []` for any feed --
      // every feed always belongs to some category, including its own
      // built-in default category for feeds with none explicitly assigned
      // (observed on this pinned English-locale instance as the literal
      // label "Uncategorized", auto-created and auto-assigned by FreshRSS
      // itself, not by anything this harness seeded). Ticket 11's original,
      // never-yet-run assumption (`!categories || categories.length === 0`)
      // was wrong the first time it actually ran against a live server. The
      // correct, locale-agnostic check: every uncategorized fixture reports
      // the SAME one default-category label (discovered here, never
      // hardcoded), and that label is distinct from every real category
      // name a categorized fixture uses.
      const defaultCategoryLabel = uncategorized.length > 0 ? categoryLabelFor(uncategorized[0]) : null;
      categoriesCorrect =
        categorized.every((feed) => categoryLabelFor(feed) === feed.category) &&
        typeof defaultCategoryLabel === "string" &&
        defaultCategoryLabel.length > 0 &&
        !categorized.some((feed) => feed.category === defaultCategoryLabel) &&
        uncategorized.every((feed) => categoryLabelFor(feed) === defaultCategoryLabel);

      if (categoriesCorrect) {
        findings.push(
          "FreshRSS's subscription/list response never reports an empty categories array -- every feed, " +
            "including ones with no explicit category, is placed under FreshRSS's own default category " +
            `(observed label: ${JSON.stringify(defaultCategoryLabel)} on this pinned instance/locale). ` +
            "src/services/freshrss-sync-coordinator.ts's initial-placement line " +
            '(`folder: subscription.categoryLabel || "Uncategorized"`) therefore has a categoryLabel that is ' +
            "in practice never null for a real account, so the local folder name for a FreshRSS-side " +
            "\"uncategorized\" feed is actually FreshRSS's configured default-category display name (locale/" +
            'account-dependent), not a guaranteed literal "Uncategorized" -- it only reads that way here ' +
            "because this English-locale test instance's default category happens to be named exactly that. " +
            "Worth a follow-up ticket to confirm this is the intended behavior across locales.",
        );
      }

      const feedCMatch = subscriptions.find((sub) => sub.url?.includes(findFixtureFeed("feed-c").fileName));
      if (feedCMatch) {
        baselineFeedCBefore = {
          url: feedCMatch.url,
          title: feedCMatch.title,
          categoryLabel: feedCMatch.categories?.find((category) => category.label)?.label ?? null,
        };
      }
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
      const enumeration = await enumerateAllItemIds({
        baseUrl,
        authToken,
        streamId: feedASubscriptionId,
        pageSize: 2,
        paths,
      });
      itemEnumerationPassed =
        enumeration.ok === true &&
        enumeration.continuationsSeen[0] !== null &&
        enumeration.continuationsSeen.at(-1) === null &&
        enumeration.ids.length === feedA.articles.length;

      if (enumeration.ids.length > 0) {
        firstArticleRemoteId = enumeration.ids[0];
        const contents = await getItemContents({ baseUrl, authToken, itemIds: enumeration.ids });
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

    // --- Mutation: mark one feed-a article read, verify the exact "OK"
    // acknowledgment body, and confirm it is observable through the
    // read-state stream.
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

    // =====================================================================
    // Ticket 12: deeper pagination plus read / starred / mapped-label
    // state-mutation contrast, all against feed-d -- a feed untouched by
    // any of the scenarios above, so every "X is set" assertion below has a
    // same-feed control article proving the mutation did not leak.
    // =====================================================================
    const feedD = findFixtureFeed("feed-d");
    const feedDSubscriptionId = opaqueSubscriptionIds.get("feed-d");
    /** @type {string[]} */
    let feedDArticleIds = [];
    let feedDPagingPassed = false;
    if (feedDSubscriptionId) {
      const enumeration = await enumerateAllItemIds({
        baseUrl,
        authToken,
        streamId: feedDSubscriptionId,
        pageSize: 2,
        paths,
      });
      feedDArticleIds = enumeration.ids;
      feedDPagingPassed =
        enumeration.ok === true &&
        enumeration.pageCount === 3 &&
        enumeration.continuationsSeen[0] !== null &&
        enumeration.continuationsSeen[1] !== null &&
        enumeration.continuationsSeen.at(-1) === null &&
        enumeration.ids.length === feedD.articles.length &&
        new Set(enumeration.ids).size === feedD.articles.length;
    }
    scenarios.push({
      name: "feed-d item-ID enumeration pages across 3 pages with no false completion",
      passed: feedDPagingPassed,
      detail: feedDPagingPassed
        ? undefined
        : "expected 3 pages (2, 2, 1) with a non-null continuation on the first two and null on the last",
    });

    let readMutationPassed = false;
    let starredMutationPassed = false;
    let labelMutationPassed = false;
    let labelRemoteTagId = null;
    const [readArticleId, starredArticleId, labelArticleId] = feedDArticleIds;

    if (readArticleId && starredArticleId) {
      // --- Read/unread contrast: mark readArticleId read, confirm
      // starredArticleId (never touched) is absent from the read stream.
      const freshToken = await modificationTokenProbe({ baseUrl, authToken });
      paths.record("/api/greader.php/reader/api/0/token");
      if (freshToken.ok) {
        const mutation = await editTag({
          baseUrl,
          authToken,
          modificationToken: freshToken.token,
          itemIds: [readArticleId],
          action: "add",
          streamId: FRESHRSS_READ_STREAM_ID,
        });
        paths.record("/api/greader.php/reader/api/0/edit-tag");
        if (mutation.ok) {
          const readStream = await listItemIds({ baseUrl, authToken, streamId: FRESHRSS_READ_STREAM_ID, n: 200 });
          readMutationPassed =
            readStream.ok === true &&
            readStream.itemRefs.includes(readArticleId) &&
            !readStream.itemRefs.includes(starredArticleId);
        }
      }
    }
    scenarios.push({
      name: "feed-d read-state mutation acknowledged, observable, and does not leak to the unread control article",
      passed: readMutationPassed,
    });

    if (starredArticleId && readArticleId) {
      // --- Starred/unstarred contrast: mark starredArticleId starred,
      // confirm readArticleId (read, but never starred) is absent from the
      // starred stream.
      const freshToken = await modificationTokenProbe({ baseUrl, authToken });
      paths.record("/api/greader.php/reader/api/0/token");
      if (freshToken.ok) {
        const mutation = await editTag({
          baseUrl,
          authToken,
          modificationToken: freshToken.token,
          itemIds: [starredArticleId],
          action: "add",
          streamId: FRESHRSS_STARRED_STREAM_ID,
        });
        paths.record("/api/greader.php/reader/api/0/edit-tag");
        if (mutation.ok) {
          const starredStream = await listItemIds({
            baseUrl,
            authToken,
            streamId: FRESHRSS_STARRED_STREAM_ID,
            n: 200,
          });
          starredMutationPassed =
            starredStream.ok === true &&
            starredStream.itemRefs.includes(starredArticleId) &&
            !starredStream.itemRefs.includes(readArticleId);
        }
      }
    }
    scenarios.push({
      name: "feed-d starred-state mutation acknowledged, observable, and does not leak to the unstarred control article",
      passed: starredMutationPassed,
    });

    if (labelArticleId) {
      // --- Mapped-label membership: apply a brand-new label to
      // labelArticleId (FreshRSS creates the label implicitly on first use,
      // per its own edit-tag implementation), then discover the resulting
      // opaque tag ID from a fresh tag/list call rather than assuming
      // FreshRSS echoes back the exact "user/-/label/<name>" string we sent
      // -- matched by substring against the known label name, the same
      // "discover, don't derive" convention ticket 11 used for subscription
      // IDs matched by fixture URL.
      const freshToken = await modificationTokenProbe({ baseUrl, authToken });
      paths.record("/api/greader.php/reader/api/0/token");
      if (freshToken.ok) {
        const mutation = await editTag({
          baseUrl,
          authToken,
          modificationToken: freshToken.token,
          itemIds: [labelArticleId],
          action: "add",
          streamId: `user/-/label/${CONTRACT_LABEL_NAME}`,
        });
        paths.record("/api/greader.php/reader/api/0/edit-tag");
        if (mutation.ok) {
          const tagsAfterLabel = await listTags({ baseUrl, authToken });
          paths.record("/api/greader.php/reader/api/0/tag/list");
          if (tagsAfterLabel.ok) {
            const discovered = tagsAfterLabel.tags.find(
              (tag) => typeof tag.id === "string" && tag.id.includes(CONTRACT_LABEL_NAME),
            );
            if (discovered) {
              labelRemoteTagId = discovered.id;

              // Ticket 12 real finding: the mocked-corpus/production
              // assumption in `src/services/freshrss-sync-client.ts`
              // (`parseTagListResponse`) is that a tag/list entry carries a
              // friendly `label` field. This pinned server's tag/list
              // response for a user-created label carries only `id` and
              // `type` -- confirmed by reading FreshRSS's own
              // `p/api/greader.php` `tagList()` handler, which builds each
              // label entry as `{ id, type: 'tag', unread_count }` with no
              // `label` key at all. Record this as an artifact finding
              // (never a scenario failure) rather than silently accepting
              // whichever value happens to come back.
              if (typeof discovered.label !== "string") {
                findings.push(
                  'tag/list entries for a user label on this pinned FreshRSS build have no "label" field ' +
                    `(observed keys: ${Object.keys(discovered).join(", ")}). ` +
                    "src/services/freshrss-sync-client.ts's parseTagListResponse falls back to entry.id as " +
                    "displayName in that case, which is the full opaque tag id (e.g. " +
                    `"${discovered.id}") rather than a human label name -- this flows into ` +
                    "buildLabelMappings' normalizeFreshRssLabelName and would produce a mapping keyed by the " +
                    "opaque id string, not the label name. Worth a follow-up ticket against " +
                    "freshrss-sync-client.ts's parseTagListResponse/displayName fallback.",
                );
              }

              const labelStream = await listItemIds({ baseUrl, authToken, streamId: labelRemoteTagId, n: 200 });
              paths.record("/api/greader.php/reader/api/0/stream/items/ids");
              const unlabeledControls = feedDArticleIds.filter(
                (id) => id !== labelArticleId && id !== readArticleId && id !== starredArticleId,
              );
              labelMutationPassed =
                labelStream.ok === true &&
                labelStream.itemRefs.includes(labelArticleId) &&
                unlabeledControls.every((id) => !labelStream.itemRefs.includes(id));
            }
          }
        }
      }
    }
    scenarios.push({
      name: "feed-d mapped-label membership mutation acknowledged, observable, and does not leak to unlabeled control articles",
      passed: labelMutationPassed,
    });

    // =====================================================================
    // Ticket 12: OPML round-trip scenario. Exports RSS Dashboard
    // subscriptions (a synthetic list including one deliberate duplicate
    // URL) through the real, production `generateFreshRssSubscriptionOpml`,
    // imports that OPML into the live container, exports FreshRSS's own
    // OPML back out, and compares. Per the ticket, this makes no assertion
    // about credentials, article bodies, read/starred state, labels,
    // sidecar data, or FreshRSS archival state -- only URLs, titles, flat
    // categories, duplicate-collapse, and baseline-subscription
    // preservation.
    // =====================================================================
    let dashboardExportCollapsedDuplicate = false;
    let opmlImportPassed = false;
    let opmlCategoryPassed = false;
    let opmlDuplicateCollapsedRoundTrip = false;
    let baselinePreservedPassed = false;

    try {
      const { generateFreshRssSubscriptionOpml } = await loadFreshRssOpmlExportModule();
      const dashboardFeeds = [
        {
          title: OPML_ROUND_TRIP_FEED.title,
          url: `http://fixture-server:8081/${OPML_ROUND_TRIP_FEED.fileName}`,
          folder: OPML_ROUND_TRIP_FEED.category,
          items: [],
          lastUpdated: 0,
        },
        {
          // Same URL as above, deliberately: exercises
          // generateFreshRssSubscriptionOpml's duplicate-URL collapse, and
          // then proves the collapse held all the way through a real
          // FreshRSS import + re-export, not just in the generator's own
          // unit tests.
          title: `${OPML_ROUND_TRIP_FEED.title} Duplicate`,
          url: `http://fixture-server:8081/${OPML_ROUND_TRIP_FEED.fileName}`,
          folder: OPML_ROUND_TRIP_FEED.category,
          items: [],
          lastUpdated: 0,
        },
      ];
      const { opml: dashboardOpml, warnings: dashboardWarnings } = generateFreshRssSubscriptionOpml(dashboardFeeds);
      dashboardExportCollapsedDuplicate = dashboardWarnings.length === 1;
      scenarios.push({
        name: "RSS Dashboard FreshRSS OPML export collapses the duplicate feed URL with one warning",
        passed: dashboardExportCollapsedDuplicate,
      });

      const dashboardOpmlPath = path.join(TMP_DIR, "dashboard-export.opml");
      writeFileSync(dashboardOpmlPath, dashboardOpml, "utf8");

      console.log("Importing the RSS Dashboard-generated OPML export into FreshRSS...");
      await execCompose([
        "exec",
        "-T",
        "freshrss",
        "cli/import-for-user.php",
        "--user",
        env.FRESHRSS_ADMIN_USER,
        "--filename",
        "/contract-tmp/dashboard-export.opml",
      ]);

      const postImportSubscriptions = await listSubscriptions({ baseUrl, authToken });
      paths.record("/api/greader.php/reader/api/0/subscription/list");
      opmlImportPassed =
        postImportSubscriptions.ok === true &&
        postImportSubscriptions.subscriptions.some((sub) => sub.url?.includes(OPML_ROUND_TRIP_FEED.fileName));
      scenarios.push({
        name: "FreshRSS subscription list reflects the imported dashboard feed after import",
        passed: opmlImportPassed,
      });

      if (baselineFeedCBefore && postImportSubscriptions.ok) {
        const feedCAfter = postImportSubscriptions.subscriptions.find((sub) =>
          sub.url?.includes(findFixtureFeed("feed-c").fileName),
        );
        const categoryAfter = feedCAfter?.categories?.find((category) => category.label)?.label ?? null;
        baselinePreservedPassed =
          Boolean(feedCAfter) &&
          feedCAfter.url === baselineFeedCBefore.url &&
          feedCAfter.title === baselineFeedCBefore.title &&
          categoryAfter === baselineFeedCBefore.categoryLabel;
      }
      scenarios.push({
        name: "pre-existing baseline subscription (feed-c) survives the OPML import untouched",
        passed: baselinePreservedPassed,
      });

      console.log("Exporting FreshRSS's own OPML via cli/export-opml-for-user.php...");
      const { stdout: freshRssExportedOpml } = await execFileAsync("docker", [
        "compose",
        "-f",
        COMPOSE_FILE,
        "--env-file",
        ENV_FILE,
        "exec",
        "-T",
        "freshrss",
        "cli/export-opml-for-user.php",
        "--user",
        env.FRESHRSS_ADMIN_USER,
      ]);
      const exportedEntries = parseFreshRssOpml(freshRssExportedOpml);
      const feedEEntries = findOpmlEntriesByUrlFragment(exportedEntries, OPML_ROUND_TRIP_FEED.fileName);

      opmlDuplicateCollapsedRoundTrip = feedEEntries.length === 1 && feedEEntries[0]?.title === OPML_ROUND_TRIP_FEED.title;
      scenarios.push({
        name: "FreshRSS's own OPML export shows the imported feed exactly once, with the first (non-duplicate) title",
        passed: opmlDuplicateCollapsedRoundTrip,
        detail: `found ${feedEEntries.length} matching outline(s)`,
      });

      opmlCategoryPassed = feedEEntries[0]?.category === OPML_ROUND_TRIP_FEED.category;
      scenarios.push({
        name: "FreshRSS's own OPML export nests the imported feed under the expected flat category",
        passed: opmlCategoryPassed,
        detail: `observed category: ${JSON.stringify(feedEEntries[0]?.category ?? null)}`,
      });
    } catch (error) {
      scenarios.push({
        name: "OPML round-trip scenario completed without throwing",
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    // --- Restart persistence: restart the FreshRSS container against the
    // same test-owned volume and confirm the seeded subscriptions, the
    // OPML-imported subscription, and every state mutation above (read,
    // starred, mapped-label) all survived, without reseeding anything.
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

    let restartSubscriptionsPassed = false;
    let restartReadPassed = false;
    let restartStarredPassed = false;
    let restartLabelPassed = false;
    if (postRestartLogin.ready) {
      const postRestartToken = postRestartLogin.result.authToken;
      const postRestartSubscriptions = await listSubscriptions({ baseUrl, authToken: postRestartToken });
      restartSubscriptionsPassed =
        postRestartSubscriptions.ok === true &&
        FIXTURE_FEEDS.every((feed) => postRestartSubscriptions.subscriptions.some((sub) => sub.url?.includes(feed.fileName))) &&
        (!opmlImportPassed ||
          postRestartSubscriptions.subscriptions.some((sub) => sub.url?.includes(OPML_ROUND_TRIP_FEED.fileName)));

      if (firstArticleRemoteId) {
        const postRestartReadStream = await listItemIds({
          baseUrl,
          authToken: postRestartToken,
          streamId: FRESHRSS_READ_STREAM_ID,
          n: 200,
        });
        restartReadPassed =
          postRestartReadStream.ok === true &&
          postRestartReadStream.itemRefs.includes(firstArticleRemoteId) &&
          (!readArticleId || postRestartReadStream.itemRefs.includes(readArticleId));
      }

      if (starredArticleId) {
        const postRestartStarredStream = await listItemIds({
          baseUrl,
          authToken: postRestartToken,
          streamId: FRESHRSS_STARRED_STREAM_ID,
          n: 200,
        });
        restartStarredPassed =
          postRestartStarredStream.ok === true && postRestartStarredStream.itemRefs.includes(starredArticleId);
      }

      if (labelRemoteTagId && labelArticleId) {
        const postRestartLabelStream = await listItemIds({
          baseUrl,
          authToken: postRestartToken,
          streamId: labelRemoteTagId,
          n: 200,
        });
        restartLabelPassed =
          postRestartLabelStream.ok === true && postRestartLabelStream.itemRefs.includes(labelArticleId);
      }
    }
    scenarios.push({
      name: "restart against the same test-owned volume preserves seeded/imported subscriptions",
      passed: restartSubscriptionsPassed,
    });
    scenarios.push({
      name: "restart preserves the read-state mutation",
      passed: restartReadPassed,
    });
    scenarios.push({
      name: "restart preserves the starred-state mutation",
      passed: restartStarredPassed,
    });
    scenarios.push({
      name: "restart preserves the mapped-label membership mutation",
      passed: restartLabelPassed,
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
      findings,
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
