# Vault Metadata Watcher — Implementation Plan (Revised)

This document supersedes the original bug report sketch. It incorporates findings
from two rounds of codebase investigation that resolved the loop risk, confirmed
the safety of the reload chain, and identified the one genuine remaining risk:
stale shard reads on mid-burst reloads. Decisions are grounded in evidence.

---

## Root Cause (Confirmed)

`main.ts` has a comment in `loadSettings()` stating:

> "The vault modify listener in `onload()` will trigger `loadSettings()` again
> once sync delivers the real data."

No such listener exists anywhere in production code. The plugin loads once on
startup and never reacts to sync-delivered file changes. The sidebar does not
update when synced `data.json`, `user-state.json`, or feed shards arrive.

---

## What the Investigation Confirmed

### Safe to proceed

- **`refreshDashboardViews()` is read-only.** It iterates dashboard leaves,
  calls `loadIfDeferred()`, and calls `view.refresh()`. No disk writes. The
  tail of the reload chain carries no clobber risk.

- **`loadUserState()` returns `null` when `user-state.json` is absent.** No
  write-on-missing-file behavior.

- **The `isMissingUserState` guard already handles partial arrival.** When
  `data.json` exists but `user-state.json` has not yet been delivered by sync,
  `saveSettings()` is explicitly blocked. (`main.ts` line 2111–2115.)

- **No self-write loop.** The `saveSettings()` condition requires actual change
  via `hydrated.didChange`, `didNormalizeAndDedupeItems`, or
  `JSON.stringify(this.settings) !== originalSettingsJson`. A watcher-triggered
  reload of content identical to what is already in memory produces all four
  inner clauses as false and writes nothing. When sync delivers genuinely new
  data, `saveSettings()` fires once (correctly) and the next watcher event finds
  no change and terminates. One-cycle self-correction, not a loop.

- **The metadata dedup guard uses pre-nonce content.** `withSyncNonce()` is
  applied after the `lastPersistedMetadataJson` comparison
  (`feed-storage-repository.ts` lines 470–474). Nonce rotation does not defeat
  dedup. A self-write suppression flag is not needed.

### The one genuine remaining risk

When `data.json` or `user-state.json` arrives mid-burst — before all shard
files have been delivered by sync — the debounce fires, `loadSettings()` reads
whatever shards currently exist on disk, and the dashboard renders an
incomplete article list. If `hydrated.didChange` is true for the partial state,
`saveSettings()` writes back that partial set. The remaining shards eventually
arrive but do not trigger another reload (because they are not watched), leaving
the dashboard stale until the next manual refresh or genuine metadata change.

This is a transient correctness issue, not a data corruption issue. The
`isMissingUserState` guard and change-detection clauses bound the damage. The
fix below minimises the probability of this window through watcher scope and
debounce decisions.

---

## Design Decisions

### Watch scope: `data.json` and `user-state.json` only

Do not watch shard files (`feeds/*.json`). Watching shards means the watcher
fires hundreds of times during a 10-20 second sync burst with no guaranteed
file ordering. Each premature reload reads whatever partial shard state exists
at that moment. Narrowing to only the two semantic files means the watcher
fires at most twice per sync cycle — once when config/schema changes, once when
user state changes — giving shard files maximum time to settle before the
reload runs.

### Debounce: 1500ms

200ms is appropriate for debouncing user input, not sync delivery. With
hundreds of files arriving over 10-20 seconds, any inter-file gap exceeding
200ms fires a premature reload. 1500ms balances two constraints: enough settling
time after a metadata file lands to allow surrounding shards to arrive, without
introducing a noticeable delay for non-sync scenarios (settings change, manual
save) where the user expects the UI to update promptly.

### No polling fallback

Polling is not added. The event-driven approach is safe given the confirmed
absence of loop risk and the bounded damage of the stale-shard window. Polling
at any practical frequency (30-60s) would produce worse latency for the common
case (sync completes in under 15 seconds) while adding complexity. If Obsidian
ever exposes a sync-completion API, it can replace the file watcher at that
point.

### No `delete` event handler

A `delete` event on `data.json` or `user-state.json` during active sync most
likely indicates a sync conflict resolution or a temporary file replacement, not
a permanent deletion. Reacting to deletes risks reloading into a state where the
file is transiently absent. Obsidian's sync tools recreate files quickly;
the next `create` or `modify` event handles it. Deletes on shard files are not
watched regardless.

---

## Implementation

### 1. New field

```ts
private vaultMetadataReloadTimer: number | null = null;
```

### 2. Path helpers

```ts
private getVaultFilePath(fileOrPath?: unknown): string {
  if (typeof fileOrPath === "string") return fileOrPath;
  if (
    fileOrPath &&
    typeof fileOrPath === "object" &&
    "path" in fileOrPath &&
    typeof (fileOrPath as { path: unknown }).path === "string"
  ) {
    return (fileOrPath as { path: string }).path;
  }
  return "";
}

private isWatchedMetadataPath(filePath: string): boolean {
  const metadataFolder = getMetadataPath(this.settings ?? DEFAULT_SETTINGS);
  if (!metadataFolder) return false;

  const base = filePath.replace(/^\/+|\/+$/g, "");
  const folder = metadataFolder.replace(/^\/+|\/+$/g, "");

  return (
    base === `${folder}/data.json` ||
    base === `${folder}/user-state.json`
  );
}
```

