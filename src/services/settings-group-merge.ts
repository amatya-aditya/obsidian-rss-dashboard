import { comparableSnapshotJson } from "./storage-json";

/** The two settings groups that merge per entry rather than as one value. */
export type SettingsEntryGroup = "feeds" | "folders";

export interface SettingsGroupEntryRef {
  group: SettingsEntryGroup;
  /** A `feedId`, a folder path, or a feed's `url` when it has no id. */
  key: string;
}

export interface SettingsGroupMerge {
  /** Memory's snapshot with every group taken from disk swapped in. */
  merged: Record<string, unknown>;
  /** Groups this device left unchanged and disk changed: disk's value. */
  adopted: string[];
  /** Groups both sides changed to different values: memory's value. */
  conflicts: string[];
  /** Entries taken from disk inside a group that merges per entry. */
  adoptedEntries: SettingsGroupEntryRef[];
  /** Entries both sides changed inside a group that merges per entry. */
  conflictEntries: SettingsGroupEntryRef[];
  /** Synced folders whose parent is not in the merged tree, so they were dropped. */
  droppedEntries: SettingsGroupEntryRef[];
  /** Synced feeds whose `folder` names no folder in the merged tree. */
  danglingEntries: SettingsGroupEntryRef[];
  /** Keys that appeared twice on one side; the first was kept. */
  duplicateEntries: SettingsGroupEntryRef[];
}

/**
 * Feed fields a refresh rewrites. They change on both devices without either
 * side editing anything, so they never count as a change (#1439).
 */
const FEED_BOOKKEEPING = [
  "lastUpdated",
  "lastRefreshAttemptCompletedAt",
  "lastRefreshDiagnostics",
  "lastFetchError",
] as const;

/**
 * Settings every device rewrites on its own refresh or launch. When both sides
 * changed one, a delivery that wins its conflicts takes the delivered value and
 * does not report it: no edit was lost, so it must not raise a notice (#1452).
 */
const SETTINGS_BOOKKEEPING = new Set([
  "lastRefreshTimestamp",
  "lastGlobalRefreshCompletedAt",
  "lastShownVersion",
]);

/** Fields the merge owns rather than compares. */
const FEED_OWNED = ["items"] as const;
const FOLDER_OWNED = ["subfolders"] as const;
/**
 * Bumped whenever a folder or its children change, including by a rename. A
 * rename is already visible as a path change, so this adds nothing but noise.
 */
const FOLDER_BOOKKEEPING = ["modifiedAt"] as const;

const FEED_IGNORED = [...FEED_OWNED, ...FEED_BOOKKEEPING];
const FOLDER_IGNORED = [...FOLDER_OWNED, ...FOLDER_BOOKKEEPING];

type Entry = Record<string, unknown>;

/**
 * What a device last knew to be shared, as content hashes only: one per
 * settings group, and one per feed and folder, so a merge can tell which side
 * changed an entry without keeping any feed title or URL (ADR 0036). Entry
 * keys are hashed too; `feeds` and `folders` are absent when the file held no
 * such list.
 */
export interface SettingsAncestor {
  groups: Record<string, string>;
  feeds?: Record<string, string>;
  folders?: Record<string, string>;
}

/** How a merge settles a group or entry both sides changed (ADR 0036). */
export interface SettingsMergeOptions {
  /** Take the delivered value, so two devices settle on one in a round. */
  diskWinsConflicts?: boolean;
}

/** A 53-bit string hash (cyrb53). It compares content; it is not security. */
function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function isRecord(value: unknown): value is Entry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutKeys(entry: Entry, keys: readonly string[]): Entry {
  const copy = { ...entry };
  for (const key of keys) delete copy[key];
  return copy;
}

/** One top-level group's value, compared by content with sorted keys. */
function groupJson(value: unknown): string {
  return comparableSnapshotJson({ group: value });
}

