import { App, normalizePath } from "obsidian";
import type { ArticleUserState, Tag } from "../types/types";
import { cloneJson } from "./storage-json";

/**
 * Device-local folder inside the plugin directory (#1386). It is deliberately
 * outside the shared metadata folder and outside the feed shards folder, so no
 * sync, export, migration, repair, or auto-backup path reaches the journal.
 */
export const USER_STATE_JOURNAL_FOLDER = "device-local";
export const USER_STATE_JOURNAL_FILE = "user-state-journal.jsonl";

/** The changed fields of one article, appended as one journal record. */
export interface UserStateJournalChange {
  feedId: string;
  guid: string;
  changes: ArticleUserState;
}

/**
 * One self-contained, append-only journal record. `seq` orders records and is
 * compared with the shared snapshot's `checkpointSequence` on replay.
 */
export interface UserStateJournalRecord {
  seq: number;
  deviceId: string;
  timestamp: number;
  feedId: string;
  guid: string;
  changes: ArticleUserState;
}

export interface UserStateJournalOptions {
  /** Device-local plugin folder (`manifest.dir`), never a shared folder. */
  pluginDir: string;
  writeWrapper?: <T>(fn: () => Promise<T>) => Promise<T>;
}

function storageError(_message: string, _error: unknown): void {}

export function getUserStateJournalFolder(pluginDir: string): string {
  return normalizePath(
    `${pluginDir.replace(/^\/+|\/+$/g, "")}/${USER_STATE_JOURNAL_FOLDER}`,
  );
}

