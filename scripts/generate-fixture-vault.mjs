// Generates the seeded plugin data inside the fixture vault template
// (test_files/fixture-vault): the Shard storage v2 files, the plugin's
// bootstrap data.json, and the JSON import fixtures. Output is deterministic,
// so re-running it on an unchanged script leaves the committed files as they
// are. See docs/development/fixture-vault.md.
//
// Every article is placeholder text built from the word list below. Links and
// media point at example.com (reserved for documentation, RFC 2606) except
// preview images, which use Lorem Picsum's seeded placeholders.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");

export const TEMPLATE_DIR = join(ROOT_DIR, "test_files", "fixture-vault");
export const PLUGIN_ID = "rss-dashboard";
export const PLUGIN_DATA_PATH = `.obsidian/plugins/${PLUGIN_ID}/data.json`;
export const METADATA_FOLDER = "rss-dashboard-data";
export const STORAGE_FOLDER = `${METADATA_FOLDER}/feeds`;
export const METADATA_PATH = `${METADATA_FOLDER}/data.json`;
export const USER_STATE_PATH = `${METADATA_FOLDER}/user-state.json`;
export const IMPORT_FIXTURES_FOLDER = "import-fixtures";
export const SAVED_ARTICLE_PATH =
  "saved-articles/fixture-guide-to-offline-reading.md";