function groupHash(value: unknown): string {
  return hashText(groupJson(value));
}

/** Everything about an entry the merge compares, with owned and churn fields removed. */
function entryHash(
  entry: Entry | undefined,
  ignored: readonly string[],
): string {
  if (entry === undefined) return hashText("\u0000missing");
  return groupHash(withoutKeys(entry, ignored));
}

function entryRef(
  group: SettingsEntryGroup,
  key: string,
): SettingsGroupEntryRef {
  return { group, key };
}

/* ------------------------------------------------------------------ feeds */

/**
 * A feed's merge key: its id, else the id another side already gives the same
 * url, else the url of a pre-id or foreign entry. The resolved id is written
 * onto the entry, so a synced copy that lost its id keeps the shard it names.
 */
function feedKey(
  entry: Entry,
  side: string,
  index: number,
  idByUrl: ReadonlyMap<string, string>,
): { key: string; entry: Entry } {
  const id = entry.feedId;
  if (typeof id === "string" && id.length > 0) return { key: id, entry };
  const url = entry.url;
  if (typeof url === "string" && url.length > 0) {
    const known = idByUrl.get(url);
    if (known !== undefined)
      return { key: known, entry: { ...entry, feedId: known } };
    return { key: url, entry };
  }
  // Unkeyable: never matches another side, so it merges as an addition.
  return { key: `${side}#${index}`, entry };
}

/** url -> id, from every side, so an id-less copy can still find its feed. */
function feedIdsByUrl(lists: readonly unknown[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!isRecord(entry)) continue;
      const id = entry.feedId;
      const url = entry.url;
      if (
        typeof id === "string" &&
        id.length > 0 &&
        typeof url === "string" &&
        url.length > 0 &&
        !ids.has(url)
      ) {
        ids.set(url, id);
      }
    }
  }
  return ids;
}

function feedIndex(
  list: unknown,
  side: string,
  idByUrl: ReadonlyMap<string, string>,
): { entries: Map<string, Entry>; duplicates: string[] } | null {
  if (!Array.isArray(list)) return null;
  const entries = new Map<string, Entry>();
  const duplicates: string[] = [];
  list.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const resolved = feedKey(entry, side, index, idByUrl);
    if (entries.has(resolved.key)) {
      duplicates.push(resolved.key);
      return;
    }
    entries.set(resolved.key, resolved.entry);
  });
  return { entries, duplicates };
}

/** A feed written to disk: never its items, and bookkeeping from memory. */
function projectFeed(entry: Entry, fromMemory: Entry | undefined): Entry {
  const copy = withoutKeys(entry, FEED_OWNED);
  if (fromMemory === undefined) return copy;
  for (const field of FEED_BOOKKEEPING) {
    if (fromMemory[field] === undefined) delete copy[field];
    else copy[field] = fromMemory[field];
  }
  return copy;
}

/* ---------------------------------------------------------------- folders */

/** Flattens a folder tree to path -> the folder's own fields. */
function collectFolders(
  list: unknown,
  base: string,
  out: Map<string, Entry>,
  order: string[],
  duplicates: string[],
): void {
  if (!Array.isArray(list)) return;
  for (const folder of list) {
    if (!isRecord(folder) || typeof folder.name !== "string") continue;
    const path = base ? `${base}/${folder.name}` : folder.name;
    if (out.has(path)) {
      duplicates.push(path);
      continue;
    }
    out.set(path, withoutKeys(folder, FOLDER_OWNED));
    order.push(path);
    collectFolders(folder.subfolders, path, out, order, duplicates);
  }
}

