export const SHARD_VERSION = 1;

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let syncNonceCounter = 0;

export function withSyncNonce<T extends object>(
  data: T,
): T & { _syncNonce: string; _syncPad: string } {
  syncNonceCounter++;
  const paddingSize = 1024 + (syncNonceCounter % 1024);
  return {
    ...data,
    _syncNonce: `${Date.now()}-${syncNonceCounter}`,
    _syncPad: "sync-size-anchor "
      .repeat(Math.ceil(paddingSize / 18))
      .slice(0, paddingSize),
  };
}

/**
 * Serializes a snapshot with its keys sorted and the per-write sync nonce and
 * pad removed, so two snapshots compare equal exactly when they hold the same
 * content, whatever nonce each was stamped with (#1411).
 */
export function comparableSnapshotJson(value: object): string {
  const stripped: Record<string, unknown> = { ...value };
  delete stripped._syncNonce;
  delete stripped._syncPad;
  return JSON.stringify(stripped, (_key, nested: unknown) => {
    if (
      nested === null ||
      typeof nested !== "object" ||
      Array.isArray(nested)
    ) {
      return nested;
    }
    const record = nested as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
}