Note the method is renamed `isWatchedMetadataPath` (from `isVaultMetadataPath`
in the original sketch) to make the narrowed scope explicit. Shard paths
intentionally do not match.

### 3. Listener registration

```ts
private registerVaultMetadataChangeListeners(): void {
  const vault = this.app.vault as unknown as {
    on?: (event: string, callback: (...args: unknown[]) => void) => unknown;
  };
  if (typeof vault.on !== "function") return;

  const scheduleReload = (file?: unknown, oldPath?: unknown) => {
    const path =
      this.getVaultFilePath(file) ||
      (typeof oldPath === "string" ? oldPath : "");
    if (!path || !this.isWatchedMetadataPath(path)) return;

    if (this.vaultMetadataReloadTimer !== null) {
      activeWindow.clearTimeout(this.vaultMetadataReloadTimer);
    }

    this.vaultMetadataReloadTimer = activeWindow.setTimeout(async () => {
      this.vaultMetadataReloadTimer = null;
      await this.loadSettings();
      await this.refreshDashboardViews();
    }, 1500);
  };

  this.registerEvent(vault.on("modify", (file) => scheduleReload(file)));
  this.registerEvent(vault.on("create", (file) => scheduleReload(file)));
  this.registerEvent(
    vault.on("rename", (file, oldPath) => scheduleReload(file, oldPath))
  );
}
```

### 4. Call site in `onload()`

```ts
await this.loadSettings();
this.registerVaultMetadataChangeListeners(); // add this line
```

No other changes to `onload()`.

---

## TDD Test Plan

Add the following tests to `plugin-lifecycle.test.ts`. The existing
`MockDataVault` does not need changes; assign `app.vault.on = vi.fn(...)`
directly inside each test.

### Test group: listener registration

**Test 1 — listeners registered on `onload()`**

- Arrange: stub `app.vault.on` as `vi.fn()` returning a dummy event ref
- Act: `await plugin.onload()`
- Assert: `vault.on` called exactly three times with event names `"modify"`,
  `"create"`, `"rename"` (order-independent)

### Test group: path filter

**Test 2 — reload fires for `data.json`**

- Arrange: capture the `modify` handler from `vault.on`; spy on
  `plugin.loadSettings` and `plugin.refreshDashboardViews`
- Act: trigger the `modify` callback with
  `{ path: ".rss-dashboard-data/data.json" }`; advance timers by 1500ms
- Assert: `loadSettings` called a second time; `refreshDashboardViews` called

**Test 3 — reload fires for `user-state.json`**

- Same pattern; trigger with `{ path: ".rss-dashboard-data/user-state.json" }`

**Test 4 — reload does NOT fire for shard file**

- Trigger with `{ path: ".rss-dashboard-data/feeds/some-feed.json" }`; advance timers
- Assert: `loadSettings` not called again; `refreshDashboardViews` not called

**Test 5 — reload does NOT fire for unrelated vault file**

- Trigger with `{ path: "some-note.md" }`; advance timers
- Assert: no reload

### Test group: debounce

**Test 6 — rapid events produce exactly one reload**

- Trigger `modify` on `data.json` five times at 100ms intervals; advance
  timers by 1500ms after the last event
- Assert: `loadSettings` called exactly once after the initial `onload()` call

**Test 7 — second event within debounce window resets the timer**

- Trigger `modify` at t=0; advance timers by 1000ms; trigger again at t=1000;
  advance timers by 1500ms
- Assert: `loadSettings` called once; the call occurs after the second event's
  debounce expires, not after the first

### Test group: rename

**Test 8 — rename event matched on new path**

- Trigger `rename` callback with `{ path: ".rss-dashboard-data/data.json" }`
  and `oldPath = "some-other-path.json"`; advance timers
- Assert: reload fires

**Test 9 — rename event matched on old path**

- Trigger `rename` with `{ path: "unrelated.md" }` and
  `oldPath = ".rss-dashboard-data/data.json"`; advance timers
- Assert: reload fires (a watched file was moved away; reload clears stale state)

### Test group: guard interaction (integration-level, optional but recommended)

**Test 10 — no save when reloaded content is identical**

- Stub `loadSettings` to load the same settings already in memory
- Trigger a watcher reload
- Assert: `saveSettings` not called (`shouldSave` is false)

**Test 11 — `isMissingUserState` blocks save when `user-state.json` absent**

- Arrange: mode is `vault-shards-v2`; stub `loadUserState` to return `null`
- Trigger a watcher reload
- Assert: `saveSettings` not called

---

## Verification Checklist

1. `registerVaultMetadataChangeListeners()` appears in `onload()` after
   `await this.loadSettings()`.
2. All eleven tests pass.
3. Start plugin with `storageMode = "vault-shards-v2"` and
   `metadataStorageFolder = ".rss-dashboard-data"`.
4. Externally write a change to `.rss-dashboard-data/data.json` (simulating
   sync delivery).
5. Confirm dashboard reloads after ~1500ms and sidebar reflects the change.
6. Externally write a change to `.rss-dashboard-data/user-state.json`.
7. Confirm read/starred/tag state updates in the dashboard.
8. Externally write a change to `.rss-dashboard-data/feeds/any-feed.json`.
9. Confirm no reload occurs.
10. Externally write a change to an unrelated vault file.
11. Confirm no reload occurs.
12. Write several changes to `data.json` in quick succession.
13. Confirm exactly one reload occurs approximately 1500ms after the last write.