function folderMap(list: unknown): {
  entries: Map<string, Entry>;
  order: string[];
  duplicates: string[];
} | null {
  if (!Array.isArray(list)) return null;
  const entries = new Map<string, Entry>();
  const order: string[] = [];
  const duplicates: string[] = [];
  collectFolders(list, "", entries, order, duplicates);
  return { entries, order, duplicates };
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** Rebuilds the nested tree from chosen folders, in the merged order. */
function rebuildFolderTree(
  order: readonly string[],
  chosen: Map<string, Entry>,
): Entry[] {
  const byPath = new Map<string, Entry>();
  const roots: Entry[] = [];
  for (const path of order) {
    const entry: Entry = { ...chosen.get(path), subfolders: [] };
    byPath.set(path, entry);
    const parent = parentPath(path) ? byPath.get(parentPath(path)) : undefined;
    if (parent === undefined) roots.push(entry);
    else (parent.subfolders as Entry[]).push(entry);
  }
  return roots;
}

/* ------------------------------------------------------------ the merge */

interface EntryMerge {
  chosen: Map<string, Entry>;
  adopted: SettingsGroupEntryRef[];
  conflicts: SettingsGroupEntryRef[];
}

interface EntryMergeOptions {
  /** The ancestor's hash for an entry, or undefined when it held none. */
  baseHash: (key: string, entry: Entry | undefined) => string | undefined;
  disk: Map<string, Entry>;
  memory: Map<string, Entry>;
  group: SettingsEntryGroup;
  ignored: readonly string[];
  /** A folder rename is a removal plus an addition, so removals are final. */
  removalWins: boolean;
  diskWinsConflicts: boolean;
  project: (entry: Entry, memoryEntry: Entry | undefined) => Entry;
}

/**
 * Three-way merge of one per-entry group. Per key: changed on one side only
 * takes that side; changed on both keeps memory's value and reports the key,
 * or the delivered value when `diskWinsConflicts`. Both sides making the same
 * change is no conflict. A removal beats an edit when `removalWins`, so a
 * rename is not undone by the other side editing the renamed-away entry;
 * otherwise the edit wins, so a feed is never silently deleted.
 */
function mergeEntries(options: EntryMergeOptions): EntryMerge {
  const { disk, memory, ignored } = options;
  const chosen = new Map<string, Entry>();
  const adopted: SettingsGroupEntryRef[] = [];
  const conflicts: SettingsGroupEntryRef[] = [];
  const keys = new Set([...disk.keys(), ...memory.keys()]);
  const missing = entryHash(undefined, ignored);

  for (const key of keys) {
    const onDisk = disk.get(key);
    const inMemory = memory.get(key);
    const before = options.baseHash(key, onDisk ?? inMemory) ?? missing;
    const diskHash = entryHash(onDisk, ignored);
    const memoryHash = entryHash(inMemory, ignored);
    const diskChanged = diskHash !== before;
    const memoryChanged = memoryHash !== before;

    if (!diskChanged || diskHash === memoryHash) {
      if (inMemory !== undefined)
        chosen.set(key, options.project(inMemory, inMemory));
      continue;
    }
    if (!memoryChanged) {
      if (onDisk !== undefined) {
        chosen.set(key, options.project(onDisk, inMemory));
        adopted.push(entryRef(options.group, key));
      }
      continue;
    }

    conflicts.push(entryRef(options.group, key));
    const winner = chooseConflictWinner(options, onDisk, inMemory);
    if (winner !== undefined)
      chosen.set(key, options.project(winner, inMemory));
  }

  return {
    chosen,
    adopted,
    conflicts,
  };
}

/** The entry that stands when both sides changed it, or none when it goes. */
function chooseConflictWinner(
  options: EntryMergeOptions,
  onDisk: Entry | undefined,
  inMemory: Entry | undefined,
): Entry | undefined {
  if (options.removalWins) {
    if (onDisk === undefined || inMemory === undefined) return undefined;
    return options.diskWinsConflicts ? onDisk : inMemory;
  }
  // An edit beats a removal on either side: nothing is silently deleted.
  if (onDisk === undefined) return inMemory;
  if (inMemory === undefined) return onDisk;
  return options.diskWinsConflicts ? onDisk : inMemory;
}

/**
 * Memory's order as the skeleton, with each entry added on disk inserted where
 * it sits on disk: before the first merged entry that follows it there, else
 * appended. Existing entries never move because of a merge.
 */
function orderMergedKeys(
  chosen: Map<string, Entry>,
  memoryOrder: readonly string[],
  diskOrder: readonly string[],
): string[] {
  const order: string[] = memoryOrder.filter((key) => chosen.has(key));
  const memoryKeys = new Set(memoryOrder);
  const diskIndex = new Map(diskOrder.map((key, index) => [key, index]));
  for (const key of diskOrder) {
    if (!chosen.has(key) || memoryKeys.has(key)) continue;
    const at = diskIndex.get(key) ?? Number.MAX_SAFE_INTEGER;
    let insertAt = order.length;
    for (let index = 0; index < order.length; index += 1) {
      const other = order[index];
      const otherAt = other === undefined ? undefined : diskIndex.get(other);
      if (otherAt !== undefined && otherAt > at) {
        insertAt = index;
        break;
      }
    }
    order.splice(insertAt, 0, key);
  }
  return order;
}

/**
 * Memory's order is the skeleton, or the delivered order when a delivery wins
 * its conflicts: both devices then settle on the order that arrived.
 */
function orderKeys(
  chosen: Map<string, Entry>,
  memoryOrder: readonly string[],
  diskOrder: readonly string[],
  options: SettingsMergeOptions,
): string[] {
  return options.diskWinsConflicts === true
    ? orderMergedKeys(chosen, diskOrder, memoryOrder)
    : orderMergedKeys(chosen, memoryOrder, diskOrder);
}

/** Keys of an array group in the order that side lists them. */
function feedOrder(
  list: unknown,
  side: string,
  idByUrl: ReadonlyMap<string, string>,
): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry, index) =>
    isRecord(entry) ? [feedKey(entry, side, index, idByUrl).key] : [],
  );
}

