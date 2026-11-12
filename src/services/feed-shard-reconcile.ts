import type { FeedItem, FeedItemsShard } from "../types/types";
import { comparableSnapshotJson } from "./storage-json";

/** A conflicting shard must stay on disk until the caller resolves it. */
export interface FeedShardConflictContext {
  feedId: string;
  local: FeedItemsShard;
  ancestor: FeedItemsShard;
  incoming: FeedItemsShard;
}

export class FeedShardConflict extends Error {
  context?: FeedShardConflictContext;
}

const equal = (a: unknown, b: unknown): boolean =>
  comparableSnapshotJson({ value: a }) === comparableSnapshotJson({ value: b });

function comparableItem(item: FeedItem, stripState: boolean): FeedItem {
  if (!stripState) return item;
  const copy = { ...item };
  delete copy.read;
  delete copy.starred;
  delete copy.tags;
  delete copy.saved;
  delete copy.savedFilePath;
  delete copy.playbackProgress;
  return copy;
}

function indexItems(items: FeedItem[]): Map<string, FeedItem> {
  const result = new Map<string, FeedItem>();
  for (const item of items) {
    if (!item || typeof item.guid !== "string" || result.has(item.guid))
      throw new FeedShardConflict(
        "Invalid or duplicate article identity in synced shard",
      );
    result.set(item.guid, item);
  }
  return result;
}

function mergeItem(
  base: FeedItem,
  local: FeedItem,
  remote: FeedItem,
  choice?: "local" | "synced",
): FeedItem {
  const merged = { ...local } as Record<string, unknown>;
  const before = base as unknown as Record<string, unknown>;
  const ours = local as unknown as Record<string, unknown>;
  const theirs = remote as unknown as Record<string, unknown>;
  for (const key of new Set([
    ...Object.keys(before),
    ...Object.keys(ours),
    ...Object.keys(theirs),
  ])) {
    const localChanged = !equal(ours[key], before[key]);
    const remoteChanged = !equal(theirs[key], before[key]);
    if (localChanged && remoteChanged && !equal(ours[key], theirs[key])) {
      if (!choice)
        throw new FeedShardConflict(`Conflicting article field: ${key}`);
      if (choice === "synced") {
        if (key in theirs) merged[key] = theirs[key];
        else delete merged[key];
      }
      continue;
    }
    if (!localChanged && remoteChanged) {
      if (key in theirs) merged[key] = theirs[key];
      else delete merged[key];
    }
  }
  const enrichment = merged.refreshEnrichment as FeedItem["refreshEnrichment"];
  if (enrichment && enrichment.url !== merged.link) {
    if (!choice)
      throw new FeedShardConflict(
        "Article URL changed while a preview was synced",
      );
    const selected = choice === "local" ? local : remote;
    merged.link = selected.link;
    if (selected.refreshEnrichment?.url === selected.link)
      merged.refreshEnrichment = selected.refreshEnrichment;
    else delete merged.refreshEnrichment;
  }
  return merged as unknown as FeedItem;
}

/** Merge independently edited article fields and additions against the last read shard. */
export function reconcileFeedShard(
  base: FeedItemsShard,
  local: FeedItem[],
  remote: FeedItemsShard,
  stripState = false,
): FeedItem[] {
  if (
    base.feedId !== remote.feedId ||
    base.feedUrl !== remote.feedUrl ||
    !Array.isArray(base.items) ||
    !Array.isArray(remote.items)
  )
    throw new FeedShardConflict("Synced shard identity changed");
  const ancestor = indexItems(base.items);
  const current = indexItems(local);
  const incoming = indexItems(remote.items);
  const result: FeedItem[] = [];
  for (const id of new Set([...current.keys(), ...incoming.keys()])) {
    const before = ancestor.get(id);
    const ours = current.get(id);
    const theirs = incoming.get(id);
    if (!before) {
      if (
        ours &&
        theirs &&
        !equal(
          comparableItem(ours, stripState),
          comparableItem(theirs, stripState),
        )
      )
        throw new FeedShardConflict("Conflicting new article");
      if (ours ?? theirs) result.push((ours ?? theirs) as FeedItem);
    } else if (!ours || !theirs) {
      const survivor = ours ?? theirs;
      if (
        survivor &&
        !equal(
          comparableItem(survivor, stripState),
          comparableItem(before, stripState),
        )
      )
        throw new FeedShardConflict(
          "Article changed while removed on another device",
        );
    } else {
      result.push(mergeItem(before, ours, theirs));
    }
  }
  return result;
}