// 2026-09-01T12:00:00Z. Every seeded timestamp counts back from here.
const BASE_MS = Date.UTC(2026, 8, 1, 12, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LINK_BASE = "https://example.com/rss-dashboard-fixture";

export const TAGS = {
  important: { name: "Important", color: "#e74c3c" },
  readLater: { name: "Read later", color: "#3498db" },
  video: { name: "Video", color: "#d04747" },
  podcast: { name: "Podcast", color: "#8e44ad" },
  research: { name: "Research", color: "#27ae60" },
  reference: { name: "Reference", color: "#16a085" },
  rss: { name: "RSS", color: "#f39c12" },
  unused: { name: "Unused", color: "#7f8c8d" },
};

const SAVED_TAG = { name: "Saved", color: "#3498db" };

// ---------------------------------------------------------------------------
// Placeholder text
// ---------------------------------------------------------------------------

const WORDS = (
  "amber anchor archive atlas beacon binder bramble cedar channel cipher " +
  "clover compass copper corridor crescent delta draft ember engine field " +
  "fixture folder forest gallery garden granite harbor index island kernel " +
  "lantern ledger linen marble meadow metric mirror module notebook orbit " +
  "outline paper pebble pilot pixel planner quarry quill radar reader " +
  "ribbon river sample signal sketch spindle stanza summit table tangent " +
  "thread timber token trail vector velvet window yarrow zephyr quiet calm " +
  "steady brief gentle rapid plain simple careful useful curious patient " +
  "reads sorts checks builds keeps finds marks moves opens saves shows tests"
).split(" ");

/** Small deterministic PRNG (mulberry32) so output never changes run to run. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sentence(random, minWords = 8, maxWords = 16) {
  const count = minWords + Math.floor(random() * (maxWords - minWords + 1));
  const words = [];
  for (let i = 0; i < count; i += 1) {
    words.push(WORDS[Math.floor(random() * WORDS.length)]);
  }
  return `${capitalize(words.join(" "))}.`;
}

function paragraph(random, sentences = 4) {
  const parts = [];
  for (let i = 0; i < sentences; i += 1) parts.push(sentence(random));
  return parts.join(" ");
}

function paragraphs(seedText, count) {
  const random = createRandom(hashSeed(seedText));
  const result = [];
  for (let i = 0; i < count; i += 1) result.push(paragraph(random));
  return result;
}

function htmlParagraphs(seedText, count) {
  return paragraphs(seedText, count)
    .map((text) => `<p>${text}</p>`)
    .join("\n");
}

function previewImage(seed) {
  return `https://picsum.photos/seed/rss-fixture-${seed}/800/450`;
}

/** A long article body that exercises the reader's block-level formatting. */
function longArticleHtml(seedText) {
  const random = createRandom(hashSeed(seedText));
  const sections = [];
  for (let section = 1; section <= 12; section += 1) {
    const body = [];
    for (let i = 0; i < 4; i += 1) {
      body.push(`<p>${paragraph(random, 5)}</p>`);
    }
    sections.push(`<h2>Section ${section}: ${sentence(random, 2, 4).slice(0, -1)}</h2>\n${body.join("\n")}`);
    if (section === 2) {
      sections.push(
        `<figure><img src="${previewImage("long-inline")}" alt="Placeholder figure"><figcaption>A placeholder figure inside the article body.</figcaption></figure>`,
      );
    }
    if (section === 4) {
      sections.push(
        `<ul>\n<li>${sentence(random, 4, 7)}</li>\n<li>${sentence(random, 4, 7)}</li>\n<li>${sentence(random, 4, 7)}</li>\n</ul>`,
      );
    }
    if (section === 6) {
      sections.push(`<blockquote><p>${paragraph(random, 2)}</p></blockquote>`);
    }
    if (section === 8) {
      sections.push(
        "<pre><code>const fixture = { feeds: 11, articles: 153 };\nconsole.log(fixture);</code></pre>",
      );
    }
    if (section === 10) {
      sections.push(
        "<table><thead><tr><th>Column A</th><th>Column B</th></tr></thead>" +
          "<tbody><tr><td>Alpha</td><td>1</td></tr><tr><td>Beta</td><td>2</td></tr></tbody></table>",
      );
    }
  }
  sections.push(
    `<p>See the <a href="${LINK_BASE}/reference">placeholder reference page</a> for nothing in particular.</p>`,
  );
  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Items and feeds
// ---------------------------------------------------------------------------

function rfc822(ms) {
  return new Date(ms).toUTCString();
}

function iso(ms) {
  return new Date(ms).toISOString();
}

/**
 * One article. `state` holds the per-article user state that Shard storage v2
 * keeps in user-state.json rather than in the shard.
 */
function item(feed, fields) {
  const { state = {}, ...rest } = fields;
  return {
    item: {
      title: rest.title,
      link: rest.link,
      description: rest.description ?? "",
      content: rest.content ?? rest.description ?? "",
      pubDate: rest.pubDate ?? "",
      guid: rest.guid ?? rest.link,
      feedTitle: feed.title,
      feedUrl: feed.url,
      coverImage: rest.coverImage ?? "",
      summary: rest.summary ?? "",
      author: rest.author,
      mediaType: rest.mediaType ?? "article",
      ...rest.extra,
    },
    state,
  };
}

function articleText(seed, count = 2) {
  const html = htmlParagraphs(seed, count);
  const summary = paragraphs(seed, 1)[0];
  return { description: html, content: html, summary };
}

const FEEDS = [
  {
    feedId: "fx-rss-tech",
    title: "GitHub Blog (fixture)",
    url: "https://github.blog/feed/",
    siteUrl: "https://github.blog/",
    folder: "News/Tech",
    mediaType: "article",
  },
  {
    feedId: "fx-atom-releases",
    title: "RSS Dashboard releases (fixture)",
    url: "https://github.com/amatya-aditya/obsidian-rss-dashboard/releases.atom",
    siteUrl: "https://github.com/amatya-aditya/obsidian-rss-dashboard",
    folder: "News/Tech/Releases",
    mediaType: "article",
  },
  {
    feedId: "fx-json-feed",
    title: "JSON Feed (fixture)",
    url: "https://www.jsonfeed.org/feed.json",
    siteUrl: "https://www.jsonfeed.org/",
    folder: "News",
    mediaType: "article",
  },
  {
    feedId: "fx-broken",
    title: "Unreachable feed (fixture)",
    url: "https://example.invalid/rss-dashboard-fixture/feed.xml",
    folder: "News",
    mediaType: "article",
    lastFetchError: "Request failed: the host could not be resolved.",
  },
  {
    feedId: "fx-empty",
    title: "Hacker News (fixture, no articles)",
    url: "https://news.ycombinator.com/rss",
    siteUrl: "https://news.ycombinator.com/",
    folder: "News/Tech",
    mediaType: "article",
  },
  {
    feedId: "fx-youtube",
    title: "Google for Developers (fixture)",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw",
    siteUrl: "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
    folder: "Videos",
    mediaType: "video",
  },
  {
    feedId: "fx-podcast",
    title: "The Changelog (fixture)",
    url: "https://changelog.com/podcast/feed",
    siteUrl: "https://changelog.com/podcast",
    folder: "Podcasts",
    mediaType: "podcast",
  },
  {
    feedId: "fx-mastodon",
    title: "Mastodon (fixture)",
    url: "https://mastodon.social/@Mastodon.rss",
    siteUrl: "https://mastodon.social/@Mastodon",
    folder: "Mastodon",
    mediaType: "article",
  },
  {
    feedId: "fx-smallweb",
    title: "Kagi Small Web (fixture)",
    url: "https://kagi.com/api/v1/smallweb/feed?limit=50",
    siteUrl: "https://kagi.com/smallweb",
    folder: "Smallweb",
    mediaType: "article",
  },
  {
    feedId: "fx-single",
    title: "RSS 2.0 sample (fixture, one article)",
    url: "https://www.rssboard.org/files/sample-rss-2.xml",
    siteUrl: "https://www.rssboard.org/",
    folder: "",
    mediaType: "article",
  },
  {
    feedId: "fx-bulk",
    title: "BBC Technology (fixture, 120 articles)",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    siteUrl: "https://www.bbc.co.uk/news/technology",
    folder: "Bulk",
    mediaType: "article",
  },
];

function feedById(feedId) {
  const feed = FEEDS.find((candidate) => candidate.feedId === feedId);
  if (!feed) throw new Error(`Unknown fixture feed ${feedId}`);
  return feed;
}

function rssTechItems() {
  const feed = feedById("fx-rss-tech");
  const link = (n) => `${LINK_BASE}/rss-tech/${n}`;
  const at = (hoursAgo) => rfc822(BASE_MS - hoursAgo * HOUR_MS);
  return [
    item(feed, {
      title: "Unread article with a preview image",
      link: link(1),
      pubDate: at(2),
      coverImage: previewImage("rss-tech-1"),
      author: "Fixture Author",
      ...articleText("rss-tech-1", 3),
    }),
    item(feed, {
      title: "Read article without a preview image",
      link: link(2),
      pubDate: at(5),
      author: "Fixture Author",
      ...articleText("rss-tech-2", 2),
      state: { read: true },
    }),
    item(feed, {
      title: "Starred article with two tags",
      link: link(3),
      pubDate: at(9),
      coverImage: previewImage("rss-tech-3"),
      ...articleText("rss-tech-3", 2),
      state: { starred: true, tags: [TAGS.important, TAGS.research] },
    }),
    item(feed, {
      title: "Fixture guide to offline reading",
      link: link(4),
      pubDate: at(26),
      coverImage: previewImage("rss-tech-4"),
      author: "Fixture Author",
      ...articleText("rss-tech-4", 3),
      state: {
        read: true,
        saved: true,
        savedFilePath: SAVED_ARTICLE_PATH,
        tags: [TAGS.readLater, SAVED_TAG],
      },
    }),
    item(feed, {
      title: "A very long article for reader layout checks",
      link: link(5),
      pubDate: at(50),
      coverImage: previewImage("rss-tech-5"),
      author: "Fixture Author",
      description: htmlParagraphs("rss-tech-5-intro", 1),
      content: longArticleHtml("rss-tech-5"),
      summary: paragraphs("rss-tech-5-intro", 1)[0],
      state: { tags: [TAGS.reference, TAGS.research, TAGS.rss] },
    }),
    item(feed, {
      title: "Paywalled article showing only an excerpt",
      link: link(6),
      pubDate: at(74),
      ...articleText("rss-tech-6", 1),
      extra: { restrictedReason: "paywall" },
    }),
    item(feed, {
      title: "Undated article with a first-seen date",
      link: link(7),
      pubDate: "",
      ...articleText("rss-tech-7", 1),
      extra: { firstSeenMs: BASE_MS - 3 * DAY_MS },
    }),
    item(feed, {
      title: "Undated article without a first-seen date",
      link: link(8),
      pubDate: "",
      ...articleText("rss-tech-8", 1),
    }),
  ];
}

function atomReleaseItems() {
  const feed = feedById("fx-atom-releases");
  return [3, 2, 1].map((minor, index) =>
    item(feed, {
      title: `Fixture release 0.${minor}.0`,
      link: `${LINK_BASE}/releases/0.${minor}.0`,
      guid: `tag:example.com,2026:rss-dashboard-fixture-release-0.${minor}.0`,
      pubDate: iso(BASE_MS - (index * 14 + 1) * DAY_MS),
      author: "Fixture Maintainer",
      ...articleText(`release-${minor}`, 2),
      state: index === 2 ? { read: true } : {},
    }),
  );
}

function jsonFeedItems() {
  const feed = feedById("fx-json-feed");
  return [
    item(feed, {
      title: "JSON Feed article with an image",
      link: `${LINK_BASE}/json/1`,
      pubDate: iso(BASE_MS - 4 * HOUR_MS),
      coverImage: previewImage("json-1"),
      ...articleText("json-1", 2),
    }),
    item(feed, {
      title: "JSON Feed article tagged for later",
      link: `${LINK_BASE}/json/2`,
      pubDate: iso(BASE_MS - 30 * HOUR_MS),
      ...articleText("json-2", 2),
      state: { tags: [TAGS.readLater] },
    }),
    item(feed, {
      title: "Starred article imported from starred.json",
      link: `${LINK_BASE}/json/3`,
      pubDate: iso(BASE_MS - 20 * DAY_MS),
      ...articleText("json-3", 1),
      extra: {
        starredImportContentState: "unfetched",
        starredImportedAt: BASE_MS - 2 * DAY_MS,
      },
      state: { starred: true, read: true },
    }),
  ];
}

function brokenFeedItems() {
  const feed = feedById("fx-broken");
  return [1, 2].map((n) =>
    item(feed, {
      title: `Article kept from before the feed broke ${n}`,
      link: `${LINK_BASE}/broken/${n}`,
      pubDate: rfc822(BASE_MS - (n * 10) * DAY_MS),
      ...articleText(`broken-${n}`, 1),
    }),
  );
}

function youtubeItems() {
  const feed = feedById("fx-youtube");
  const videos = [
    { id: "fxVideo0001", title: "Placeholder video one", hoursAgo: 6, state: {} },
    {
      id: "fxVideo0002",
      title: "Placeholder video two, half watched",
      hoursAgo: 30,
      state: {
        read: true,
        playbackProgress: {
          position: 312,
          duration: 624,
          lastUpdated: BASE_MS - 20 * HOUR_MS,
        },
      },
    },
    {
      id: "fxVideo0003",
      title: "Placeholder video three, starred",
      hoursAgo: 80,
      state: { starred: true, tags: [TAGS.video, TAGS.important] },
    },
    { id: "fxVideo0004", title: "Placeholder video four", hoursAgo: 200, state: {} },
  ];
  return videos.map((video) => {
    const text = articleText(`video-${video.id}`, 1);
    return item(feed, {
      title: video.title,
      link: `https://www.youtube.com/watch?v=${video.id}`,
      guid: `yt:video:${video.id}`,
      pubDate: iso(BASE_MS - video.hoursAgo * HOUR_MS),
      coverImage: `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
      author: "Fixture Channel",
      mediaType: "video",
      ...text,
      extra: {
        videoId: video.id,
        videoUrl: `https://www.youtube.com/embed/${video.id}`,
      },
      state: video.state,
    });
  });
}

function podcastItems() {
  const feed = feedById("fx-podcast");
  const episodes = [
    { n: 5, daysAgo: 1, duration: "00:48:10", state: {} },
    {
      n: 4,
      daysAgo: 8,
      duration: "01:02:45",
      state: {
        playbackProgress: {
          position: 1520,
          duration: 3765,
          lastUpdated: BASE_MS - 2 * DAY_MS,
        },
        tags: [TAGS.podcast],
      },
    },
    { n: 3, daysAgo: 15, duration: "00:55:00", state: { read: true, starred: true } },
    { n: 2, daysAgo: 22, duration: "00:39:30", state: { read: true } },
    { n: 1, daysAgo: 29, duration: "00:12:05", episodeType: "trailer", state: {} },
  ];
  return episodes.map((episode) => {
    const audioUrl = `${LINK_BASE}/podcast/episode-${episode.n}.mp3`;
    return item(feed, {
      title: `Fixture episode ${episode.n}`,
      link: `${LINK_BASE}/podcast/${episode.n}`,
      guid: `${LINK_BASE}/podcast/guid-${episode.n}`,
      pubDate: rfc822(BASE_MS - episode.daysAgo * DAY_MS),
      coverImage: previewImage("podcast-art"),
      author: "Fixture Hosts",
      mediaType: "podcast",
      ...articleText(`podcast-${episode.n}`, 2),
      extra: {
        audioUrl,
        duration: episode.duration,
        explicit: false,
        image: previewImage("podcast-art"),
        episodeType: episode.episodeType ?? "full",
        season: 1,
        episode: episode.n,
        enclosure: { url: audioUrl, type: "audio/mpeg", length: "0" },
      },
      state: episode.state,
    });
  });
}

function mastodonItems() {
  const feed = feedById("fx-mastodon");
  return [1, 2, 3, 4].map((n) => {
    const random = createRandom(hashSeed(`toot-${n}`));
    const text = sentence(random, 10, 24);
    const withImage = n === 2;
    const html = withImage
      ? `<p>${text}</p><p><img src="${previewImage(`toot-${n}`)}" alt="Placeholder attachment"></p>`
      : `<p>${text}</p>`;
    return item(feed, {
      // Mastodon posts have no title; the parser stores this placeholder.
      title: "No title",
      link: `${LINK_BASE}/mastodon/10000${n}`,
      pubDate: rfc822(BASE_MS - n * 7 * HOUR_MS),
      description: html,
      content: html,
      summary: text,
      author: "@fixture@example.com",
      state: n === 3 ? { read: true } : {},
    });
  });
}

function smallwebItems() {
  const feed = feedById("fx-smallweb");
  return [1, 2, 3].map((n) =>
    item(feed, {
      title: `Small web post ${n}`,
      link: `${LINK_BASE}/smallweb/${n}`,
      pubDate: iso(BASE_MS - n * 11 * HOUR_MS),
      author: "Fixture Blogger",
      ...articleText(`smallweb-${n}`, 2),
      state: n === 1 ? { starred: true } : {},
    }),
  );
}

function singleItem() {
  const feed = feedById("fx-single");
  return [
    item(feed, {
      title: "The only article in this feed",
      link: `${LINK_BASE}/single/1`,
      pubDate: rfc822(BASE_MS - 12 * HOUR_MS),
      ...articleText("single-1", 2),
    }),
  ];
}

function bulkItems() {
  const feed = feedById("fx-bulk");
  const items = [];
  for (let n = 1; n <= 120; n += 1) {
    const number = String(n).padStart(3, "0");
    const random = createRandom(hashSeed(`bulk-${n}`));
    const state = {};
    if (n % 3 === 0) state.read = true;
    if (n % 25 === 0) state.starred = true;
    if (n % 40 === 0) state.tags = [TAGS.research];
    items.push(
      item(feed, {
        title: `Bulk article ${number}: ${sentence(random, 3, 6).slice(0, -1)}`,
        link: `${LINK_BASE}/bulk/${number}`,
        pubDate: rfc822(BASE_MS - n * 6 * HOUR_MS),
        coverImage: n % 4 === 0 ? previewImage(`bulk-${number}`) : "",
        ...articleText(`bulk-${n}`, 1),
        state,
      }),
    );
  }
  return items;
}

const ITEM_BUILDERS = {
  "fx-rss-tech": rssTechItems,
  "fx-atom-releases": atomReleaseItems,
  "fx-json-feed": jsonFeedItems,
  "fx-broken": brokenFeedItems,
  "fx-empty": () => [],
  "fx-youtube": youtubeItems,
  "fx-podcast": podcastItems,
  "fx-mastodon": mastodonItems,
  "fx-smallweb": smallwebItems,
  "fx-single": singleItem,
  "fx-bulk": bulkItems,
};

/** Newest first, ties and undated items by GUID, as the plugin sorts on load. */
function byNewest(a, b) {
  const aMs = Date.parse(a.item.pubDate) || 0;
  const bMs = Date.parse(b.item.pubDate) || 0;
  if (aMs !== bMs) return bMs - aMs;
  if (a.item.guid < b.item.guid) return -1;
  if (a.item.guid > b.item.guid) return 1;
  return 0;
}

function withoutUndefined(value) {
  return JSON.parse(JSON.stringify(value));
}

function feedConfig(feed, entries) {
  const newest = entries.reduce(
    (latest, entry) => Math.max(latest, Date.parse(entry.item.pubDate) || 0),
    0,
  );
  const lastUpdated = feed.feedId === "fx-empty" ? BASE_MS : newest || BASE_MS;
  return withoutUndefined({
    feedId: feed.feedId,
    title: feed.title,
    url: feed.url,
    siteUrl: feed.siteUrl,
    folder: feed.folder,
    lastUpdated,
    mediaType: feed.mediaType,
    // Seeded articles are older than the default 30-day window, so retention
    // is off for every fixture feed; see the docs to exercise it.
    autoDeleteDuration: 0,
    maxItemsLimit: 0,
    keywordRules: { overrideGlobalRules: false, includeLogic: "AND", rules: [] },
    lastRefreshAttemptCompletedAt: lastUpdated,
    lastFetchError: feed.lastFetchError,
  });
}

function toUserState(state) {
  const result = {
    read: Boolean(state.read),
    starred: Boolean(state.starred),
    saved: Boolean(state.saved),
  };
  if (state.tags?.length) result.tags = state.tags;
  if (state.savedFilePath) result.savedFilePath = state.savedFilePath;
  if (state.playbackProgress) result.playbackProgress = state.playbackProgress;
  return result;
}

/** Every fixture feed with its sorted articles and per-article state. */
export function buildFixtureFeeds() {
  return FEEDS.map((feed) => {
    const entries = ITEM_BUILDERS[feed.feedId]().sort(byNewest);
    return {
      config: feedConfig(feed, entries),
      items: entries.map((entry) => withoutUndefined(entry.item)),
      states: entries.map((entry) => ({
        guid: entry.item.guid,
        state: entry.state,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const FOLDER_TIMESTAMP = BASE_MS - 60 * DAY_MS;

function folder(name, subfolders = [], extra = {}) {
  return {
    name,
    subfolders,
    createdAt: FOLDER_TIMESTAMP,
    modifiedAt: FOLDER_TIMESTAMP,
    ...extra,
  };
}

export function buildFolders() {
  return [
    folder("News", [
      folder("Tech", [folder("Releases")], { autoTags: [TAGS.research] }),
    ], { pinned: true }),
    folder("Videos"),
    folder("Podcasts"),
    folder("Mastodon"),
    folder("Smallweb"),
    folder("Bulk"),
    folder("Empty"),
  ];
}

/**
 * The persisted settings. Only values that differ from the plugin's defaults
 * are stored; the plugin fills in the rest when it loads them.
 */
function buildSettings(feedConfigs) {
  return {
    feeds: feedConfigs,
    folders: buildFolders(),
    availableTags: Object.values(TAGS),
    refreshInterval: 0,
    lastRefreshTimestamp: BASE_MS,
    lastGlobalRefreshCompletedAt: BASE_MS,
    articleSaving: {
      addSavedTag: true,
      defaultFolder: "saved-articles/",
      includeFrontmatter: true,
      saveFullContent: true,
      fetchTimeout: 10,
      savedTemplates: [],
    },
    storageMode: "vault-shards-v2",
    storageFolder: STORAGE_FOLDER,
    storageSchemaVersion: 1,
    metadataStorageMode: "vault-location",
    metadataStorageFolder: METADATA_FOLDER,
    metadataStorageSchemaVersion: 2,
  };
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Import fixtures
// ---------------------------------------------------------------------------

const IMPORT_EXPORTED_AT = BASE_MS + DAY_MS;

function importedFeed(feedId, title, folderPath, count) {
  const url = `${LINK_BASE}/imported/${feedId}.xml`;
  const items = [];
  for (let n = 1; n <= count; n += 1) {
    const link = `${LINK_BASE}/imported/${feedId}/${n}`;
    const text = articleText(`${feedId}-${n}`, 1);
    items.push({
      title: `${title} article ${n}`,
      link,
      description: text.description,
      content: text.content,
      pubDate: rfc822(BASE_MS - n * DAY_MS),
      guid: link,
      read: n === 1,
      starred: n === 2,
      tags: n === 2 ? [TAGS.important] : [],
      saved: false,
      feedTitle: title,
      feedUrl: url,
      coverImage: "",
      summary: text.summary,
      mediaType: "article",
    });
  }
  return {
    config: {
      feedId,
      title,
      url,
      folder: folderPath,
      lastUpdated: BASE_MS,
      mediaType: "article",
      autoDeleteDuration: 0,
      maxItemsLimit: 0,
      keywordRules: { overrideGlobalRules: false, includeLogic: "AND", rules: [] },
      lastRefreshAttemptCompletedAt: BASE_MS,
    },
    shard: {
      version: 1,
      feedId,
      feedUrl: url,
      updatedAt: IMPORT_EXPORTED_AT,
      items,
    },
  };
}

/** Preferences a user might change, applied by the settings-only imports. */
const CHANGED_PREFERENCES = {
  viewStyle: "list",
  articleSort: "oldest",
  sidebarWidth: 360,
  articleGroupBy: "feed",
};

function buildFeedBundle() {
  const alpha = importedFeed("fx-import-alpha", "Imported feed alpha", "Imported", 3);
  const beta = importedFeed("fx-import-beta", "Imported feed beta", "Imported/Nested", 2);
  return {
    version: 1,
    exportedAt: IMPORT_EXPORTED_AT,
    feeds: [alpha.config, beta.config],
    folders: [folder("Imported", [folder("Nested")])],
    availableTags: [TAGS.important, { name: "Imported", color: "#2c3e50" }],
    shards: [alpha.shard, beta.shard],
  };
}

function buildSettingsBundle() {
  return {
    version: 1,
    exportedAt: IMPORT_EXPORTED_AT,
    metadataStorageMode: "vault-location",
    metadataStorageFolder: METADATA_FOLDER,
    settings: {
      ...CHANGED_PREFERENCES,
      refreshInterval: 0,
      storageMode: "vault-shards-v2",
      storageFolder: STORAGE_FOLDER,
      metadataStorageMode: "vault-location",
      metadataStorageFolder: METADATA_FOLDER,
      metadataStorageSchemaVersion: 2,
    },
  };
}

function buildPortableBundle() {
  const gamma = importedFeed("fx-import-gamma", "Imported feed gamma", "Portable", 4);
  return {
    version: 1,
    exportedAt: IMPORT_EXPORTED_AT,
    storageMode: "vault-shards-v2",
    storageFolder: STORAGE_FOLDER,
    metadataStorageMode: "vault-location",
    metadataStorageFolder: METADATA_FOLDER,
    metadata: {
      ...CHANGED_PREFERENCES,
      refreshInterval: 0,
      feeds: [gamma.config],
      folders: [folder("Portable")],
      availableTags: [TAGS.readLater, TAGS.reference],
      storageMode: "vault-shards-v2",
      storageFolder: STORAGE_FOLDER,
      metadataStorageMode: "vault-location",
      metadataStorageFolder: METADATA_FOLDER,
      metadataStorageSchemaVersion: 2,
    },
    shards: [gamma.shard],
    markdownMirrorFallbackPlanned: true,
  };
}

function buildUserPreferences() {
  return {
    ...CHANGED_PREFERENCES,
    refreshInterval: 0,
    display: { articleDateStyle: "absolute", cardSpacing: 24 },
    storageMode: "vault-shards-v2",
    storageFolder: STORAGE_FOLDER,
    metadataStorageMode: "vault-location",
    metadataStorageFolder: METADATA_FOLDER,
    metadataStorageSchemaVersion: 2,
  };
}

function buildFoldersAndTagsPreferences() {
  return {
    folders: [...buildFolders(), folder("From preferences file")],
    availableTags: [
      ...Object.values(TAGS),
      { name: "From preferences", color: "#d35400" },
    ],
    viewStyle: "card",
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Every generated file, keyed by its path relative to the template root, with
 * the exact text it should contain.
 */
export function buildFixtureFiles() {
  const feeds = buildFixtureFeeds();
  const files = {};

  files[PLUGIN_DATA_PATH] = json({
    metadataStorageMode: "vault-location",
    metadataStorageFolder: METADATA_FOLDER,
    metadataStorageSchemaVersion: 2,
  });
  files[METADATA_PATH] = json(buildSettings(feeds.map((feed) => feed.config)));

  const states = {};
  for (const feed of feeds) {
    files[`${STORAGE_FOLDER}/${feed.config.feedId}.json`] = json({
      version: 1,
      feedId: feed.config.feedId,
      feedUrl: feed.config.url,
      updatedAt: feed.config.lastUpdated,
      items: feed.items,
    });
    for (const { guid, state } of feed.states) {
      if (Object.keys(state).length === 0) continue;
      states[`${feed.config.feedId}:${guid}`] = toUserState(state);
    }
  }
  files[USER_STATE_PATH] = json({ version: 3, states });

  const importPath = (name) => `${IMPORT_FIXTURES_FOLDER}/${name}`;
  files[importPath("rss-dashboard-feed-bundle.json")] = json(buildFeedBundle());
  files[importPath("rss-dashboard-settings-bundle.json")] = json(
    buildSettingsBundle(),
  );
  files[importPath("rss-dashboard-portable-bundle.json")] = json(
    buildPortableBundle(),
  );
  files[importPath("rss-dashboard-user-preferences.json")] = json(
    buildUserPreferences(),
  );
  files[importPath("preferences-folders-and-tags-only.json")] = json(
    buildFoldersAndTagsPreferences(),
  );

  return files;
}

export function writeFixtureFiles(templateDir = TEMPLATE_DIR) {
  const files = buildFixtureFiles();
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(templateDir, ...relativePath.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return Object.keys(files);
}

function main() {
  const written = writeFixtureFiles();
  console.log(
    `Wrote ${written.length} generated file(s) into ${TEMPLATE_DIR}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