/** Per-entry merge for a group that has one, or null for any other group. */
function perEntryMerge(
  key: string,
  ancestor: SettingsAncestor,
  disk: Record<string, unknown>,
  memory: Record<string, unknown>,
  options: SettingsMergeOptions,
): PerEntryGroupMerge | null {
  if (key === "feeds") return mergeFeedsGroup(ancestor, disk, memory, options);
  if (key === "folders") {
    return mergeFoldersGroup(ancestor, disk, memory, options);
  }
  return null;
}

/**
 * Adopted feeds whose `folder` names no folder in the merged tree. They keep
 * the path, because a feed with an unknown folder already renders at the root
 * and rewriting the path on a guess would move the user's feed.
 */
function danglingFeedRefs(
  merged: Record<string, unknown>,
  adopted: readonly string[],
): SettingsGroupEntryRef[] {
  const folderPaths =
    folderMap(merged.folders)?.entries ?? new Map<string, Entry>();
  const feeds: unknown[] = Array.isArray(merged.feeds)
    ? (merged.feeds as unknown[])
    : [];
  const refs: SettingsGroupEntryRef[] = [];
  for (const key of adopted) {
    const feed = feeds.find(
      (entry) =>
        isRecord(entry) && feedKey(entry, "memory", -1, new Map()).key === key,
    );
    if (!isRecord(feed)) continue;
    const folder = feed.folder;
    if (
      typeof folder === "string" &&
      folder.length > 0 &&
      !folderPaths.has(folder)
    ) {
      refs.push(entryRef("feeds", key));
    }
  }
  return refs;
}

interface PerEntryGroupMerge {
  value: unknown;
  adopted: SettingsGroupEntryRef[];
  conflicts: SettingsGroupEntryRef[];
  dropped: SettingsGroupEntryRef[];
  duplicates: string[];
}

/** A feed's key in an ancestor: an id and a url hash apart, so neither clashes. */
function feedAncestorKey(kind: "i" | "u", value: string): string {
  return hashText(`${kind}:${value}`);
}

