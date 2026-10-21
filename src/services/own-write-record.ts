import { normalizePath } from "obsidian";
import { comparableSnapshotJson } from "./storage-json";

/**
 * The **Own write** record (#1422): the comparable content of every watched
 * vault file as this device last wrote or loaded it, keyed by normalized path.
 * The watcher skips a change that matches (an own write) and reloads every
 * other one, and the save-time unseen-change checks (#1418, #1431) read the
 * same record. It is recognized by content, never by timing (#1413).
 *
 * Covers `data.json` and `user-state.json` in the metadata folder and every
 * Shard storage v2 feed shard. Two things stay out of it on purpose:
 * `pluginDataBaseline` and `pluginDataBaselineData` in the settings store
 * track what Obsidian's `saveData`/`loadData` last held, not a vault-adapter
 * path, and `pluginDataBaselineData` keeps the object the #1431 group merge
 * needs. They can reuse `comparableFromText` here.
 */

/** Comparable form of a watched file's text, or null when unparseable. */
export function comparableFromText(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? comparableSnapshotJson(parsed)
      : null;
  } catch {
    return null;
  }
}

/** The key a path is recorded under: normalized and slash-trimmed. */
export function ownWriteKey(path: string): string {
  return normalizePath(path.trim().replace(/\\/g, "/")).replace(
    /^\/+|\/+$/g,
    "",
  );
}

export class OwnWriteRecord {
  private readonly comparables = new Map<string, string>();

  /** The recorded comparable content for a path, if any. */
  comparableOf(path: string): string | undefined {
    return this.comparables.get(ownWriteKey(path));
  }

  /**
   * Records what a load read from a watched file, so a later event for the
   * same content is recognized as this device's own. Unparseable text drops
   * the record, so the next event reloads.
   */
  recordRead(path: string, text: string): void {
    const comparable = comparableFromText(text);
    if (comparable === null) {
      this.comparables.delete(ownWriteKey(path));
      return;
    }
    this.comparables.set(ownWriteKey(path), comparable);
  }

  /** Records a snapshot object a load already parsed. */
  recordSnapshot(path: string, snapshot: object): void {
    this.comparables.set(ownWriteKey(path), comparableSnapshotJson(snapshot));
  }

  /** Drops the record, so a later copy of the old content reloads. */
  forget(path: string): void {
    this.comparables.delete(ownWriteKey(path));
  }

  /** Drops every record. */
  clear(): void {
    this.comparables.clear();
  }

  /**
   * Runs a plugin write to a watched file and records its content, so the
   * watcher tells the plugin's own write from a synced change by content. The
   * record moves before the write lands, so events that arrive early still
   * match; a failed write restores the previous record unless a later write
   * replaced it.
   */
  async write<T>(
    path: string,
    content: string,
    writeFn: () => Promise<T>,
  ): Promise<T> {
    const key = ownWriteKey(path);
    const previous = this.comparables.get(key);
    const written = comparableFromText(content);
    if (written === null) this.comparables.delete(key);
    else this.comparables.set(key, written);
    try {
      return await writeFn();
    } catch (error) {
      if (this.comparables.get(key) === (written ?? undefined)) {
        if (previous === undefined) this.comparables.delete(key);
        else this.comparables.set(key, previous);
      }
      throw error;
    }
  }

  /** Whether a watched file still holds what this device recorded. */
  async matchesDisk(
    path: string,
    read: (path: string) => Promise<string>,
  ): Promise<boolean> {
    const record = this.comparables.get(ownWriteKey(path));
    if (record === undefined) return false;
    try {
      return comparableFromText(await read(path)) === record;
    } catch {
      return false;
    }
  }

  /**
   * Whether a watched file holds a parseable change this device has not
   * loaded. Without a record there is nothing to compare, so the watcher
   * reloads on the event instead.
   */
  async hasUnseenChange(
    path: string,
    read: (path: string) => Promise<string>,
  ): Promise<boolean> {
    const record = this.comparables.get(ownWriteKey(path));
    if (record === undefined) return false;
    try {
      const comparable = comparableFromText(await read(path));
      return comparable !== null && comparable !== record;
    } catch {
      return false;
    }
  }
}
