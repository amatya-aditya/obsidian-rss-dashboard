import { Feed } from "../types/types";

/**
 * Result of generating the dedicated FreshRSS subscription export profile.
 *
 * `warnings` reports every duplicate-feed-URL collapse so a collapse is
 * always surfaced to the caller rather than silently dropped.
 */
export interface FreshRssOpmlExportResult {
  opml: string;
  warnings: string[];
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/**
 * Escapes one dashboard folder-name segment for FreshRSS's flat category
 * projection. `%` must be escaped before `/`, otherwise the `%` introduced
 * while escaping a literal `/` would itself be re-escaped into `%252F`.
 *
 * A dashboard folder name cannot itself contain `/` through this app's own
 * folder UI (it is the hierarchy separator used when joining folder names
 * into a `feed.folder` path), so in practice the `/` branch never fires on
 * real data; it is still implemented and exported for direct testing
 * because the export contract specifies it explicitly.
 */
export function escapeFreshRssCategorySegment(segment: string): string {
  return segment.replace(/%/g, "%25").replace(/\//g, "%2F");
}

/**
 * Projects a nested dashboard folder path (e.g. "Tech/AI/Blogs") into one
 * flat FreshRSS category string. FreshRSS categories have no hierarchy, so
 * this is a presentation projection only -- joining escaped segments with
 * "/" is not a promise that FreshRSS reconstructs the original nesting.
 */
function projectFolderPathToFreshRssCategory(folderPath: string): string {
  return folderPath.split("/").map(escapeFreshRssCategorySegment).join("/");
}

/** Dashboard folder values that represent "no folder assigned". */
function isUncategorized(folder: string | undefined): boolean {
  const trimmed = folder?.trim() ?? "";
  return trimmed === "" || trimmed === "Uncategorized";
}

function buildFeedOutlineXml(feed: Feed, indent: string): string {
  let outline = `${indent}<outline text="${escapeXml(feed.title)}" title="${escapeXml(
    feed.title,
  )}" type="rss" xmlUrl="${escapeXml(feed.url)}"`;

  // htmlUrl is included only when RSS Dashboard already holds a reliable
  // site URL for this feed (siteUrl comes from the parsed feed itself, not a
  // fabricated guess). Feed has no dedicated description field, so a
  // description attribute is never emitted.
  if (feed.siteUrl) {
    outline += ` htmlUrl="${escapeXml(feed.siteUrl)}"`;
  }

  outline += "/>\n";
  return outline;
}

/**
 * Generates the dedicated FreshRSS subscription export profile: a
 * subscription-only OPML 2.0 document intended for import into FreshRSS.
 *
 * This is a separate export profile from `OpmlManager.generateOpml`, the
 * generic RSS Dashboard OPML exporter, and does not change its behavior.
 *
 * The artifact never includes credentials, sessions, tokens, plugin
 * settings, FreshRSS sidecar data, article bodies, read/starred state,
 * dashboard tags, FreshRSS labels, saved-note state, or `frss:*` extension
 * attributes -- only `feed.title`, `feed.url`, `feed.siteUrl`, and
 * `feed.folder` are ever read.
 */
export function generateFreshRssSubscriptionOpml(
  feeds: Feed[],
): FreshRssOpmlExportResult {
  const warnings: string[] = [];
  const seenByUrl = new Map<string, Feed>();
  const uncategorizedFeeds: Feed[] = [];
  const categorizedFeeds = new Map<string, Feed[]>();

  for (const feed of feeds) {
    const firstSeen = seenByUrl.get(feed.url);
    if (firstSeen) {
      warnings.push(
        `Duplicate feed URL collapsed: "${feed.title}" (${feed.url}) was merged into the first entry "${firstSeen.title}".`,
      );
      continue;
    }
    seenByUrl.set(feed.url, feed);

    if (isUncategorized(feed.folder)) {
      uncategorizedFeeds.push(feed);
      continue;
    }

    const category = projectFolderPathToFreshRssCategory(feed.folder.trim());
    const existingGroup = categorizedFeeds.get(category);
    if (existingGroup) {
      existingGroup.push(feed);
    } else {
      categorizedFeeds.set(category, [feed]);
    }
  }

  let opml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  opml += '<opml version="2.0">\n';
  opml += "  <head>\n";
  opml += "    <title>FreshRSS subscription export</title>\n";
  opml += `    <dateCreated>${new Date().toUTCString()}</dateCreated>\n`;
  opml += "  </head>\n";
  opml += "  <body>\n";

  for (const feed of uncategorizedFeeds) {
    opml += buildFeedOutlineXml(feed, "    ");
  }

  for (const [category, feedsInCategory] of categorizedFeeds) {
    opml += `    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">\n`;
    for (const feed of feedsInCategory) {
      opml += buildFeedOutlineXml(feed, "      ");
    }
    opml += "    </outline>\n";
  }

  opml += "  </body>\n";
  opml += "</opml>";

  return { opml, warnings };
}
