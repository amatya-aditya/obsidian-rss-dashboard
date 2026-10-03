/**
 * Import confirmation model (issue #377): a plain summary of what a
 * Replacing or Overwriting import would change, built before anything is
 * written so the user can cancel.
 */

/** Replacing imports discard the feed data; Overwriting imports set preferences. */
export type ImportKind = "replacing" | "overwriting";

export type ImportBundleType =
  | "portable-data-bundle"
  | "feed-bundle"
  | "settings-bundle"
  | "user-preferences";

/** Feed data a Replacing import discards or brings in. */
export interface FeedDataCounts {
  feeds: number;
  articles: number;
  starred: number;
  folders: number;
  tags: number;
}

/** A retention or auto-backup preference the import changes. */
export interface HighImpactChange {
  label: string;
  before: string;
  after: string;
}

export interface PreferenceChanges {
  /** Preferences in the file whose value differs from the current one. */
  changedCount: number;
  highImpactChanges: HighImpactChange[];
}

export interface StorageLocation {
  mode: string;
  folder: string;
}

export interface StorageLocationMove {
  before: StorageLocation;
  after: StorageLocation;
}

/**
 * Where feed shards and data.json would be read from after the import. Both
 * settings sync to every device, so a change here moves every device.
 */
export interface StorageLocationChange {
  feedStorage: StorageLocationMove | null;
  metadataStorage: StorageLocationMove | null;
}

export interface ImportConfirmation {
  kind: ImportKind;
  bundleType: ImportBundleType;
  fileName: string;
  /** Current and incoming feed data; null for an Overwriting import. */
  feedData: { current: FeedDataCounts; incoming: FeedDataCounts } | null;
  /** Feeds whose articles this device has not loaded, so are not counted. */
  unloadedFeedCount: number;
  /** Null when the import carries no preferences. */
  preferences: PreferenceChanges | null;
  storageLocationChange: StorageLocationChange | null;
}

export type ImportDecision = "confirm" | "cancel";

/** Whether a file import was written or the user backed out before any write. */
export type ImportResult = "committed" | "canceled";

interface CountableFeed {
  items?: ReadonlyArray<{ starred?: boolean }>;
}

export function countFeedData(
  feeds: ReadonlyArray<CountableFeed>,
  folders: ReadonlyArray<unknown>,
  tags: ReadonlyArray<unknown>,
): FeedDataCounts {
  let articles = 0;
  let starred = 0;
  for (const feed of feeds) {
    for (const item of feed.items ?? []) {
      articles += 1;
      if (item.starred) starred += 1;
    }
  }
  return {
    feeds: feeds.length,
    articles,
    starred,
    folders: folders.length,
    tags: tags.length,
  };
}

interface BundleFeedData {
  feeds: ReadonlyArray<{ feedId?: string }>;
  shards: ReadonlyArray<{ feedId: string; items: CountableFeed["items"] }>;
}

/**
 * The articles a bundle import would load: each feed takes the items of the
 * shard with its feedId, as the import itself does.
 */
export function feedsWithBundleItems(bundle: BundleFeedData): CountableFeed[] {
  const itemsByFeedId = new Map(
    bundle.shards.map((shard) => [shard.feedId, shard.items]),
  );
  return bundle.feeds.map((feed) => ({
    items: (feed.feedId ? itemsByFeedId.get(feed.feedId) : undefined) ?? [],
  }));
}

/** Feed data keys, which a preferences comparison leaves out. */
const FEED_DATA_KEYS = new Set(["feeds", "folders", "availableTags"]);

/** Written into data.json to force sync tools to notice it; not preferences. */
const SYNC_BOOKKEEPING_KEYS = new Set(["_syncNonce", "_syncPad"]);

/**
 * Compares each preference the file carries with the current value. Keys
 * the file omits are kept on import, so they never count as a change.
 */