/** The ancestor's hash for a resolved feed key, by id, else by url. */
function feedBaseHash(
  stored: Record<string, string>,
  key: string,
  entry: Entry | undefined,
): string | undefined {
  const url = typeof entry?.url === "string" ? entry.url : undefined;
  return (
    stored[feedAncestorKey("i", key)] ??
    stored[feedAncestorKey("u", key)] ??
    (url === undefined ? undefined : stored[feedAncestorKey("u", url)])
  );
}

function mergeFeedsGroup(
  ancestor: SettingsAncestor,
  disk: Entry,
  memory: Entry,
  options: SettingsMergeOptions,
): PerEntryGroupMerge | null {
  const stored = ancestor.feeds;
  const idByUrl = feedIdsByUrl([disk.feeds, memory.feeds]);
  const onDisk = feedIndex(disk.feeds, "disk", idByUrl);
  const inMemory = feedIndex(memory.feeds, "memory", idByUrl);
  if (stored === undefined || onDisk === null || inMemory === null) return null;

  const merged = mergeEntries({
    baseHash: (key, entry) => feedBaseHash(stored, key, entry),
    disk: onDisk.entries,
    memory: inMemory.entries,
    group: "feeds",
    ignored: FEED_IGNORED,
    removalWins: false,
    diskWinsConflicts: options.diskWinsConflicts === true,
    project: projectFeed,
  });
  const order = orderKeys(
    merged.chosen,
    feedOrder(memory.feeds, "memory", idByUrl),
    feedOrder(disk.feeds, "disk", idByUrl),
    options,
  );
  return {
    value: order.map((key) => merged.chosen.get(key)),
    adopted: merged.adopted,
    conflicts: merged.conflicts,
    dropped: [],
    duplicates: [...onDisk.duplicates, ...inMemory.duplicates],
  };
}

function mergeFoldersGroup(
  ancestor: SettingsAncestor,
  disk: Entry,
  memory: Entry,
  options: SettingsMergeOptions,
): PerEntryGroupMerge | null {
  const stored = ancestor.folders;
  const onDisk = folderMap(disk.folders);
  const inMemory = folderMap(memory.folders);
  if (stored === undefined || onDisk === null || inMemory === null) return null;

  const merged = mergeEntries({
    baseHash: (path) => stored[hashText(path)],
    disk: onDisk.entries,
    memory: inMemory.entries,
    group: "folders",
    ignored: FOLDER_IGNORED,
    removalWins: true,
    diskWinsConflicts: options.diskWinsConflicts === true,
    project: (entry) => entry,
  });
  const order = orderKeys(merged.chosen, inMemory.order, onDisk.order, options);

  // A synced folder whose parent is gone cannot hang anywhere: drop it rather
  // than inventing the parent, which would duplicate a renamed folder.
  const accepted: string[] = [];
  const acceptedPaths = new Set<string>();
  const dropped: SettingsGroupEntryRef[] = [];
  for (const path of order) {
    if (parentPath(path) === "" || acceptedPaths.has(parentPath(path))) {
      accepted.push(path);
      acceptedPaths.add(path);
    } else {
      dropped.push(entryRef("folders", path));
    }
  }

  return {
    value: rebuildFolderTree(accepted, merged.chosen),
    adopted: merged.adopted.filter(
      (entry) => !dropped.some((orphan) => orphan.key === entry.key),
    ),
    conflicts: merged.conflicts,
    dropped,
    duplicates: [...onDisk.duplicates, ...inMemory.duplicates],
  };
}

/**
 * Takes disk's value for a whole group this device left untouched. Feeds are
 * re-indexed first so an id-less synced entry picks up the id this device
 * already knows for its url, and its shard stays attached.
 */
