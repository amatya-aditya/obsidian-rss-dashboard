import { App } from "obsidian";
import type { FeedShardConflictContext } from "./feed-shard-reconcile";
import {
  loadVaultLocalStorage,
  saveVaultLocalStorage,
} from "../utils/vault-local-storage";

const RECOVERY_KEY = "feed-shard-conflict-recovery-v1";

function isRecoveryContext(value: unknown): value is FeedShardConflictContext {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.feedId !== "string" || !record.feedId) return false;
  return [record.local, record.ancestor, record.incoming].every((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const shard = candidate as Record<string, unknown>;
    if (
      shard.feedId !== record.feedId ||
      typeof shard.feedUrl !== "string" ||
      !Array.isArray(shard.items)
    )
      return false;
    const guids = new Set<string>();
    for (const item of shard.items as unknown[]) {
      if (!item || typeof item !== "object") return false;
      const guid = (item as Record<string, unknown>).guid;
      if (typeof guid !== "string" || guids.has(guid)) return false;
      guids.add(guid);
    }
    return true;
  });
}

/** Keeps recovery copies in vault-scoped device-local storage, not vault files. */
export class FeedShardConflictRecovery {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly app: App) {}

  private load(): Record<string, string> {
    const raw = loadVaultLocalStorage(this.app, RECOVERY_KEY);
    if (raw == null) return {};
    if (typeof raw !== "string")
      throw new Error("Invalid conflict recovery storage");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid conflict recovery storage");
    const entries = value as Record<string, unknown>;
    for (const [name, content] of Object.entries(entries)) {
      if (!/^\d+-\d+\.json$/.test(name) || typeof content !== "string")
        throw new Error("Invalid conflict recovery storage");
    }
    return entries as Record<string, string>;
  }

  private save(entries: Record<string, string>): void {
    const content = JSON.stringify(entries);
    saveVaultLocalStorage(this.app, RECOVERY_KEY, content);
    if (loadVaultLocalStorage(this.app, RECOVERY_KEY) !== content)
      throw new Error("Conflict recovery readback did not match");
  }

  async record(context: FeedShardConflictContext): Promise<string> {
    const write = this.chain.then(async () => {
      if (!isRecoveryContext(context))
        throw new Error("Invalid conflict recovery content");
      const entries = this.load();
      let sequence = 0;
      let name: string;
      do {
        name = `${Date.now()}-${sequence++}.json`;
      } while (name in entries);
      entries[name] = JSON.stringify(context);
      this.save(entries);
      return name;
    });
    this.chain = write.catch(() => undefined);
    return write;
  }

  async read(name: string): Promise<FeedShardConflictContext> {
    if (!/^\d+-\d+\.json$/.test(name))
      throw new Error("Invalid conflict recovery name");
    const content = this.load()[name];
    if (content === undefined)
      throw new Error("Conflict recovery record not found");
    const value: unknown = JSON.parse(content);
    if (!isRecoveryContext(value))
      throw new Error("Invalid conflict recovery content");
    return value;
  }

  async list(): Promise<string[]> {
    return Object.keys(this.load()).sort((a, b) => {
      const [aTime, aSequence] = a
        .split("-")
        .map((part) => Number.parseInt(part, 10));
      const [bTime, bSequence] = b
        .split("-")
        .map((part) => Number.parseInt(part, 10));
      return (aTime ?? 0) - (bTime ?? 0) || (aSequence ?? 0) - (bSequence ?? 0);
    });
  }

  /** Remove only the identified record after its resolution has been saved. */
  async remove(name: string): Promise<void> {
    if (!/^\d+-\d+\.json$/.test(name))
      throw new Error("Invalid conflict recovery name");
    const entries = this.load();
    if (!(name in entries))
      throw new Error("Conflict recovery record not found");
    delete entries[name];
    this.save(entries);
  }
}
