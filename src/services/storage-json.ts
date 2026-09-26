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