function adoptWholeGroup(
  key: string,
  disk: Record<string, unknown>,
  memory: Record<string, unknown>,
  merged: Record<string, unknown>,
  feedAdoptions: string[],
  duplicates: SettingsGroupEntryRef[],
): void {
  if (disk[key] === undefined) {
    delete merged[key];
    return;
  }
  if (key !== "feeds") {
    merged[key] = disk[key];
    return;
  }
  const idByUrl = feedIdsByUrl([disk.feeds, memory.feeds]);
  const diskFeeds = feedIndex(disk.feeds, "disk", idByUrl);
  if (diskFeeds === null) {
    merged[key] = disk[key];
    return;
  }
  merged[key] = [...diskFeeds.entries.values()].map((entry) =>
    projectFeed(entry, undefined),
  );
  feedAdoptions.push(...diskFeeds.entries.keys());
  duplicates.push(
    ...diskFeeds.duplicates.map((entry) => entryRef("feeds", entry)),
  );
}

/* ------------------------------------------------------------- public API */

/** The hashes a merge compares against, for a settings file as it stands. */
export function digestSettings(
  data: Record<string, unknown>,
): SettingsAncestor {
  const groups: Record<string, string> = {};
  for (const key of Object.keys(data)) {
    if (key === "_syncNonce" || key === "_syncPad") continue;
    groups[key] = groupHash(data[key]);
  }
  const ancestor: SettingsAncestor = { groups };

  const idByUrl = feedIdsByUrl([data.feeds]);
  const feeds = feedIndex(data.feeds, "ancestor", idByUrl);
  if (feeds !== null) {
    ancestor.feeds = {};
    for (const [key, entry] of feeds.entries) {
      if (key.startsWith("ancestor#")) continue;
      const kind =
        typeof entry.feedId === "string" && entry.feedId.length > 0 ? "i" : "u";
      ancestor.feeds[feedAncestorKey(kind, key)] = entryHash(
        entry,
        FEED_IGNORED,
      );
    }
  }
  const folders = folderMap(data.folders);
  if (folders !== null) {
    ancestor.folders = {};
    for (const [path, entry] of folders.entries) {
      ancestor.folders[hashText(path)] = entryHash(entry, FOLDER_IGNORED);
    }
  }
  return ancestor;
}

/**
 * Three-way merge of the settings file (#1431), per top-level group, with
 * `feeds` and `folders` merged per entry so two devices can each change a
 * different feed or folder without one losing the other's work (#1439).
 * `baseline` is what this device last wrote or loaded, `disk` is the file now,
 * and `memory` is the snapshot about to be written. Sync bookkeeping keys are
 * not groups.
 */
export function mergeSettingsGroups(
  baseline: Record<string, unknown>,
  disk: Record<string, unknown>,
  memory: Record<string, unknown>,
  options: SettingsMergeOptions = {},
): SettingsGroupMerge {
  return mergeSettingsAgainstAncestor(
    digestSettings(baseline),
    disk,
    memory,
    options,
  );
}

/**
 * The same merge with the ancestor as hashes (ADR 0036). `disk` is a delivered
 * file and `memory` this device's settings; with `diskWinsConflicts`, a group
 * or entry both sides changed takes the delivered value and is still reported
 * in `conflicts`, so the caller knows a local value was dropped.
 */
