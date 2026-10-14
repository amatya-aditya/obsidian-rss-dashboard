---
status: accepted
created: 2026-10-14
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1078"
milestone: "3.0.0"
owner: unassigned
workstream: "3.0 release"
sequence: null
depends_on: []
release_requirement: required
implementation: ""
---

# Slice the ADR 0006 read-only cutoff into an implementable spec

## Question

How is the ADR 0006 cutoff cut into implementable slices, and in what order?

[ADR 0006](../../docs/adr/0006-deprecate-legacy-json-and-shard-storage-v1.md)
settled _what_ happens at 3.0. This plan settles _how it is built_.

## Sources of truth

Where these disagree, the earlier source wins:

1. [ADR 0023](../../docs/adr/0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md)
   and [#1075](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1075)
   — the 3.0 support floor is Obsidian 1.11.5, and the plugin does not straddle
   the floor. This is the most current evidence and every other 3.0 ticket
   abides by it.
2. [ADR 0006](../../docs/adr/0006-deprecate-legacy-json-and-shard-storage-v1.md)
   — the cutoff policy. Not re-decided here.
3. This plan — the decomposition, the invariant, and the order.

Consequences of (1) that shape everything below: users below 1.11.5 never
receive 3.0, so they keep writable Legacy JSON and Shard v1 and keep the staged
2.x prompt. The cutoff therefore serves an at-or-above-1.11.5 population only,
and **no slice may introduce a version guard or a capability-absent path**, since
3.0 never runs below the floor.

## What read-only means at 3.0

A vault whose feed storage mode is Legacy JSON or Shard storage v1 (a
**deprecated storage mode**) at 3.0:

- **opens and displays** all stored articles;
- **writes nothing** — no feed refresh, no starring, tagging, or saving to
  vault, no retention auto-delete, and **no persistence of any other setting
  either** (see _Total freeze_ below);
- **still marks read state in memory**, which is discarded on quit;
- **still exports** a Portable data bundle;
- **can still migrate** to Shard storage v2 through the frozen importer.

## Total freeze, not a split contract

Every `SettingsStore.saveSettings` call is suppressed while the vault is on a
deprecated mode — feed content, article state, _and_ unrelated preferences. UI
preferences, retention configuration, and feed folder paths changed while
read-only are lost on quit, exactly like read marks.

Rationale: the existing Legacy path serializes the **whole live settings
object** (`src/services/feed-storage-repository.ts:410-422`), so any surviving
write is a legacy-format write. A "preferences-only" contract would oblige every
caller to be classified as data or preference and would create a second v2 write
route beside the importer — reintroducing the multi-path complexity the cutoff
exists to delete. The prompt copy must say that preference changes are lost too,
not only read state.

The **metadata location** setting (`plugin-default` / `vault-location`,
`src/services/settings-store.ts:481-566`) is a separate axis from the feed
storage modes and survives untouched for a v2 vault. On a deprecated vault it is
a write like any other and is frozen by the total freeze.

## Export and migration carry in-session read marks

Read state marked during a read-only session is discarded on quit, but it
**travels** through an explicit export or migration performed in that session.

Export already reads live in-memory items
(`src/services/feed-storage-repository.ts:764-779`), and v2 hydration applies
persisted state onto those items, so making export read from disk instead would
add a new disk-read path to the module the cutoff is shrinking. Read marks are
real user intent expressed at the moment of the escape hatch; "discarded on
quit" describes the default lifecycle, not an override.

## The read-only invariant and the importer exemption

**Invariant.** While the vault's feed storage mode is deprecated, no generic
persistence occurs. It is enforced in **one place** — the persistence choke
point (`SettingsStore.saveSettings` → `FeedStorageRepository.persistSettings`) —
because nearly every write already funnels through it.

It is a **runtime predicate on the storage mode** (`isDeprecatedStorageMode`,
`src/utils/storage-deprecation-prompt.ts:50-54`), not a build-time flag and not
a version comparison. It is introduced in Slice 1 and _kept_ after the write
paths are deleted in Slice 4: it costs nothing, and it makes the contract
provable by a test at the seam rather than inferred from the absence of code.

**Package it as a state of its own.** It must not be folded into
`settingsLoadFailed` (`src/services/settings-store.ts:96`), which means "the
load failed, so writes are suppressed", and which is surfaced only as a load
error Notice. Read-only needs its own signal and its own UI.

**It must cover the unload path.** `AutoBackupCoordinator` writes a final
best-effort snapshot on unload when persistence made the session baseline stale
(`src/services/auto-backup-coordinator.ts`). A deprecated vault must not take
that snapshot.

**The exemption.** The frozen importer migrates _from_ a deprecated mode, so it
cannot travel through the gate it is exempt from. It takes captured state in and
writes through a narrow v2-only adapter, and it does not call the gated
`persistSettings`. Without this exemption the cutoff would make migration
impossible.

## Slices

Each slice is independently reviewable and leaves the tree green. **Every slice
belongs to the 3.0 line and none of them may land on `dev` while 2.x minors still
ship from it** (see _Landing constraint_).

### Slice 1 — Read-only invariant and importer exemption

Deliver: the predicate, the choke-point gate, the distinct read-only state, and
coverage of the auto-backup and unload paths. No UI change: an existing 2.x user's
vault is unaffected because the predicate is inert until the release that carries
it is 3.0.

Acceptance criteria:

1. Opening or reloading a deprecated vault whose data needs normalization leaves
   the source files byte-identical and the articles readable — including the
   load-time saves at `src/services/settings-store.ts:270-286`, the metadata
   write at `:413-416`, and the folder-path repair at `:248`.
2. With the gate active, a star/tag/save/read mutation through its service entry
   point changes nothing on disk; restarting the app restores the original state.
3. Automatic writes — scheduled refresh, retention auto-delete, and the unload
   snapshot — are skipped, not merely attempted and failed.
4. The in-memory read marks still render for the session.
5. The read-only state is distinguishable from `settingsLoadFailed`; a failed
   load still behaves as it does today.
6. The importer route writes v2 successfully while the gate is active.

Test seam: the persistence choke point. Extend
`test_files/unit/main/settings-store.characterization.test.ts` and
`test_files/unit/services/feed-storage-repository.test.ts`.

### Slice 2 — Frozen importer

Deliver: `migrateToVaultShardsV2` extracted behind the interface fixed above —
captured state in, a narrow v2-writing adapter, no other repository dependency —
with `migrateToVaultShards` (the v1 target, `feed-storage-repository.ts:577-609`)
deleted. Freeze it with teeth.

Why before Slice 4: the removal slice guts the same module. An importer that is
extracted first is a thing removal must not break; an importer still entangled
with `persistSettings` is a thing removal has to be careful around.

Freezing mechanism (chosen because nothing in the repo freezes a production
module today):

- a `scripts/check-architecture.mjs` rule that the importer module may import
  only a declared narrow allowlist, so a future refactor fails the gate rather
  than silently re-entangling it;
- extend the characterizing-test guard (`scripts/check-characterization-tests.mjs`,
  currently `refactor/*`-only) to cover the importer's test file on **all** PRs.

Fixtures: **commit captured Legacy JSON and Shard v1 vault samples** under
`test_files/`. `test_files/fixture-vault/` is v2-only today, and legacy/v1 are
generated at setup time by `scripts/setup-fixture-vault.mjs:42,190-229`. Committed
samples capture the real on-disk shape a 2.x user has, which is the whole risk of
a one-way migration; in-memory synthesis tests the parser but never the shape,
and CI-time generation from the mutable setup script defeats "tested once".

Acceptance criteria:

1. A committed Legacy JSON sample and a committed Shard v1 sample each migrate
   to v2 with articles and article state intact.
2. Interrupting a migration restores the declared rollback contract: mode and
   folder return to their pre-migration values and the source files survive.
3. The importer module's imports are limited to its allowlist, enforced by
   `npm run check:architecture`.
4. Export continues to work from a deprecated vault, including in-session read
   marks.

### Slice 3 — Read-only affordance and the 3.0 prompt state

Deliver the user-facing half, so the cutoff is never felt as unexplained
breakage. It lands with the invariant, not after it.

- **Disabled up front**: Refresh, star, tag, save-to-vault, and the retention
  controls are disabled or hidden while read-only. A persistent read-only
  indicator is shown in the dashboard and reader.
- **One explanatory Notice per session on the first user-initiated block**, not
  per click.
- **Silent for automatic paths.** The scheduler firing, retention auto-delete,
  and the unload snapshot are skipped without a Notice. A toast per interval
  would be a defect.
- **3.0 prompt state**: the staged 2.x deferral is replaced. Delete
  `storageMigrationDismissedUntil` and `storageMigrationDeferralCount`
  (`src/types/types.ts:620,625`), `canDeferByVersion` and `MAX_VERSION_DEFERRALS`
  (`src/utils/storage-deprecation-prompt.ts:11,72-74`), and the modal's "Skip
  this version" button. The 3.0 state is shown once per session, offers
  **Migrate** and **Export**, and is postponable per session but not permanently
  dismissed. Drop the stale fields in the settings loader, which already has this
  pattern (`src/utils/settings-loader.ts:353-359`).

Acceptance criteria:

1. Every blocked user-initiated action either cannot be triggered or produces
   exactly one explanation per session.
2. No Notice is produced by a scheduled refresh or by unload.
3. A deprecated vault at 3.0 shows the read-only state once per session and
   always offers migration.
4. A vault upgraded from 2.x with `storageMigrationDismissedUntil` set loads
   cleanly with the field dropped.
5. `3.0` appears only as release copy; no version comparison drives read-only.

### Slice 4 — Remove the retired surface

Deliver, in one slice:

- the v1 and legacy **write paths**;
- **`revertToLegacyJson`** (`feed-storage-repository.ts:652-674`) and its UI;
- **revert-to-legacy and repair entries** in the storage-mode selector
  (`storage-settings-tab.ts:388-404`, `:640-686`);
- the **five public plugin facades** on `main.ts`
  (`:2042`-`:2158`);
- the dead v1 tests.

**Storage repair is re-scoped, not deleted.** `repairVaultShards`
(`feed-storage-repository.ts:676-710`) is not mode-specific: it force-regenerates
shards for whichever shard mode the vault uses, and the button is offered
unconditionally. It is a v2 maintenance tool that the cutoff has no reason to
remove. It is therefore kept for v2 and gated off on a deprecated vault. ADR 0006
is corrected accordingly (see _Documentation deliverables_).

**The facade-delegate rule does not apply here.** `AGENTS.md`'s refactor rule
keeps public plugin methods as one-line delegates until a separate ticket moves
their callers; that rule stabilises in-flight extractions and is not meant for a
capability being deleted outright. Record the exception in the PR so a later
agent does not preserve dead delegates.

Acceptance criteria:

1. The mode selector offers only Shard storage v2, and a deprecated vault's
   selector is read-only.
2. Repair works on a v2 vault and is unavailable on a deprecated vault.
3. No code path can write Legacy JSON or Shard v1.
4. `npm run check:architecture`, `npm run lint`, and the full unit suite pass.

### Slice 5 — #319 hand-off and documentation

Deliver the interface contract with
[#319](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/319)
(see below), the ADR corrections, the new ADR, and the `CONTEXT.md` terms.

## Landing constraint

This is the constraint the sequence places on the 3.0 landing strategy, which
[#1071](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1071)
defers to the scope-lock ticket. It is mandatory, not optional:

**Slice 1 merged to `dev` today would make an existing 2.x user's Legacy JSON
vault read-only.** Breaking work cannot sit on `dev` while 2.x minors keep
shipping from it. The whole set therefore ships on the 3.0 integration line and
is released together, and no slice is written with a `requireApiVersion` guard or
a version-gated activation to make it `dev`-safe — that would contradict the
"no straddle" corollary of ADR 0023.

## Order with respect to #319

**#319 lands after Slice 4.** #319 rewrites new-install storage defaults and the
Import/Export toggles, and its accepted proposal assumes a settled selector;
landing it first means editing the three-mode selector and then deleting two of
its options. The two touch the same Storage tab on different axes — #319 owns
the metadata-backup toggles and new-install paths, this plan owns the feed
storage-mode selector and the write paths — so the contract is: **#319 must
assume a v2-only feed storage selector and must not reintroduce a
deprecated-mode option.**

Re-baseline #319's accepted proposal against Slice 4's selector before
implementing it. If its proposal cannot be expressed without rewriting most of
it, close it and re-cut the remainder rather than patching it in place.

## Documentation deliverables

- **ADR 0006 corrections** (its decision stands; two sentences no longer match
  current evidence):
  - the justification for bundling the cutoff with 3.0 no longer claims FreshRSS
    requires the floor raise — it is "one disruption instead of three" plus the
    floor-raise consequence;
  - "storage repair ... removed" is scoped to the deprecated modes, because the
    v2 repair tool survives.
- **New ADR 0024**:
  _Enforce the 3.0 read-only cutoff at the persistence choke point_ — records the
  total-freeze choice, the importer exemption, and why the runtime predicate
  outlives the deleted write paths.
- **`CONTEXT.md`, under Storage**: add `Read-only vault`, `Frozen importer`, and
  `Storage cutoff`; update `Deprecated storage mode` (cutoff copy), `Storage
repair` (v2-only), and `Storage revert` (removed at 3.0).
- **`CONTEXT.md`, under Version support**: no new terms. `Declared floor` already
  carries the idea, and ADR 0023 / #1075 are the source of truth; a "below-floor
  user" term would restate them.
- **User documentation**: `docs/user/storage-vault-shards-guide.md` still
  describes revert-to-legacy and the three-mode selector; it needs a pass with
  Slice 4. The public roadmap's "Deferred to 3.0" wording is #1071's pass, not
  this plan's.

## Out of scope

- **Who maintains 2.x for the users the floor cuts off.** A consequence of the
  floor raise (#1075), not of the cutoff; tracked on #1071.
- **The 3.0 landing mechanism** (integration branch vs feature flags). This plan
  states the constraint; #1071 decides the mechanism.
- **Re-deciding ADR 0006** or the FreshRSS decisions from #221.
- **The portable-bundle import path.** It is a different feature, it is how a
  user restores, and it remains a legitimate v2 write route.
- **Metadata storage relocation**, beyond being frozen on a deprecated vault by
  the total freeze.

## Next step

**Run `to-issue` against this plan to delegate the slices into tickets when 3.0
is ready for implementation.** This document is the seat of the design; it is not
itself the implementation work, and nothing here should be built from it
directly.

- Open **Slice 1 as a single issue.** The invariant and the importer exemption are
  one decision, and splitting them risks reintroducing a "read-only makes
  migration impossible" defect.
- Open Slices 2-5 as written; each is already issue-sized with observable
  acceptance criteria.
- Re-baseline
  [#319](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/319)
  against Slice 4's selector contract at the same time, and close it only if
  re-baselining turns out to be a rewrite.