export function comparePreferences(
  current: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): PreferenceChanges {
  let changedCount = 0;
  for (const [key, value] of Object.entries(incoming)) {
    if (FEED_DATA_KEYS.has(key) || SYNC_BOOKKEEPING_KEYS.has(key)) continue;
    if (!isSameValue(current[key], value)) changedCount += 1;
  }
  return { changedCount, highImpactChanges: highImpactChanges(current, incoming) };
}

type Formatter = (value: unknown) => string;

const formatNumber: Formatter = (value) => String(value);
const formatToggle: Formatter = (value) => (value ? "On" : "Off");
const formatDays: Formatter = (value) =>
  typeof value === "number" && value > 0 ? `${value} days` : "Off";

/** Retention preferences, labelled as on the General settings tab. */
const RETENTION_PREFERENCES: ReadonlyArray<[string, string, Formatter]> = [
  ["maxItems", "Max item limit", formatNumber],
  ["defaultAutoDeleteDuration", "Default auto delete duration", formatDays],
  ["protectStarred", "Protect starred articles", formatToggle],
  ["protectSaved", "Protect saved articles", formatToggle],
  ["protectTagged", "Protect tagged articles", formatToggle],
  ["protectUnread", "Protect unread articles", formatToggle],
  [
    "useFirstSeenDateFallback",
    "Use first-seen date for undated items",
    formatToggle,
  ],
];

/** Auto-backup toggles, labelled as on the Import/Export settings tab. */
const AUTO_BACKUP_PREFERENCES: ReadonlyArray<[string, string]> = [
  ["backupDataJson", "Back up data.json"],
  ["backupOpml", "Back up feeds"],
  ["backupUserdata", "Back up user preferences"],
];

function highImpactChanges(
  current: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): HighImpactChange[] {
  const changes: HighImpactChange[] = [];
  for (const [key, label, format] of RETENTION_PREFERENCES) {
    if (!(key in incoming) || isSameValue(current[key], incoming[key])) continue;
    changes.push({ label, before: format(current[key]), after: format(incoming[key]) });
  }

  const currentBackup = asRecord(current.autoBackup);
  const incomingBackup = asRecord(incoming.autoBackup);
  if ("autoBackup" in incoming) {
    for (const [key, label] of AUTO_BACKUP_PREFERENCES) {
      if (!(key in incomingBackup)) continue;
      if (isSameValue(currentBackup[key], incomingBackup[key])) continue;
      changes.push({
        label,
        before: formatToggle(currentBackup[key]),
        after: formatToggle(incomingBackup[key]),
      });
    }
  }
  return changes;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Compares where feed shards and data.json live now with where the import
 * would put them. Pass storage folders already normalized. A folder counts
 * only where its mode uses one: shard storage, or a vault data.json location.
 */
export function compareStorageLocation(
  current: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): StorageLocationChange | null {
  const feedStorage = moveOf(
    current,
    incoming,
    "storageMode",
    "storageFolder",
    (mode) => mode !== "legacy-json",
  );
  const metadataStorage = moveOf(
    current,
    incoming,
    "metadataStorageMode",
    "metadataStorageFolder",
    (mode) => mode === "vault-location",
  );
  return feedStorage || metadataStorage ? { feedStorage, metadataStorage } : null;
}

function moveOf(
  current: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
  modeKey: string,
  folderKey: string,
  usesFolder: (mode: string) => boolean,
): StorageLocationMove | null {
  const before: StorageLocation = {
    mode: String(current[modeKey]),
    folder: String(current[folderKey]),
  };
  const after: StorageLocation = {
    mode: String(incoming[modeKey] ?? current[modeKey]),
    folder: String(incoming[folderKey] ?? current[folderKey]),
  };
  const moved =
    before.mode !== after.mode ||
    (usesFolder(after.mode) && before.folder !== after.folder);
  return moved ? { before, after } : null;
}

function isSameValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** JSON with object keys sorted, so key order never reads as a change. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      return nested;
    }
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    );
  }) ?? "undefined";
}