/** Names every article that needs an explicit local-or-synced choice. */
export function identifyConflictingArticles(
  context: FeedShardConflictContext,
  stripState = false,
): string[] {
  const { ancestor, local, incoming } = context;
  const baseItems = indexItems(ancestor.items);
  const localItems = indexItems(local.items);
  const incomingItems = indexItems(incoming.items);
  const ids = new Set([
    ...baseItems.keys(),
    ...localItems.keys(),
    ...incomingItems.keys(),
  ]);
  const conflicts: string[] = [];
  for (const id of ids) {
    const base = baseItems.get(id);
    const ours = localItems.get(id);
    const theirs = incomingItems.get(id);
    try {
      reconcileFeedShard(
        { ...ancestor, items: base ? [base] : [] },
        ours ? [ours] : [],
        { ...incoming, items: theirs ? [theirs] : [] },
        stripState,
      );
    } catch (error) {
      if (!(error instanceof FeedShardConflict)) throw error;
      conflicts.push(id);
    }
  }
  return conflicts;
}

/** Apply an explicit choice to each conflicting article while merging the rest. */
export function resolveConflictingArticles(
  context: FeedShardConflictContext,
  choices: Readonly<Record<string, "local" | "synced">>,
  stripState = false,
): FeedItem[] {
  const { ancestor, local, incoming } = context;
  const conflicting = new Set(identifyConflictingArticles(context, stripState));
  for (const id of conflicting) {
    if (choices[id] !== "local" && choices[id] !== "synced")
      throw new FeedShardConflict("An article conflict needs a choice");
  }
  const base = indexItems(ancestor.items);
  const ours = indexItems(local.items);
  const theirs = indexItems(incoming.items);
  const result: FeedItem[] = [];
  for (const id of new Set([...ours.keys(), ...theirs.keys()])) {
    if (conflicting.has(id)) {
      const prior = base.get(id);
      const localItem = ours.get(id);
      const remoteItem = theirs.get(id);
      if (prior && localItem && remoteItem) {
        result.push(mergeItem(prior, localItem, remoteItem, choices[id]));
        continue;
      }
      const chosen = choices[id] === "local" ? ours.get(id) : theirs.get(id);
      if (chosen) result.push(chosen);
      continue;
    }
    const prior = base.get(id);
    const localItem = ours.get(id);
    const remoteItem = theirs.get(id);
    result.push(
      ...reconcileFeedShard(
        { ...ancestor, items: prior ? [prior] : [] },
        localItem ? [localItem] : [],
        { ...incoming, items: remoteItem ? [remoteItem] : [] },
        stripState,
      ),
    );
  }
  return result;
}

/** Adopt saved remote changes without replacing edits made while the write awaited I/O. */
export function adoptReconciledItems(
  before: FeedItem[],
  current: FeedItem[],
  saved: FeedItem[],
): FeedItem[] {
  const original = indexItems(before);
  const persisted = indexItems(saved);
  const currentIds = new Set(current.map((item) => item.guid));
  const result: FeedItem[] = [];
  for (const item of current) {
    const old = original.get(item.guid);
    const written = persisted.get(item.guid);
    if (!old || !written) {
      if (!old || !equal(item, old)) result.push(item);
      continue;
    }
    const live = item as unknown as Record<string, unknown>;
    const ancestor = old as unknown as Record<string, unknown>;
    const disk = written as unknown as Record<string, unknown>;
    for (const key of new Set([
      ...Object.keys(ancestor),
      ...Object.keys(disk),
    ])) {
      if (equal(live[key], ancestor[key]) && !equal(disk[key], ancestor[key])) {
        if (key in disk) live[key] = disk[key];
        else delete live[key];
      }
    }
    result.push(item);
  }
  for (const item of saved) {
    if (!original.has(item.guid) && !currentIds.has(item.guid))
      result.push(item);
  }
  return result;
}
