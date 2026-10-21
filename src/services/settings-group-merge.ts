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

/** Everything about an entry the merge compares, with owned and churn fields removed. */
function entryJson(
  entry: Entry | undefined,
  ignored: readonly string[],
): string {
  if (entry === undefined) return "\u0000missing";
  return groupJson(withoutKeys(entry, ignored));
}

function entryRef(
  group: SettingsEntryGroup,
  key: string,
): SettingsGroupEntryRef {
  return { group, key };
}

/* ------------------------------------------------------------------ feeds */

/** A feed's merge key: its id, else the url of a pre-id or foreign entry. */
function feedKey(entry: Entry, side: string, index: number): string {
  const id = entry.feedId;
  if (typeof id === "string" && id.length > 0) return id;
  const url = entry.url;
  if (typeof url === "string" && url.length > 0) return url;
  // Unkeyable: never matches another side, so it merges as an addition.
  return `${side}#${index}`;
}

function feedMap(list: unknown, side: string): Map<string, Entry> | null {
  if (!Array.isArray(list)) return null;
  const entries = new Map<string, Entry>();
  list.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const key = feedKey(entry, side, index);
    if (!entries.has(key)) entries.set(key, entry);
  });
  return entries;
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
): void {
  if (!Array.isArray(list)) return;
  for (const folder of list) {
    if (!isRecord(folder) || typeof folder.name !== "string") continue;
    const path = base ? `${base}/${folder.name}` : folder.name;
    if (out.has(path)) continue;
    out.set(path, withoutKeys(folder, FOLDER_OWNED));
    order.push(path);
    collectFolders(folder.subfolders, path, out, order);
  }
}

function folderMap(
  list: unknown,
): { entries: Map<string, Entry>; order: string[] } | null {
  if (!Array.isArray(list)) return null;
  const entries = new Map<string, Entry>();
  const order: string[] = [];
  collectFolders(list, "", entries, order);
  return { entries, order };
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
  base: Map<string, Entry>;
  disk: Map<string, Entry>;
  memory: Map<string, Entry>;
  group: SettingsEntryGroup;
  ignored: readonly string[];
  /** A folder rename is a removal plus an addition, so removals are final. */
  removalWins: boolean;
  project: (entry: Entry, memoryEntry: Entry | undefined) => Entry;
}

/**
 * Three-way merge of one per-entry group. Per key: changed on one side only
 * takes that side; changed on both keeps memory's value and reports the key.
 * A removal beats an edit when `removalWins`, so a rename is not undone by the
 * other side editing the renamed-away entry; otherwise the edit wins, so a feed
 * is never silently deleted.
 */
function mergeEntries(options: EntryMergeOptions): EntryMerge {
  const { base, disk, memory, ignored } = options;
  const chosen = new Map<string, Entry>();
  const adopted: SettingsGroupEntryRef[] = [];
  const conflicts: SettingsGroupEntryRef[] = [];
  const keys = new Set([...base.keys(), ...disk.keys(), ...memory.keys()]);

  for (const key of keys) {
    const before = base.get(key);
    const onDisk = disk.get(key);
    const inMemory = memory.get(key);
    const diskChanged =
      entryJson(onDisk, ignored) !== entryJson(before, ignored);
    const memoryChanged =
      entryJson(inMemory, ignored) !== entryJson(before, ignored);

    if (onDisk === undefined && inMemory === undefined) continue;
    if (!diskChanged) {
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
    if (options.removalWins) {
      if (onDisk !== undefined && inMemory !== undefined) {
        chosen.set(key, options.project(inMemory, inMemory));
      }
      continue;
    }
    if (onDisk === undefined) {
      chosen.set(key, options.project(inMemory as Entry, inMemory));
      continue;
    }
    chosen.set(key, options.project(inMemory ?? onDisk, inMemory));
  }

  return {
    chosen,
    adopted,
    conflicts,
  };
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

/** Keys of an array group in the order that side lists them. */
function feedOrder(list: unknown, side: string): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry, index) =>
    isRecord(entry) ? [feedKey(entry, side, index)] : [],
  );
}

