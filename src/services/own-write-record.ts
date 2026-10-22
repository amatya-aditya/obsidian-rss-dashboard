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

/**
 * One recorded file: either its comparable form, or the raw text of a load
 * whose comparable form nothing has asked for yet (#1521).
 */
type OwnWriteEntry = { comparable: string } | { raw: string };

export class OwnWriteRecord {
  private readonly entries = new Map<string, OwnWriteEntry>();

  /**
   * The comparable content of a key. A load records only the raw text; the
   * first comparison canonicalizes it and keeps the result, so a start that
   * nothing compares never pays for it. Unparseable text drops the record,
   * as `recordRead` did when it canonicalized eagerly.
   */
  private resolve(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if ("comparable" in entry) return entry.comparable;
    const comparable = comparableFromText(entry.raw);
    if (comparable === null) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.set(key, { comparable });
    return comparable;
  }

  /** The recorded comparable content for a path, if any. */
  comparableOf(path: string): string | undefined {
    return this.resolve(ownWriteKey(path));
  }

  /**
   * Records what a load read from a watched file, so a later event for the
   * same content is recognized as this device's own. Unparseable text drops
   * the record, so the next event reloads.
   */
  recordRead(path: string, text: string): void {
    this.entries.set(ownWriteKey(path), { raw: text });
  }

  /** Records a snapshot object a load already parsed. */
  recordSnapshot(path: string, snapshot: object): void {
    this.entries.set(ownWriteKey(path), {
      comparable: comparableSnapshotJson(snapshot),
    });
  }

  /** Drops the record, so a later copy of the old content reloads. */
  forget(path: string): void {
    this.entries.delete(ownWriteKey(path));
  }

  /**
   * Drops the records of the shard files directly inside a folder, such as
   * before a hydration records them again. The metadata files and anything in
   * a subfolder keep their records.
   */
  forgetShardsIn(folder: string): void {
    const key = ownWriteKey(folder);
    const prefix = key === "" ? "" : `${key}/`;
    for (const entry of [...this.entries.keys()]) {
      if (!entry.startsWith(prefix)) continue;
      const name = entry.slice(prefix.length);
      if (name.includes("/") || !name.endsWith(".json")) continue;
      if (name === "data.json" || name === "user-state.json") continue;
      this.entries.delete(entry);
    }
  }

  /**
   * Records the content a plugin write is about to put on disk, so the
   * watcher tells the plugin's own write from a synced change by content. The
   * record moves before the write lands, so events that arrive early still
   * match. The returned function undoes it for a failed write, unless a later
   * write replaced the record. A caller that must not add an await uses this
   * directly; `write` wraps it.
   */
  recordPendingWrite(path: string, content: string): () => void {
    const key = ownWriteKey(path);
    const previous = this.entries.get(key);
    const comparable = comparableFromText(content);
    const written: OwnWriteEntry | undefined =
      comparable === null ? undefined : { comparable };
    if (written === undefined) this.entries.delete(key);
    else this.entries.set(key, written);
    return () => {
      if (this.entries.get(key) === written) {
        if (previous === undefined) this.entries.delete(key);
        else this.entries.set(key, previous);
      }
    };
  }

  /** Runs a plugin write to a watched file under `recordPendingWrite`. */
  async write<T>(
    path: string,
    content: string,
    writeFn: () => Promise<T>,
  ): Promise<T> {
    const rollback = this.recordPendingWrite(path, content);
    try {
      return await writeFn();
    } catch (error) {
      rollback();
      throw error;
    }
  }

  /** Whether a watched file still holds what this device recorded. */
  async matchesDisk(
    path: string,
    read: (path: string) => Promise<string>,
  ): Promise<boolean> {
    const record = this.resolve(ownWriteKey(path));
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
    const record = this.resolve(ownWriteKey(path));
    if (record === undefined) return false;
    try {
      const comparable = comparableFromText(await read(path));
      return comparable !== null && comparable !== record;
    } catch {
      return false;
    }
  }
}
