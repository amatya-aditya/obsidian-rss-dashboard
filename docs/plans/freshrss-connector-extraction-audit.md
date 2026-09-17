# FreshRSS / Google Reader connector extraction audit

**Status:** architecture audit only — no code changed by this document.
**Scope:** `feat/fresh-rss` as of `534ee43` (identical tree to this branch's HEAD).
**Goal:** decide whether the FreshRSS integration should become a companion
"RSS Dashboard Connectors" plugin, and if so, what the extraction boundary
looks like.

---

## 1. Executive recommendation

**Extract — but as a monorepo with two build targets, not two repositories, and not yet a second published Community Plugin unless the maintenance cost is accepted.**

Three independent lines of evidence converge on the same answer:

1. **The protocol/sync internals are already shaped like a connector.** `freshrss-retry.ts`, `freshrss-backoff.ts`, `freshrss-sync-trigger-coordinator.ts`, and `freshrss-type-guards.ts` contain **zero** FreshRSS-specific logic today — they are generic Google Reader / sync-engine primitives that happen to be named `FreshRss*`. `freshrss-facet-mutations.ts` and `freshrss-sidecar-repository.ts` are ~90% generic (opaque remote IDs, opaque bindings, generic pending-mutation ledger) with FreshRSS-flavored naming as the only real coupling. This is a rename-and-move job, not a rewrite.

2. **There is one hard, previously-verified technical fact that forces the issue.** This repo's `eslint-plugin-obsidianmd` recommended config (`eslint.config.mjs:21`) statically forbids referencing an Obsidian API above `manifest.json`'s `minAppVersion` — **even behind a runtime `typeof` capability guard**, and `eslint-comments/no-restricted-disable` blocks suppressing it. That means `app.secretStorage` cannot be referenced anywhere in a bundle whose manifest declares `1.8.7`, full stop — not with a feature-detect wrapper, not with a disable comment. The only way to keep RSS Dashboard Core at `1.8.7` (matching `dev`) while still supporting FreshRSS's SecretStorage-based credentials is for the SecretStorage-touching code to live in a **separately linted, separately built, separately manifested** plugin. A conditional code path inside one plugin cannot satisfy this; a second build target can. This single fact does most of the argumentative work for extraction — it is not just a style preference.

3. **The UI mutation boundary this branch already built is *already* the right shape for a public API**, just not versioned or generalized. `commitArticleFacetState` / `commitArticleReadState` / `commitArticleStarredState` / `commitArticleLabelMembershipChangesBatch` in `main.ts` are already the single choke point every read/starred/tag mutation in the app flows through, and `sidebar.ts`, `article-list.ts`, `tags-dropdown-portal.ts`, `dashboard-view.ts`, `reader-view.ts` already reach the FreshRSS layer only through **injected optional callbacks** (`onCommitLabelMembershipChanges?`) plus one shared type (`FreshRssArticleRef`), not through direct imports of FreshRSS service classes. That is a dependency-injection seam a connector API can be built on directly.

Against this: the one **genuinely hard** piece to extract is `freshrss-sync-coordinator.ts` (1,311 lines). It does not talk to core through any boundary today — it directly mutates `Feed`/`FeedItem` arrays, calls core's `mergeFeedHistoryItems`/`applyFeedRetentionLimits` (`feed-parser.ts`), reads/writes `RssDashboardSettings.feeds` and `settings.availableTags`, and calls `saveSettings()` directly. If the connector is to be an independently *compiled* plugin (not just an independently *organized* module in the same bundle), this coordinator's core-touching operations must be re-expressed as calls through a public API (`api.upsertRemoteArticles(...)`, `api.applyRemoteArticleState(...)`) instead of direct object/array mutation. That is a real, non-trivial "introduce interface" pass — see §7/§10 — but it is bounded to this one file's core-facing edges; its GReader-facing half (pagination, checkpoints, retry/backoff, reconciliation ordering) does not need to change at all.

**Recommendation in one sentence:** keep everything in one repository, split the build into `core` and `connectors` entry points sharing one `src/` tree (Option B, §8), move SecretStorage + FreshRSS/GReader protocol code into the `connectors` build, formalize the existing `commitArticleFacetState`-style methods into a versioned `RssDashboardConnectorApi` core exposes via `getAPI()`-style discovery, and only consider splitting into a second published Community Plugin once that internal split has shipped and proven itself for one release — extraction into a second repository/listing is a distribution decision that can be made later without re-doing the architecture work.

---

## 2. Current architecture diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ RSS Dashboard (single plugin, single manifest, minAppVersion 1.11.4) │
│                                                                       │
│  main.ts (4,688 lines)                                               │
│  ├─ core plugin lifecycle (onload/onunload), views, commands          │
│  ├─ RssDashboardSettings (incl. `freshRss: FreshRssSettings` field)   │
│  ├─ FreshRSS capability gate:                                        │
│  │    requireApiVersion("1.11.4") && app.secretStorage present        │
│  │    && storageMode === "vault-shards-v2" (ties to ADR 0006)         │
│  ├─ AppWithFreshRssSecretStorage / FreshRssSecretStorage (SecretStorage│
│  │    duck-typing — ONLY place SecretStorage is touched)              │
│  ├─ FreshRssSyncTriggerCoordinator (serializes startup/timer/manual/  │
│  │    retry/fetch-more-history triggers)                              │
│  ├─ FreshRssAutoSyncScheduler (rearmable timer)                       │
│  ├─ commitArticleFacetState / commitArticleReadState /                │
│  │    commitArticleStarredState / commitArticleLabelMembership        │
│  │    ChangesBatch  ← THE mutation boundary every UI surface calls    │
│  └─ FreshRssSidecarRepository wiring (path = core's                   │
│       metadataStorageFolder + "/freshrss-state.json")                 │
│                                                                       │
│  src/services/                                                       │
│  ├─ freshrss-sync-client.ts        [protocol, generic GReader calls]  │
│  ├─ freshrss-connection-service.ts [ClientLogin auth, ping/identity]  │
│  ├─ freshrss-sync-coordinator.ts   [orchestrator — DIRECTLY mutates   │
│  │                                  Feed/FeedItem, calls feed-parser, │
│  │                                  writes settings.feeds]            │
│  ├─ freshrss-facet-mutations.ts    [pending-mutation ledger, generic] │
│  ├─ freshrss-sidecar-repository.ts [opaque-binding JSON store, generic]│
│  ├─ freshrss-retry.ts              [generic transient-retry decorator]│
│  ├─ freshrss-backoff.ts            [generic cross-cycle backoff]      │
│  ├─ freshrss-sync-trigger-coordinator.ts [generic coalescing queue]   │
│  ├─ freshrss-auto-sync-scheduler.ts [generic rearmable timer]         │
│  ├─ freshrss-opml-export.ts        [FreshRSS-flavored OPML export]    │
│  └─ freshrss-type-guards.ts        [generic isRecord/isRejectedStatus]│
│                                                                       │
│  src/settings/tabs/freshrss-settings-tab.ts                           │
│    (already renders against a `FreshRssSettingsPlugin` interface —    │
│     a pre-existing DI seam, just not a public/versioned one)          │
│                                                                       │
│  src/components/sidebar.ts, article-list.ts, tags-dropdown-portal.ts  │
│  src/views/dashboard-view.ts, reader-view.ts                          │
│    → import the `FreshRssArticleRef` TYPE from core types.ts,         │
│      call injected `onCommitLabelMembershipChanges?` callbacks that    │
│      main.ts wires to `commitArticleLabelMembershipChangesBatch`.      │
│      No UI component imports a FreshRSS *service* directly.           │
│                                                                       │
│  src/types/types.ts                                                  │
│    RssDashboardSettings.freshRss: FreshRssSettings  ← core settings   │
│    type is polluted with one named provider's shape                  │
│    FreshRssConnectionStatus, FreshRssArticleRef also live here        │
└─────────────────────────────────────────────────────────────────────┘
```

Everything is one compiled bundle. The FreshRSS-specific parts (auth, capability
gate, SecretStorage, settings shape) and the provider-generic parts (retry,
backoff, trigger coalescing, opaque sidecar bindings) are physically
interleaved in the same files and the same `main.ts` class.

---

## 3. Proposed architecture diagram

```
┌───────────────────────────────────────────┐   ┌──────────────────────────────────────────────┐
│ RSS Dashboard Core (manifest minAppVersion │   │ RSS Dashboard Connectors (companion plugin,   │
│ stays at dev's current floor, e.g. 1.8.7)  │   │ manifest minAppVersion 1.11.4 — isolated here)│
│                                             │   │                                                │
│  Local feed/article model, reader UI,      │   │  GoogleReaderProtocolClient  (was              │
│  read/starred/tags, storage, filtering,    │   │    freshrss-sync-client.ts, renamed/generic)   │
│  article saving, import/export             │   │  GoogleReaderSyncEngine      (was              │
│                                             │   │    freshrss-sync-coordinator.ts's GReader-     │
│  RssDashboardConnectorApi (v1, versioned,  │◄──┼─   facing half, talking to core ONLY through    │
│  discoverable via getAPI(app, manifest,    │   │    the connector API — no more direct           │
│  apiVersion)):                             │   │    Feed/FeedItem/settings.feeds access)         │
│   - listLocalFeeds()/listLocalArticles()   │   │  RetryDecorator / BackoffPolicy  (was            │
│   - bindRemoteFeed(feedId, remoteId)       │   │    freshrss-retry.ts / freshrss-backoff.ts,     │
│   - bindRemoteArticle(...)                 │   │    unchanged, just relocated)                   │
│   - upsertRemoteArticles(...)              │   │  SyncTriggerCoordinator  (was                    │
│   - applyRemoteArticleState(...)           │   │    freshrss-sync-trigger-coordinator.ts,         │
│   - subscribeToArticleStateChanges(cb)     │   │    unchanged, just relocated)                    │
│   - reportSyncStatus(providerId, status)   │   │  PendingMutationLedger  (was                     │
│   - requestUiRefresh()                     │   │    freshrss-facet-mutations.ts, generalized      │
│   - getStorageCapabilities()               │   │    from "facet" to "synchronizable field")       │
│                                             │   │  SidecarRepository<TScope> (was                  │
│  No import of FreshRSS types, no import    │   │    freshrss-sidecar-repository.ts, generic       │
│  of app.secretStorage anywhere in this     │   │    opaque-binding store, parameterized scope)     │
│  bundle — lint-enforced by manifest floor. │   │                                                   │
└─────────────────────────────────────────────┘   │  AuthProvider (interface)                        │
                                                    │   ├─ FreshRssAuthProvider (ClientLogin/API pwd)  │
                                                    │   └─ InoreaderAuthProvider (OAuth, future)       │
                                                    │  ProviderDefinition registry                     │
                                                    │   { id, displayName, endpointBehavior,           │
                                                    │     authMechanism, capabilityQuirks }             │
                                                    │  SecretStorage access (moved here — the ONLY      │
                                                    │    place minAppVersion 1.11.4 is required)        │
                                                    │  Connector-owned settings tab, commands,          │
                                                    │    scheduler, OPML export profile                 │
                                                    └──────────────────────────────────────────────┘

        Same repository, same `src/` tree, two esbuild entry points / two manifests.
        Core has no compile-time or run-time dependency on Connectors.
        Connectors depends on Core's published API types only (no bundling of Core).
```

Key shift: today the sync coordinator reaches *into* core (`settings.feeds`,
`mergeFeedHistoryItems`, `applyFeedRetentionLimits`, direct `FeedItem` field
writes). In the proposed design it reaches *through* a small number of
domain-shaped API calls that core implements and owns the meaning of. Core
never imports anything FreshRSS/GReader-shaped.

---

## 4. File/subsystem classification table

| File / subsystem | Category | Why |
|---|---|---|
| `freshrss-sync-client.ts` | **C — GReader generic** | Every method is a raw Google Reader API call (`/subscription/list`, `/tag/list`, `/stream/items/ids`, `/stream/items/contents`, `/token`, `/edit-tag`) against opaque IDs. No FreshRSS-specific branching anywhere. Rename-only. |
| `freshrss-connection-service.ts` | **D — provider (FreshRSS) auth**, with a **C** core inside | `authenticateFreshRss`/`ClientLogin` is FreshRSS's specific auth mechanism (username + API password → `Auth=` token). The HTTPS-enforcement/URL-canonicalization and the `user-info`+`token` "prove connectivity" sequence are GReader-generic and reusable by any provider. Split into `AuthProvider` (D) + a small shared "prove connection" helper (C). |
| `freshrss-sync-coordinator.ts` | **Mixed: A (core-touching edges) + C (GReader-facing half)** | Pagination, checkpoints, budget caps, reauth-on-401, mutation-batch dispatch ordering are generic sync-engine logic (C). But it directly imports `Feed`/`FeedItem`/`RssDashboardSettings`/`Tag` from core types, calls core's `mergeFeedHistoryItems`/`applyFeedRetentionLimits` (`feed-parser.ts`), and writes `settings.feeds`/`saveSettings()` directly — those are core operations reached into rather than requested (A/B boundary violation). This is the file that needs the interface introduced. |
| `freshrss-facet-mutations.ts` | **C — GReader/sync generic**, naming is the only FreshRSS tie | Pure functions over an opaque `(remoteArticleId, facet)` ledger. `applyLabelMembership`/`diffLabelMembershipChanges` do touch core's `Tag` type, but only through a narrow read/write shape (`{name, color}`), not a service import. Rename `facet` → `synchronizableField`, drop `FreshRss` prefix, keep logic as-is. |
| `freshrss-sidecar-repository.ts` | **C — generic** | Generic scoped-JSON sidecar store: `activate`/`read`/`write`/`readActiveScope`, quarantine-on-invalid, version-tagged. Nothing here is FreshRSS-specific except the `FreshRssSidecarFile` name and the fixed `"freshrss-state.json"` path chosen in `main.ts`. Parameterize by scope type; this becomes `SidecarRepository<TScope>` reusable per-provider. |
| `freshrss-retry.ts` | **C — fully generic** | Decorates any `HttpClient`-shaped interface with bounded retry/jitter on 408/429/5xx. Zero FreshRSS awareness. Pure rename. |
| `freshrss-backoff.ts` | **C — fully generic** | Pure functions over a `{consecutiveTransientFailureCount, backoffUntilMs}` struct. Zero FreshRSS awareness. Pure rename. |
| `freshrss-sync-trigger-coordinator.ts` | **C — fully generic** | Generic "at most one active + one trailing coalesced run" coordinator; `runCycle` is injected. Zero FreshRSS awareness beyond the trigger-kind string literals. Pure rename. |
| `freshrss-auto-sync-scheduler.ts` | **C — fully generic** | Mirrors core's own `FeedRefreshScheduler` shape; a mechanical rearmable `setTimeout` wrapper. Pure rename. |
| `freshrss-type-guards.ts` | **C — fully generic** | `isRecord`/`isRejectedStatus`. Trivial. |
| `freshrss-opml-export.ts` | **D — provider-specific**, reads only core's `Feed` type | FreshRSS's flat-category OPML projection is a presentation profile specific to how FreshRSS imports categories; the escaping/folder-flattening rules are named and documented as FreshRSS quirks. Reads only `feed.title/url/siteUrl/folder` — a legitimate "read local feed list" capability a connector API should expose generically, but the projection logic itself is provider glue (D). |
| `freshrss-settings-tab.ts` | **D/E** | UI language, status copy, and control layout are entirely FreshRSS-specific (D). But its `FreshRssSettingsPlugin` interface — the tab talks to `plugin: FreshRssSettingsPlugin`, never to `main.ts` directly — is exactly the DI seam a connector's own settings tab should keep (a reusable pattern, not reusable code). |
| `main.ts` §§ SecretStorage (`AppWithFreshRssSecretStorage`, `getFreshRssSecretStorage`, `canListFreshRssSecretReferences`) | **E — distribution/integration glue, must move** | Exists only because everything is one plugin today. This is *the* forcing function for a companion plugin (see §9). |
| `main.ts` § `getFreshRssCapability()` | **E**, encodes two couplings | Gates on `requireApiVersion("1.11.4")` (SecretStorage) **and** `storageMode === "vault-shards-v2"` (ADR 0006 storage migration). The latter is a real cross-subsystem dependency a connector API needs to expose deliberately (`api.getStorageCapabilities()`), not by reading `settings.storageMode` directly. |
| `main.ts` § `FreshRssSyncTriggerCoordinator`/`FreshRssAutoSyncScheduler` wiring, `kickFreshRssAutoSync`, `runFreshRssSyncCycle`, `resolveFreshRssRunContext` | **E** | Orchestration glue that exists because the scheduler, coordinator, and capability/credential resolution all live in the same class. Becomes the companion plugin's own `onload`-driven wiring. |
| `main.ts` § `commitArticleFacetState` / `commitArticleReadState` / `commitArticleStarredState` / `commitArticleLabelMembershipChanges(Batch)` | **B — connector contract** (already shaped right) | This is the one true mutation boundary every read/starred/tag change in the whole app already funnels through. It needs to become a **generic** core-owned API (`api.captureIntentBeforeLocalMutation(...)` or similar) that a connector subscribes to / is consulted by — not a FreshRSS-named method with FreshRSS sidecar/lease code inlined into it. |
| `types.ts`: `FreshRssSettings`, `FreshRssConnectionStatus`, `FreshRssArticleRef` | **E, should not be in core types.ts** | `RssDashboardSettings.freshRss: FreshRssSettings` bakes one named provider into the core settings shape and the portable-data-bundle export format (`PersistedRssDashboardSettings`). Constraint #7 ("external service schemas must not become RSS Dashboard's canonical storage format") is already being brushed up against here even though the *values* are opaque — the *shape* is provider-named in a file every core module imports. |
| `sidebar.ts`, `article-list.ts`, `tags-dropdown-portal.ts`, `dashboard-view.ts`, `reader-view.ts` | **B (the seam) / E (the naming)** | Each imports the `FreshRssArticleRef` type and threads an optional `onCommitLabelMembershipChanges?` callback down to a leaf component. This is correctly decoupled *behaviorally* (no FreshRSS service import, graceful `?.()` no-op when absent) but incorrectly *named* — the type and callback name should be provider-neutral so a future non-FreshRSS connector doesn't look like a lie. |
| `reader-view.ts` § `getRssDashboardPluginForSettingsSave` | **Precedent worth reusing, not FreshRSS-specific itself** | Already does exactly the duck-typed `app.plugins.getPlugin("rss-dashboard")` / `app.plugins.plugins["rss-dashboard"]` discovery-with-graceful-absence dance a *connector* should do to find *core*. Good internal precedent for §7. |
| `docker/freshrss-contract/**`, `.github/workflows/freshrss-docker-contract.yml` | **E — test/CI infra** | FreshRSS-specific Docker fixture server and contract tests. Valuable but belongs with wherever the FreshRSS provider code ends up (connector repo/package), not core. |
| `data-sync-lease.ts` | **A — core infrastructure, not FreshRSS's** | Generic exclusive-operation queue (`DataSyncLease`/`DataSyncLeaseOwner`). Used by FreshRSS today but has no FreshRSS awareness at all; a connector needs equivalent serialization and should be offered this (or an equivalent) through the connector API rather than reimplementing it — flag as a candidate for direct exposure in `RssDashboardConnectorApi` (`api.runExclusive(...)`). |

---

## 5. Coupling / extraction blockers

In order of how hard they'd be to leave as-is if the connector were compiled
**independently** (a real second `.js` bundle, not just a second source folder):

1. **`freshrss-sync-coordinator.ts` mutates core objects and calls core functions directly** (`main.ts`/`freshrss-sync-coordinator.ts:1-2,552-556,626-627,844-845`). It writes `feed.items`, calls `mergeFeedHistoryItems`/`applyFeedRetentionLimits` from `src/services/feed-parser.ts`, and assigns `settings.feeds = feeds; await saveSettings()`. **This is the blocker.** An independently compiled plugin cannot import `feed-parser.ts` from core's bundle at all (there is no shared runtime module system between two Obsidian plugins) — it would need core to expose `api.upsertRemoteArticles(feedId, articles)` and `api.applyRemoteArticleState(feedId, articleRef, {read, starred, tags})` and do the merge/retention/save internally.

2. **`commitArticleFacetState` has FreshRSS's sidecar/lease/pending-mutation code inlined into the app-wide mutation boundary** (`main.ts:2907-3033`). Today, *every* read/starred toggle in the app — local-only feeds included — runs through a method that imports `FreshRssSidecarRepository`, `captureFacetMutation`, and checks `getFreshRssCapability()`. That is backwards for a plugin boundary: core should own this method and call *out* to zero-or-more registered connectors ("does anyone want to observe/veto this mutation?"), rather than one specific connector's code living inside core's own choke point.

3. **SecretStorage detection lives in `main.ts` and gates a core-owned settings field** (`main.ts:149-154, 2278-2306`; `AppWithFreshRssSecretStorage`). Already covered in depth in §9 — this is the one that has real, lint-enforced teeth.

4. **`RssDashboardSettings.freshRss: FreshRssSettings`** (`types.ts:587`) means core's settings persistence, import/export (`PersistedRssDashboardSettings`), and settings-tab code all have compile-time knowledge of a named provider's settings shape, even though the *values* (`endpoint`, `credentialReference`) are already appropriately opaque strings. A companion-plugin architecture needs this to be `RssDashboardSettings.connectors?: Record<string, unknown>` (or similar opaque bag core doesn't interpret) with FreshRSS's concrete shape living in the connector's own settings.

5. **The FreshRSS capability gate reads `settings.storageMode`/`metadataStorageSchemaVersion` directly** (`main.ts:2288-2291`). A connector plugin cannot read another plugin's private settings fields; it needs `api.getStorageCapabilities()` to return `{ supportsVaultShardsV2: boolean, schemaVersion: number }` or similar.

6. **The sidecar file's path is derived from a core setting** (`getFreshRssSidecarFolder` reads `this.settings.metadataStorageFolder`, `main.ts:3266-3270`). Minor, but a connector plugin cannot read core's private settings object; needs `api.getMetadataStorageFolder()` or the sidecar repository takes an already-resolved path from the API.

7. **UI naming, not behavior, in the five view/component files.** `FreshRssArticleRef` and `onCommitLabelMembershipChanges` are provider-branded names on what is actually already a generic optional-callback seam. Not a functional blocker (a second provider could reuse the exact same callback shape today), but it's a documentation/API-surface smell that should be renamed before calling this "the" connector contract publicly.

8. **`main.ts`'s FreshRSS unload guard (`freshRssUnloaded`) is manual, not structural** (`main.ts:344, 2501, 2652, 2846, 4621-4622`). It works (a boolean flag checked after every `await`), but it's the kind of hand-rolled guard that an Obsidian `Component.register()`/`registerEvent`-style lifecycle would make automatic. Not a blocker for extraction — actually *easier* once FreshRSS's scheduler lives in its own `Plugin` subclass, since Obsidian's own `onunload` ordering handles this for free.

**Nothing here blocks extraction; #1 and #2 are the only ones requiring a genuine interface-introduction rewrite. #3–#6 are "core needs to grow four or five new read-only accessor methods." #7–#8 are renames.**

---

## 6. Proposed connector API surface

Versioned, minimal, domain-shaped — no `repository.write()`-style raw access.
Modeled after `getAPI(app, manifest, apiVersion)` (Local REST API) for discovery, and after
this branch's own `commitArticleFacetState` for the mutation shape.

```ts
// Published from RSS Dashboard Core, versioned independently of plugin semver.
export const RSS_DASHBOARD_CONNECTOR_API_VERSION = 1;

export interface RssDashboardConnectorApi {
  readonly apiVersion: 1;

  // --- Discovery -----------------------------------------------------
  /** Read-only capability probe a connector must check before registering. */
  getCapabilities(): {
    supportsVaultShardsV2: boolean;
    metadataStorageSchemaVersion: number;
    metadataStorageFolder: string; // resolved, connector never reads core settings directly
  };

  // --- Local feed/article discovery (read-only) -----------------------
  listLocalFeeds(): ReadonlyArray<{ feedId: string; title: string; url: string; folder: string }>;
  findLocalFeedByUrl(url: string): { feedId: string } | null;
  listLocalArticleGuids(feedId: string): ReadonlyArray<string>;

  // --- Opaque remote binding (connector owns remote IDs; core owns local IDs) ---
  bindRemoteFeed(feedId: string, remoteFeedRef: string): void;
  bindRemoteArticle(feedId: string, guid: string, remoteArticleRef: string): void;
  findLocalArticleByRemoteRef(remoteArticleRef: string): { feedId: string; guid: string } | null;

  // --- Import / update (write, but domain-shaped, not repository.write) ---
  /** Creates a local feed if none is bound yet; returns the resolved feedId. */
  upsertRemoteFeed(input: { remoteFeedRef: string; title: string; url: string; folderHint?: string }): string;
  /** Merges articles into a feed's history using core's own retention/merge rules. */
  upsertRemoteArticles(feedId: string, articles: ReadonlyArray<{
    remoteArticleRef: string; guid: string; title: string; link: string | null;
    content: string | null; author: string | null; publishedMs: number | null;
  }>): void;
  /** Applies reconciled remote state for one already-bound article. Never overrides a still-pending local intent (see subscribeToOutgoingIntents). */
  applyRemoteArticleState(feedId: string, guid: string, state: {
    read?: boolean; starred?: boolean; tagMembership?: ReadonlyArray<{ tagName: string; member: boolean }>;
  }): void;

  // --- Outgoing intent (core → connector), replacing the FreshRSS-specific
  // code inlined into commitArticleFacetState today ------------------------
  /**
   * Registered by a connector at load time. Called by core BEFORE a local
   * read/starred/tag mutation is applied, for every article — core does not
   * know or care whether the article is remotely bound. The connector looks
   * up its own binding and returns `handled: false` immediately for anything
   * it doesn't recognize (the common case), so this must be fast and
   * synchronous-feeling; the promise exists only for the durable-queue write.
   * A `committed: false` result blocks the local mutation and surfaces
   * `error` to the user, exactly like today's `commitArticleFacetState`.
   */
  subscribeToOutgoingIntents(
    handler: (intent: {
      feedId: string; guid: string;
      kind: "read" | "starred" | "tag";
      desiredState: boolean;
      tagName?: string; // present only when kind === "tag"
    }) => Promise<{ handled: boolean; committed: boolean; error?: string }>,
  ): () => void; // returns an unsubscribe function

  // --- UI / status --------------------------------------------------
  requestUiRefresh(): void;
  reportSyncStatus(providerId: string, status:
    | { state: "idle" }
    | { state: "syncing" }
    | { state: "error"; message: string; retryable: boolean }
  ): void;

  // --- Serialization primitive core already has (data-sync-lease.ts), offered so a connector doesn't need its own ---
  runExclusive<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T>;
}
```

Notes on the design choices, tied back to the audit findings:

- **`upsertRemoteArticles`/`upsertRemoteFeed`** replace the sync coordinator's
  direct `mergeFeedHistoryItems`/`applyFeedRetentionLimits`/`settings.feeds =`
  calls (blocker §5.1). Core keeps owning retention/merge/save; the connector
  just describes *what* arrived.
- **`subscribeToOutgoingIntents`** replaces the FreshRSS-specific code inlined
  into `commitArticleFacetState` (blocker §5.2). Core's mutation boundary
  becomes provider-agnostic: it asks "does any registered connector want to
  intercept this?" and only one connector should ever claim a given article
  (ambiguity if two connectors both claim it is a connector-author bug, not
  something core needs to referee in v1).
- **No `repository.write()` equivalent exists on purpose** — every write is
  named for what it means (`upsertRemoteArticles`, `applyRemoteArticleState`),
  matching the prompt's explicit preference and this branch's own existing
  style (`commitArticleFacetState` is already named this way, not
  `settings.feeds[i].items.push(...)`).
- **Remote IDs are `string` opaque refs everywhere**, matching the existing
  `FreshRssFeedBinding`/`FreshRssArticleBinding` shape — no change needed to
  that data model, just to who is allowed to read/write it.
- **`getCapabilities()`** replaces blockers §5.5/§5.6 (a connector reading
  `settings.storageMode`/`metadataStorageFolder` directly).

---

## 7. Plugin lifecycle and registration design

Grounded in two references: Local REST API's `getAPI(app, manifest, apiVersion)` +
`ApiVersionUnsupportedError` pattern, and this branch's own
`reader-view.ts:getRssDashboardPluginForSettingsSave` duck-typed discovery
(§4 table) — the codebase already half-invented this pattern for one internal
call site.

```ts
// Exported from a small, dependency-free `rss-dashboard-connector-types`
// package (or a types-only file) that BOTH plugins' manifests can depend on
// at build time without bundling either plugin into the other.
export function getRssDashboardApi(
  app: App,
  requesterManifest: PluginManifest,
  requiredApiVersion: number,
): RssDashboardConnectorApi | undefined {
  const core = (app as any).plugins?.plugins?.["rss-dashboard"];
  if (!core?.rssDashboardConnectorApi) return undefined; // core absent or not loaded yet
  const api: RssDashboardConnectorApi = core.rssDashboardConnectorApi;
  if (api.apiVersion < requiredApiVersion) {
    throw new ApiVersionUnsupportedError(api.apiVersion, requiredApiVersion);
  }
  return api;
}
```

**Detection / registration (connector's `onload`):**
1. Call `getRssDashboardApi(this.app, this.manifest, 1)`.
2. `undefined` → core isn't installed/enabled. Register nothing UI-visible
   beyond a settings-tab notice ("RSS Dashboard Core required"); do not throw,
   do not poll. This matches constraint "connector absence must not create
   errors... during normal reading" symmetrically for the reverse case.
3. Version mismatch → `ApiVersionUnsupportedError` caught, same graceful
   notice with the specific version gap shown.
4. Success → call `api.subscribeToOutgoingIntents(handler)`, store the
   returned unsubscribe function, start the connector's own scheduler.

**Either plugin loading first:** Obsidian loads plugins in an
unspecified/user-configurable order. Two sub-cases:
- **Core loads first, Connector loads second (the common case):** Connector's
  `onload` finds `core.rssDashboardConnectorApi` already present. Works as
  above.
- **Connector loads first:** `getRssDashboardApi` returns `undefined` (core
  plugin object doesn't exist in `app.plugins.plugins` yet). The connector
  must **not** poll or retry in a loop; instead it registers a one-shot
  listener on Obsidian's own `app.workspace.on("layout-ready", ...)` (fires
  after all plugins have loaded) and re-attempts discovery there once. If
  still absent, it's "core not installed," end of story. This mirrors how
  Periodic Notes-style companions typically defer their own cross-plugin
  hookup to `layout-ready` rather than reaching for an ad hoc timer.

**Either plugin being disabled while Obsidian is running:**
- **Core disabled while Connector is active:** Obsidian calls Core's
  `onunload`; Core should null out or delete `this.rssDashboardConnectorApi`
  from the plugin instance in `onunload` (cheap, and makes "is core still
  there" a live check rather than a cached truth). The Connector's next call
  through the API reference it's holding will throw or no-op depending on
  what Core's `onunload` did to the object; the Connector should wrap every
  API call in a try/catch that treats a thrown/undefined result as
  "core went away" and calls its own unsubscribe/stop path. This is the
  actual gap in the current in-repo code (`freshRssUnloaded` boolean flag,
  §5.8) that a real Component-registered listener
  (`this.register(() => api.unsubscribe())`) would close automatically once
  this is a real inter-plugin boundary instead of one class's internal
  ordering.
- **Connector disabled while Core is active:** Core's
  `subscribeToOutgoingIntents` returned an unsubscribe closure; nothing on
  Core's side needs to detect this proactively — the Connector's `onunload`
  calls its own stored unsubscribe function, exactly like removing an
  event listener. Core's mutation boundary (§6, `subscribeToOutgoingIntents`
  handler) simply has zero handlers registered again and behaves exactly
  as it does today when FreshRSS's capability is unavailable — this is
  already a tested code path (`getFreshRssCapability() !== "available"` early
  returns throughout `main.ts`).

**Version incompatibility:** `ApiVersionUnsupportedError` (or equivalent) is
thrown by the discovery helper itself, not returned as a status the connector
has to remember to check — matching Local REST API's design specifically so a
careless integrator can't accidentally proceed against an incompatible API by
forgetting an `if`.

**No undocumented assumptions required:** the whole design above only
depends on documented Obsidian behavior (`app.plugins.plugins[id]`,
`workspace.on("layout-ready")`, `onunload` ordering) — nothing depends on
plugin *load order* being deterministic, which Obsidian does not guarantee.

---

## 8. Generic GReader protocol vs. FreshRSS-specific boundary

```
GoogleReaderProtocolClient          (freshrss-sync-client.ts, renamed)
  - listSubscriptions / listTagLabels / listItemIds / getItemContents
  - getModificationToken / editTag
  → 100% generic today. No changes needed beyond renaming FreshRss* → GoogleReader*.

GoogleReaderSyncEngine               (freshrss-sync-coordinator.ts's
                                       GReader-facing half, after §6's API
                                       introduction removes its core-facing half)
  - pagination/budget/checkpoint/reauth-on-401/mutation-batch-dispatch logic
  → 100% generic today, PROVIDED the auth mechanism is abstracted (see below).

AuthProvider (interface)
  authenticate(httpClient, endpoint, credentials) -> AuthenticationResult
  FreshRssAuthProvider   — ClientLogin: POST /accounts/ClientLogin with
                           Email=/Passwd=, parses `Auth=` line. Requires an
                           API-password credential bundle {username, apiPassword}.
  InoreaderAuthProvider  — OAuth 2.0 authorization-code + refresh token; NO
                           ClientLogin endpoint exists on Inoreader. Different
                           credential shape entirely (client id/secret/token),
                           different token refresh lifecycle, different rate-
                           limit headers (Inoreader exposes X-Reader-*Zone*
                           usage headers FreshRSS does not).

ProviderDefinition
  { id: "freshrss" | "inoreader" | ...,
    displayName: string,
    endpointBehavior: { requiresHttps: boolean; fixedBaseUrl?: string },
    authMechanism: "clientlogin" | "oauth2",
    capabilityQuirks: {
      supportsTagList: boolean;       // GReader-compatible, but not universal
      supportsEditTagEndpoint: boolean;
      itemIdPageSize: number;          // some servers cap this lower than 1000
      requiresPeriodicTokenRefresh: boolean; // OAuth providers, not ClientLogin
    } }
```

**Places in the current implementation where FreshRSS behavior has been
accidentally treated as universal Google Reader behavior** (the specific
thing the prompt asked to identify):

1. **The credential shape is FreshRSS-only, but it's the only shape the
   protocol layer knows about.** `FreshRssCredentialBundle { username, apiPassword }`
   (`freshrss-connection-service.ts:29-32`) and `authenticateFreshRss`'s
   `ClientLogin` POST are hard-wired into `FreshRssSyncCoordinator` — there is
   no `AuthProvider` seam today. An OAuth-based provider (Inoreader) cannot be
   added without either duplicating the entire coordinator or retrofitting
   this exact abstraction. This is the single biggest "FreshRSS-treated-as-
   GReader-universal" issue in the branch.

2. **`isRejectedStatus` (401/403 → re-auth) is assumed uniformly retryable
   via a fresh ClientLogin** (`withOneReauth`, `freshrss-sync-coordinator.ts:906-920`).
   For an OAuth provider, a 401 means "refresh the access token," not
   "re-run the login flow with stored credentials" — same *shape* of
   recovery (get a new token, retry once), different *mechanism*. The
   `withOneReauth` retry-shape is reusable; the concrete `reauthenticateClient`
   body (`freshrss-sync-coordinator.ts:882-893`, calls `authenticateFreshRss`
   directly) is not.

3. **Rate-limit/backoff status codes (408/429/5xx) are assumed identical
   across providers** (`isFreshRssRetryableStatus`, `freshrss-retry.ts:40-42`).
   This is a reasonable default and probably fine to keep as the shared
   baseline, but `ProviderDefinition.capabilityQuirks` should allow a
   provider to extend the retryable-status set (e.g., a provider using a
   nonstandard throttle status) rather than assuming FreshRSS's set is every
   GReader-compatible server's set.

4. **Tag/label discovery kind classification is FreshRSS's own vocabulary**
   (`classifyRemoteTagKind` in `freshrss-sync-client.ts:106-117` checks
   `entry.type === "folder"` and the two hardcoded `user/-/state/com.google/*`
   stream IDs). The two system-stream IDs genuinely are the universal
   Google Reader constants (safe to keep as protocol-generic); the `"folder"`
   `type` field convention is FreshRSS's specific JSON shape for categories —
   not guaranteed to be identical on another GReader-compatible server. This
   should move into `ProviderDefinition.capabilityQuirks` or a
   provider-supplied classifier function rather than living in the "generic"
   protocol client.

5. **`FRESHRSS_ITEM_ID_PAGE_SIZE = 1000` and `FRESHRSS_STREAM_ID_BUDGET = 25000`
   are treated as safe constants for "a Google Reader server"** (`freshrss-sync-coordinator.ts:117-121`)
   but are really "safe constants for FreshRSS specifically, chosen during
   this branch's own testing." `ProviderDefinition.capabilityQuirks.itemIdPageSize`
   should let a stricter provider override this rather than the sync engine
   assuming one number fits all GReader-compatible servers.

**Bottom line:** the endpoint/verb/response-shape layer (`GoogleReaderProtocolClient`)
is genuinely protocol-generic and needs no rework. The auth layer is the one
place today's code silently assumed "FreshRSS's way is the only way" and
needs the `AuthProvider` interface introduced before a second provider can be
added without duplicating the coordinator.

---

## 9. SecretStorage / minAppVersion analysis

**Every SecretStorage dependency in the branch**, exhaustively:

| Location | What it does |
|---|---|
| `main.ts:149-154` | Defines `FreshRssSecretStorage`/`AppWithFreshRssSecretStorage` structural types for `app.secretStorage`. |
| `main.ts:2278-2293` (`getFreshRssCapability`) | Calls `requireApiVersion("1.11.4")` — **the only place `minAppVersion` is forced up** — and probes `app.secretStorage` for `getSecret`/`listSecrets`. |
| `main.ts:2295-2306` (`getFreshRssSecretReferences`) | Calls `secretStorage.listSecrets()`. |
| `main.ts:2360-2368`, `2561-2573` | Calls `secretStorage.getSecret(reference)` to read the credential bundle before connecting/syncing. |
| `main.ts:3231-3249` (`getFreshRssSecretStorage`/`canListFreshRssSecretReferences`) | The two accessor/guard methods everything above funnels through. |

That's it — **five call sites, all inside `main.ts`, none inside any
`src/services/freshrss-*.ts` file.** `freshrss-connection-service.ts` and
`freshrss-sync-coordinator.ts` receive already-resolved
`FreshRssCredentialBundle {username, apiPassword}` values as plain
parameters; they never touch `app.secretStorage` themselves. This is good
news: **the service layer is already SecretStorage-agnostic.** Only the five
`main.ts` call sites need to move.

**Can all SecretStorage usage reside entirely inside the connector plugin?**
Yes, structurally — nothing else depends on it being in `main.ts`. Moving it
requires only that the connector's own `onload`/settings-tab code call
`app.secretStorage` directly (or through the same duck-typed guard) and pass
the resolved credential bundle into `GoogleReaderSyncEngine`/`AuthProvider`
exactly as `main.ts` does today.

**What forces `minAppVersion` up today, explicitly:** the single line
`requireApiVersion("1.11.4")` in `getFreshRssCapability()` (`main.ts:2280`).
Nothing else in the branch calls `requireApiVersion` or references any other
1.11.4+-only Obsidian API.

**Why this isn't just "delete that check and gate at runtime instead" —
the decisive constraint:** this repo's `eslint-plugin-obsidianmd` recommended
config (`eslint.config.mjs:21`, confirmed still active) statically flags any
reference to an Obsidian API above the declared `minAppVersion`, and
`eslint-comments/no-restricted-disable` blocks suppressing that specific rule
with a disable comment — **even when the reference is behind a
`typeof x.method === "function"` runtime guard**, which is exactly what
`getFreshRssSecretStorage` already does (`main.ts:3231-3237`). In other
words: this project's own lint policy already tried the "gate it at runtime,
keep minAppVersion low" approach implicitly (the guard code is *written* that
way) and it does not satisfy the linter regardless. The only way to keep
Core's manifest at a lower floor while this code exists **anywhere in a
bundle Core's linter checks** is to physically remove it from that bundle —
i.e., a second build target/manifest with its own lint pass. This is not a
preference; it's the mechanical consequence of a rule this repo has already
chosen to enforce with no carve-out.

*(This finding is corroborated by project memory from the original FreshRSS
implementation session, which hit exactly this wall trying to add the
SecretStorage-gated code without raising `minAppVersion`; re-verified above by
re-reading `eslint.config.mjs`'s current `obsidianmd.configs.recommended`
inclusion rather than trusting the memory at face value.)*

**Net effect of extraction on Core's manifest:** Core's `minAppVersion` can
return to whatever `dev`'s current floor is (`1.8.7` as of this audit,
per `origin/dev`'s `manifest.json`) once the five call sites and the
`requireApiVersion("1.11.4")` check move to the connector's own bundle. This
also decouples the FreshRSS 3.0 deferral from `dev`'s independent
`1.8.7` settings-UI compatibility floor raise — they were only bundled
together because both happened to be version-floor changes landing around
the same time, not because they're technically related (see
`docs/plans/public-roadmap.md`'s "Deferred to 3.0" section).

---

## 10. Migration / refactor sequence

Ordered so each step leaves the branch in a working, testable state — no
step requires the next one to be safe to ship on its own.

| # | Change | Classification | Notes |
|---|---|---|---|
| 1 | Rename `FreshRss*` → generic names in `freshrss-retry.ts`, `freshrss-backoff.ts`, `freshrss-sync-trigger-coordinator.ts`, `freshrss-auto-sync-scheduler.ts`, `freshrss-type-guards.ts`, and the generic parts of `freshrss-sync-client.ts`/`freshrss-facet-mutations.ts`/`freshrss-sidecar-repository.ts`. | **Rename only** | Zero behavior change; can land as its own PR against `feat/fresh-rss` before anything else, fully covered by existing tests (just renamed alongside). |
| 2 | Move `RssDashboardSettings.freshRss` to an opaque `connectors?: Record<string, unknown>` bag in `types.ts`; move `FreshRssSettings`/`FreshRssConnectionStatus` shape ownership out of core `types.ts` into the (still same-repo) connector module. | **Introduce interface** | Touches persistence/import-export (`PersistedRssDashboardSettings`) — needs a settings migration (old `freshRss` key → `connectors.freshrss`) so existing users of the parked branch don't lose state whenever it eventually ships. |
| 3 | Add `getCapabilities()`-equivalent read-only accessors to `main.ts` (storage mode, schema version, metadata folder) and switch `getFreshRssCapability()` to call them instead of reading `settings.storageMode`/`metadataStorageFolder` directly. | **Introduce interface** | Small; these become real `RssDashboardConnectorApi` methods in step 6. |
| 4 | Extract `AuthProvider` interface out of `freshrss-connection-service.ts`/`freshrss-sync-coordinator.ts`; make `FreshRssAuthProvider` the one implementation. `GoogleReaderSyncEngine` takes an `AuthProvider` instead of calling `authenticateFreshRss` directly. | **Introduce interface** | Needed before any second provider is possible (§8 finding #1); not needed just to isolate FreshRSS itself, but cheap to do now while touching this code anyway. |
| 5 | Rework `freshrss-sync-coordinator.ts`'s core-facing edges (`settings.feeds` writes, `mergeFeedHistoryItems`/`applyFeedRetentionLimits` calls, `saveSettings()`) to call `upsertRemoteFeed`/`upsertRemoteArticles`/`applyRemoteArticleState` instead. | **Significant rewrite (bounded)** | The one real rewrite in this list. Scope is bounded to the ~150 lines of `run()`/`runFetchMoreHistory()` that touch `feeds`/`settings` directly (`freshrss-sync-coordinator.ts:376-379, 500-584, 626-627, 726-736, 784-800, 844-852`); the pagination/checkpoint/retry logic around those edges is untouched. |
| 6 | Rework `commitArticleFacetState`/`commitArticleLabelMembershipChangesBatch` in `main.ts` to call a generic `subscribeToOutgoingIntents` handler list instead of importing `FreshRssSidecarRepository`/`captureFacetMutation` directly; register FreshRSS's own handler through that same mechanism. | **Significant rewrite (bounded)** | This is the app-wide mutation boundary, so it needs care and full regression coverage, but the change is mechanical: replace "always call FreshRSS's sidecar" with "call whichever handler(s) are registered." |
| 7 | Rename `FreshRssArticleRef`/`onCommitLabelMembershipChanges` in `sidebar.ts`, `article-list.ts`, `tags-dropdown-portal.ts`, `dashboard-view.ts`, `reader-view.ts` to provider-neutral names. | **Rename only** | Purely cosmetic once step 6 lands; do last so it's one clean diff instead of touching these files twice. |
| 8 | Stand up the second esbuild entry point / manifest (`manifest-connectors.json` or a `packages/connectors` folder) and move `freshrss-*` service files, `freshrss-settings-tab.ts`, the SecretStorage call sites, and the Docker contract test infra into it. | **Move/extract** | This is where `minAppVersion` actually splits (§9). Requires deciding Option A/B/C from §11 — this sequence assumes Option B (monorepo, two build targets, one repo). |
| 9 | Wire `getRssDashboardApi`/`rssDashboardConnectorApi` discovery per §7's lifecycle design; delete the ad hoc `freshRssUnloaded` boolean in favor of the connector's own `onunload` calling its stored unsubscribe function. | **Move/extract** | Final step; at this point Core and Connectors are two real Obsidian plugins that happen to ship from one repo. |

**Overall migration cost verdict:** roughly **60% of the branch's logic
survives as pure renames or file moves** (everything in §4's Category C rows,
plus the Docker contract test infra). **~30% needs a real interface
introduced but no rewrite of internal logic** (steps 2–4, 7). **~10% needs an
actual rewrite of the touch-points with core** (steps 5–6, bounded to
specific named methods/line ranges, not whole-file rewrites). Nothing in the
branch needs to be thrown away and redone from scratch — this is consistent
with the branch's own service-layer design already having anticipated most
of this separation (opaque IDs, sidecar-as-JSON-not-core-storage, injected
callbacks in UI components) without it being named or versioned as such.

---

## 11. Risks and unresolved questions

- **Two-manifest build tooling is new to this repo.** Today's build is one
  `esbuild` config producing one `main.js`/`manifest.json`. Splitting into
  two entry points sharing one `src/` tree needs its own build-config work
  (two `esbuild.config.mjs` invocations, two `manifest.json`s, making sure
  the Connectors build doesn't accidentally bundle Core's `main.ts` or vice
  versa) that this audit has not scoped in detail. Estimate this as its own
  small ticket before step 8 in §10.
- **`subscribeToOutgoingIntents` ambiguity if two connectors both claim the
  same article.** §6 punts on this ("a connector-author bug, not something
  core needs to referee in v1") — acceptable for a v1 with exactly one real
  connector (FreshRSS), but worth a documented decision before a second
  provider connector exists, since "do not create one Obsidian plugin per
  provider" (a stated constraint) means FreshRSS and Inoreader are expected
  to coexist inside *one* Connectors plugin, so this scenario is about two
  *simultaneously configured provider accounts*, not two plugins — the API
  should probably scope `subscribeToOutgoingIntents` per bound article
  (already unique) rather than per connector, which resolves the ambiguity
  for free: only the specific provider account that owns that article's
  binding is ever asked.
- **Settings migration for existing (parked) `feat/fresh-rss` data.** Because
  this branch has never shipped, there are no real users with `freshRss`-keyed
  settings on disk yet — but the branch has been through multiple rounds of
  its own sidecar-version migrations already (`FRESHRSS_SIDECAR_VERSION = 2`,
  optional-field-widening pattern). The settings-shape move in §10 step 2
  should reuse that same "optional on the wire, defaults losslessly" pattern
  rather than inventing a new migration mechanism.
- **Whether `data-sync-lease.ts` should be exposed via the connector API
  (`runExclusive`) or reimplemented by the connector.** Exposing core's
  existing lease avoids a second concurrency primitive but means a connector
  bug inside `operation()` can hold up core's own use of the same lease
  (today, FreshRSS is the *only* user of `DataSyncLease`, so this hasn't been
  tested under real contention from a second, physically separate caller).
  Recommend: expose it, but add a lease-acquisition timeout in the API
  wrapper (not present in `data-sync-lease.ts` today) specifically because a
  connector is no longer trusted first-party code once it's a separate
  plugin.
- **Whether "3.0" is still the right vehicle once minAppVersion pressure is
  relieved.** The FreshRSS-specific reason for deferring to 3.0 (§ project
  memory) was entirely about the `minAppVersion` floor raise. If Core's
  manifest no longer needs to move (§9's conclusion), the *Connectors*
  plugin can carry `1.11.4` on its own schedule, independent of Core's
  release cadence entirely — this may mean FreshRSS support could ship far
  sooner than 3.0, as a Connectors 1.0, without Core needing a major version
  bump at all. **This is a scope question for Marc, not something this audit
  decides** — flagging it because the extraction recommendation changes the
  calculus behind the existing 3.0-deferral decision.
- **Obsidian Community Plugin review queue time for a brand-new plugin
  listing**, if/when Connectors is published separately, is an external
  unknown (typically weeks, sometimes longer) not under this project's
  control — relevant to timeline planning, not to the architecture itself.

---

## 12. Verdict: is companion-plugin extraction justified?

**Yes — justified, not needless complexity — but scoped narrowly.**

The case *against* extraction would be "the coupling is shallow enough that
runtime capability gating inside one plugin is simpler than maintaining two
build targets." That argument does not survive contact with this specific
repo's enforced lint policy (§9): runtime gating **cannot** keep
`minAppVersion` down here, because `eslint-plugin-obsidianmd`'s recommended
config statically forbids it with no guard-based carve-out and no disable
escape hatch. Given that Marc has already stated a firm goal ("we do not want
optional remote-reader support to permanently raise RSS Dashboard Core's
minimum Obsidian version if it can reasonably be isolated") and this repo's
own tooling has already foreclosed the "isolate it with a runtime guard
instead" option, a second build target is the only mechanism left that
actually achieves the stated goal — not a preference among equally-valid
options.

Separately from that forcing function, the branch's own design already did
most of the hard conceptual work of a clean boundary — opaque remote IDs
everywhere, a sidecar file instead of polluting core's own storage format, UI
components that only ever call an injected optional callback rather than
importing FreshRSS services — without anyone deliberately designing it as an
extension point. That is a strong signal the boundary is *natural* to this
codebase's existing shape, not something being forced onto it after the fact.

**What extraction should NOT mean right now:** a second published Community
Plugin listing, a second repository, or one-plugin-per-provider. All three
would add real, ongoing maintenance cost (§11's build-tooling and review-queue
risks) without being required by anything in this audit's findings. The
recommendation is the narrowest version of "extraction" that satisfies the
`minAppVersion` constraint: two build targets from one repository (§10 step
8), one Connectors plugin covering every GReader-compatible provider (per
the explicit "don't create one plugin per provider" constraint), and a
versioned-but-internal API contract that could later support a genuinely
separate repository if that ever becomes the right distribution call — a
decision this audit deliberately leaves open rather than prejudging.