export function getUserStateJournalPath(pluginDir: string): string {
  return normalizePath(
    `${getUserStateJournalFolder(pluginDir)}/${USER_STATE_JOURNAL_FILE}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTag(value: unknown): value is Tag {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.color === "string"
  );
}

/**
 * Keeps only the known article-state fields a record carries, and rejects the
 * record when a present field has the wrong shape. Rejecting rather than
 * coercing keeps a partially written record from corrupting replay.
 */
function readChangedFields(value: unknown): ArticleUserState | null {
  if (!isRecord(value)) return null;

  const changes: ArticleUserState = {};
  for (const field of ["read", "starred", "saved"] as const) {
    if (!(field in value)) continue;
    if (typeof value[field] !== "boolean") return null;
    changes[field] = value[field];
  }

  if ("tags" in value) {
    if (!Array.isArray(value.tags) || !value.tags.every(isTag)) return null;
    changes.tags = value.tags.map((tag) => ({
      name: tag.name,
      color: tag.color,
    }));
  }

  if ("savedFilePath" in value) {
    if (typeof value.savedFilePath !== "string") return null;
    changes.savedFilePath = value.savedFilePath;
  }

  if ("playbackProgress" in value) {
    const progress = value.playbackProgress;
    if (
      !isRecord(progress) ||
      typeof progress.position !== "number" ||
      typeof progress.duration !== "number" ||
      typeof progress.lastUpdated !== "number"
    ) {
      return null;
    }
    changes.playbackProgress = {
      position: progress.position,
      duration: progress.duration,
      lastUpdated: progress.lastUpdated,
    };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

function toJournalRecord(value: unknown): UserStateJournalRecord | null {
  if (!isRecord(value)) return null;
  const { seq, deviceId, timestamp, feedId, guid } = value;
  if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 0) return null;
  if (typeof deviceId !== "string" || deviceId.length === 0) return null;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
  if (typeof feedId !== "string" || feedId.length === 0) return null;
  if (typeof guid !== "string" || guid.length === 0) return null;
  const changes = readChangedFields(value.changes);
  if (!changes) return null;
  return { seq, deviceId, timestamp, feedId, guid, changes };
}

/**
 * Parses journal lines in order, skipping any line that is not a complete,
 * valid record. An interrupted append leaves a partial final line; skipping it
 * keeps every earlier record and never fails startup.
 */
export function parseUserStateJournal(raw: string): UserStateJournalRecord[] {
  const records: UserStateJournalRecord[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    const record = toJournalRecord(parsed);
    if (record) records.push(record);
  }
  return records.sort((left, right) => left.seq - right.seq);
}

/**
 * Applies replayable records onto a snapshot-keyed state map in sequence order.
 * A record at or below `checkpointSequence` is already folded into the
 * snapshot, so replay skips it; applying the same journal twice therefore
 * produces the same state. Returns the highest sequence seen.
 */
export function foldUserStateJournalRecords(
  states: Record<string, ArticleUserState>,
  records: readonly UserStateJournalRecord[],
  checkpointSequence: number,
): number {
  let lastSequence = checkpointSequence;
  for (const record of records) {
    if (record.seq > lastSequence) {
      lastSequence = record.seq;
    }
    if (record.seq <= checkpointSequence) continue;
    const key = `${record.feedId}:${record.guid}`;
    const base = states[key] ? cloneJson(states[key]) : {};
    states[key] = { ...base, ...cloneJson(record.changes) };
  }
  return lastSequence;
}

/**
 * A stable identifier for this device. It is derived from the vault's base
 * path when the adapter exposes one, so it does not change across restarts,
 * and falls back to a random identifier where it does not (mobile). The value
 * is informational: the journal is device-local and never synced.
 */
function createDeviceId(app: App): string {
  let basePath = "";
  try {
    // `getBasePath` is a desktop-only adapter member; mobile exposes no
    // vault path, so the random fallback applies there.
    const adapter = app.vault.adapter as unknown as {
      getBasePath?: () => string;
    };
    basePath = adapter.getBasePath?.() ?? "";
  } catch {
    basePath = "";
  }
  if (!basePath) {
    const randomUuid = window.crypto?.randomUUID?.();
    return `device-${randomUuid ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < basePath.length; index += 1) {
    hash ^= basePath.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `device-${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Append-only, device-local journal for the shared article-state snapshot.
 * Owned by `UserStateStore`; callers append through that store so the write
 * gate stays in one place.
 */
export class UserStateJournal {
  private readonly app: App;
  private readonly path: string;
  private readonly folder: string;
  private readonly deviceId: string;
  private readonly writeWrapper?: <T>(fn: () => Promise<T>) => Promise<T>;
  private loaded = false;
  /** Highest sequence assigned or read, so appended records stay ordered. */
  lastSequence = 0;

  constructor(app: App, options: UserStateJournalOptions) {
    this.app = app;
    this.path = getUserStateJournalPath(options.pluginDir);
    this.folder = getUserStateJournalFolder(options.pluginDir);
    this.deviceId = createDeviceId(app);
    this.writeWrapper = options.writeWrapper;
  }

  /** Every complete record on disk, ordered by sequence. Missing is empty. */
  public async read(): Promise<UserStateJournalRecord[]> {
    this.loaded = true;
    const exists = await this.app.vault.adapter.exists(this.path);
    if (!exists) return [];
    try {
      const raw = await this.app.vault.adapter.read(this.path);
      const records = parseUserStateJournal(raw);
      for (const record of records) {
        if (record.seq > this.lastSequence) this.lastSequence = record.seq;
      }
      return records;
    } catch (error) {
      storageError("Failed to read the user-state journal", error);
      return [];
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.read();
  }

  /**
   * Appends one self-contained record per change. Invalid changes are skipped
   * rather than failing the append of valid ones.
   */
  public async append(
    changes: readonly UserStateJournalChange[],
  ): Promise<void> {
    if (changes.length === 0) return;
    await this.ensureLoaded();

    const timestamp = Date.now();
    const lines: string[] = [];
    for (const change of changes) {
      const feedId = change.feedId.trim();
      const guid = change.guid.trim();
      const changedFields = readChangedFields(change.changes);
      if (!feedId || !guid || !changedFields) continue;
      this.lastSequence += 1;
      lines.push(
        JSON.stringify({
          seq: this.lastSequence,
          deviceId: this.deviceId,
          timestamp,
          feedId,
          guid,
          changes: changedFields,
        }),
      );
    }
    if (lines.length === 0) return;

    const write = async (): Promise<void> => {
      if (!(await this.app.vault.adapter.exists(this.folder))) {
        await this.app.vault.adapter.mkdir(this.folder);
      }
      await this.app.vault.adapter.append(this.path, `${lines.join("\n")}\n`);
    };
    if (this.writeWrapper) {
      await this.writeWrapper(write);
    } else {
      await write();
    }
  }
}