export function mergeSettingsAgainstAncestor(
  ancestor: SettingsAncestor,
  disk: Record<string, unknown>,
  memory: Record<string, unknown>,
  options: SettingsMergeOptions = {},
): SettingsGroupMerge {
  const merged = { ...memory };
  const adopted: string[] = [];
  const conflicts: string[] = [];
  const adoptedEntries: SettingsGroupEntryRef[] = [];
  const conflictEntries: SettingsGroupEntryRef[] = [];
  const droppedEntries: SettingsGroupEntryRef[] = [];
  const duplicateEntries: SettingsGroupEntryRef[] = [];
  const keys = new Set([
    ...Object.keys(ancestor.groups),
    ...Object.keys(disk),
    ...Object.keys(memory),
  ]);
  keys.delete("_syncNonce");
  keys.delete("_syncPad");

  const feedAdoptions: string[] = [];
  const missing = groupHash(undefined);

  for (const key of keys) {
    const base = ancestor.groups[key] ?? missing;
    const onDisk = groupHash(disk[key]);
    if (onDisk === base) continue;
    const inMemory = groupHash(memory[key]);
    if (inMemory === onDisk) continue;
    if (inMemory === base) {
      adoptWholeGroup(
        key,
        disk,
        memory,
        merged,
        feedAdoptions,
        duplicateEntries,
      );
      adopted.push(key);
      continue;
    }
    const perEntry = perEntryMerge(key, ancestor, disk, memory, options);
    if (perEntry === null) {
      const quiet =
        options.diskWinsConflicts === true && SETTINGS_BOOKKEEPING.has(key);
      if (!quiet) conflicts.push(key);
      if (options.diskWinsConflicts === true) {
        adoptWholeGroup(
          key,
          disk,
          memory,
          merged,
          feedAdoptions,
          duplicateEntries,
        );
      }
      continue;
    }
    merged[key] = perEntry.value;
    adoptedEntries.push(...perEntry.adopted);
    conflictEntries.push(...perEntry.conflicts);
    droppedEntries.push(...perEntry.dropped);
    duplicateEntries.push(
      ...perEntry.duplicates.map((entry) =>
        entryRef(key === "folders" ? "folders" : "feeds", entry),
      ),
    );
    if (key === "feeds") {
      feedAdoptions.push(...perEntry.adopted.map((entry) => entry.key));
      if (options.diskWinsConflicts === true) {
        feedAdoptions.push(...perEntry.conflicts.map((entry) => entry.key));
      }
    }
  }

  // A synced feed keeps its folder path even when that path names no folder:
  // it renders as a root feed, and rewriting the path on a guess would move
  // the user's feed. Report the mismatch instead.
  const danglingEntries = danglingFeedRefs(merged, feedAdoptions);

  return {
    merged,
    adopted,
    conflicts,
    adoptedEntries,
    conflictEntries,
    droppedEntries,
    danglingEntries,
    duplicateEntries,
  };
}

/** A group's content with the churn the merge ignores, in order. */
function groupSignature(key: string, value: unknown): string {
  if (key === "feeds") {
    const feeds = feedIndex(value, "signature", feedIdsByUrl([value]));
    if (feeds === null) return groupHash(value);
    return [...feeds.entries]
      .map(
        ([entryKey, entry]) => `${entryKey}:${entryHash(entry, FEED_IGNORED)}`,
      )
      .join(",");
  }
  if (key === "folders") {
    const folders = folderMap(value);
    if (folders === null) return groupHash(value);
    return folders.order
      .map((path) => {
        const entry = folders.entries.get(path);
        return `${path}:${entryHash(entry, FOLDER_IGNORED)}`;
      })
      .join(",");
  }
  return groupHash(value);
}

/**
 * The groups of a merged result that hold something the delivered file does
 * not: this device's edits that survived (ADR 0036). A key only in memory, not
 * in the delivered file or the ancestor, is not part of the file and is left
 * out. Feed items, feed bookkeeping and folder timestamps do not count.
 */
export function groupsKeptFromMemory(
  ancestor: SettingsAncestor,
  disk: Record<string, unknown>,
  merged: Record<string, unknown>,
): string[] {
  const kept: string[] = [];
  const keys = new Set([...Object.keys(ancestor.groups), ...Object.keys(disk)]);
  keys.delete("_syncNonce");
  keys.delete("_syncPad");
  for (const key of keys) {
    if (groupSignature(key, merged[key]) !== groupSignature(key, disk[key])) {
      kept.push(key);
    }
  }
  return kept;
}
