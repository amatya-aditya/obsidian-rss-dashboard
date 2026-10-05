import type {
  FeedBundle,
  FeedItemsShard,
  PortableDataBundle,
  SettingsBundle,
} from "../types/types";
import { SHARD_VERSION } from "./storage-json";

export function parsePortableDataBundle(input: unknown): PortableDataBundle {
  if (!input || typeof input !== "object") {
    throw new Error("Portable bundle must be a JSON object");
  }

  const bundle = input as Partial<PortableDataBundle>;
  if (bundle.version !== SHARD_VERSION) {
    throw new Error(
      `Unsupported portable bundle version: ${String(bundle.version)} (expected ${SHARD_VERSION})`,
    );
  }

  if (typeof bundle.exportedAt !== "number") {
    throw new Error("Portable bundle is missing a valid exportedAt timestamp");
  }

  if (
    bundle.storageMode !== "legacy-json" &&
    bundle.storageMode !== "vault-shards" &&
    bundle.storageMode !== "vault-shards-v2"
  ) {
    throw new Error("Portable bundle has an invalid storageMode value");
  }

  if (!bundle.metadata || typeof bundle.metadata !== "object") {
    throw new Error("Portable bundle is missing metadata");
  }

  if (!Array.isArray(bundle.shards)) {
    throw new Error("Portable bundle is missing shards");
  }

  for (const shard of bundle.shards) {
    if (!shard || typeof shard !== "object") {
      throw new Error("Portable bundle has an invalid shard entry");
    }

    const shardLike = shard as Partial<FeedItemsShard>;
    if (typeof shardLike.feedId !== "string" || !shardLike.feedId.trim()) {
      throw new Error("Portable bundle shard is missing feedId");
    }

    if (!Array.isArray(shardLike.items)) {
      throw new Error(
        `Portable bundle shard ${shardLike.feedId} is missing items`,
      );
    }
  }

  return bundle as PortableDataBundle;
}

function assertValidShards(
  shards: unknown,
): asserts shards is FeedItemsShard[] {
  if (!Array.isArray(shards)) {
    throw new Error("Bundle is missing shards");
  }

  for (const shard of shards) {
    if (!shard || typeof shard !== "object") {
      throw new Error("Bundle has an invalid shard entry");
    }

    const shardLike = shard as Partial<FeedItemsShard>;
    if (typeof shardLike.feedId !== "string" || !shardLike.feedId.trim()) {
      throw new Error("Bundle shard is missing feedId");
    }

    if (!Array.isArray(shardLike.items)) {
      throw new Error(`Bundle shard ${shardLike.feedId} is missing items`);
    }
  }
}

export function parseFeedBundle(input: unknown): FeedBundle {
  if (!input || typeof input !== "object") {
    throw new Error("Feed bundle must be a JSON object");
  }

  const bundle = input as Partial<FeedBundle>;
  if (bundle.version !== SHARD_VERSION) {
    throw new Error(
      `Unsupported feed bundle version: ${String(bundle.version)} (expected ${SHARD_VERSION})`,
    );
  }

  if (typeof bundle.exportedAt !== "number") {
    throw new Error("Feed bundle is missing a valid exportedAt timestamp");
  }

  if (!Array.isArray(bundle.feeds)) {
    throw new Error("Feed bundle is missing feeds");
  }

  if (!Array.isArray(bundle.folders)) {
    throw new Error("Feed bundle is missing folders");
  }

  if (!Array.isArray(bundle.availableTags)) {
    throw new Error("Feed bundle is missing availableTags");
  }

  assertValidShards(bundle.shards);

  return {
    version: bundle.version,
    exportedAt: bundle.exportedAt,
    feeds: bundle.feeds,
    folders: bundle.folders,
    availableTags: bundle.availableTags,
    shards: bundle.shards,
  };
}

export function parseSettingsBundle(input: unknown): SettingsBundle {
  if (!input || typeof input !== "object") {
    throw new Error("Settings bundle must be a JSON object");
  }

  const bundle = input as Partial<SettingsBundle>;
  if (bundle.version !== SHARD_VERSION) {
    throw new Error(
      `Unsupported settings bundle version: ${String(bundle.version)} (expected ${SHARD_VERSION})`,
    );
  }

  if (typeof bundle.exportedAt !== "number") {
    throw new Error("Settings bundle is missing a valid exportedAt timestamp");
  }

  if (!bundle.settings || typeof bundle.settings !== "object") {
    throw new Error("Settings bundle is missing settings");
  }

  const {
    feeds: _feeds,
    folders: _folders,
    availableTags: _availableTags,
    ...settingsOnly
  } = bundle.settings as Record<string, unknown>;
  void _feeds;
  void _folders;
  void _availableTags;

  if (
    settingsOnly.storageMode !== "legacy-json" &&
    settingsOnly.storageMode !== "vault-shards" &&
    settingsOnly.storageMode !== "vault-shards-v2"
  ) {
    throw new Error("Settings bundle has an invalid storageMode value");
  }

  return {
    version: bundle.version,
    exportedAt: bundle.exportedAt,
    metadataStorageMode: bundle.metadataStorageMode,
    metadataStorageFolder: bundle.metadataStorageFolder,
    settings: settingsOnly as SettingsBundle["settings"],
  };
}