/** Per-entry merge for a group that has one, or null for any other group. */
function perEntryMerge(
  key: string,
  baseline: Record<string, unknown>,
  disk: Record<string, unknown>,
  memory: Record<string, unknown>,
): PerEntryGroupMerge | null {
  if (key === "feeds") return mergeFeedsGroup(baseline, disk, memory);
  if (key === "folders") return mergeFoldersGroup(baseline, disk, memory);
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
      (entry) => isRecord(entry) && feedKey(entry, "memory", -1) === key,
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
}

function mergeFeedsGroup(
  baseline: Entry,
  disk: Entry,
  memory: Entry,
): PerEntryGroupMerge | null {
  const base = feedMap(baseline.feeds, "base");
  const onDisk = feedMap(disk.feeds, "disk");
  const inMemory = feedMap(memory.feeds, "memory");
  if (base === null || onDisk === null || inMemory === null) return null;

  const merged = mergeEntries({
    base,
    disk: onDisk,
    memory: inMemory,
    group: "feeds",
    ignored: FEED_IGNORED,
    removalWins: false,
    project: projectFeed,
  });
  const order = orderMergedKeys(
    merged.chosen,
    feedOrder(memory.feeds, "memory"),
    feedOrder(disk.feeds, "disk"),
  );
  return {
    value: order.map((key) => merged.chosen.get(key)),
    adopted: merged.adopted,
    conflicts: merged.conflicts,
    dropped: [],
  };
}

function mergeFoldersGroup(
  baseline: Entry,
  disk: Entry,
  memory: Entry,
): PerEntryGroupMerge | null {
  const base = folderMap(baseline.folders);
  const onDisk = folderMap(disk.folders);
  const inMemory = folderMap(memory.folders);
  if (base === null || onDisk === null || inMemory === null) return null;

  const merged = mergeEntries({
    base: base.entries,
    disk: onDisk.entries,
    memory: inMemory.entries,
    group: "folders",
    ignored: FOLDER_IGNORED,
    removalWins: true,
    project: (entry) => entry,
  });
  const order = orderMergedKeys(merged.chosen, inMemory.order, onDisk.order);

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
  };
}

/* ------------------------------------------------------------- public API */

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
): SettingsGroupMerge {
  const merged = { ...memory };
  const adopted: string[] = [];
  const conflicts: string[] = [];
  const adoptedEntries: SettingsGroupEntryRef[] = [];
  const conflictEntries: SettingsGroupEntryRef[] = [];
  const droppedEntries: SettingsGroupEntryRef[] = [];
  const keys = new Set([
    ...Object.keys(baseline),
    ...Object.keys(disk),
    ...Object.keys(memory),
  ]);
  keys.delete("_syncNonce");
  keys.delete("_syncPad");

  const feedAdoptions: string[] = [];

  for (const key of keys) {
    const base = groupJson(baseline[key]);
    const onDisk = groupJson(disk[key]);
    if (onDisk === base) continue;
    const inMemory = groupJson(memory[key]);
    if (inMemory === onDisk) continue;
    if (inMemory === base) {
      if (disk[key] === undefined) delete merged[key];
      else merged[key] = disk[key];
      adopted.push(key);
      if (key === "feeds") {
        feedAdoptions.push(...(feedMap(disk.feeds, "disk")?.keys() ?? []));
      }
      continue;
    }
    const perEntry = perEntryMerge(key, baseline, disk, memory);
    if (perEntry === null) {
      conflicts.push(key);
      continue;
    }
    merged[key] = perEntry.value;
    adoptedEntries.push(...perEntry.adopted);
    conflictEntries.push(...perEntry.conflicts);
    droppedEntries.push(...perEntry.dropped);
    if (key === "feeds") {
      feedAdoptions.push(...perEntry.adopted.map((entry) => entry.key));
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
  };
}
