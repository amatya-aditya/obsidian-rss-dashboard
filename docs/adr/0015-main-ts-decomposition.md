# ADR 0015: Decompose main.ts into injected modules behind a plugin facade

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

proposed

## Date

2026-09-26

## Summary

The plugin's main file has grown to nearly 4,000 lines and does many
unrelated jobs, so almost every change collides with another. We will move
those jobs out of it, one at a time, into separate modules that are given
what they need instead of reaching into the plugin. The plugin keeps its
existing public methods as thin forwarders so that nothing else has to change
at the same time. Every step is checked by tests written before the code
moves, and users should see no difference at any point.

## Context and problem

`main.ts` holds the plugin class that Obsidian loads, `RssDashboardPlugin`. Over
time it has become the place where most cross-cutting work happens: loading and
saving settings, refreshing feeds, warming the image cache, importing and
exporting data, adding and editing feeds, handling `obsidian://` links, and
remembering podcast playback position. At `dev` commit `ca2f6b2` it is 3,910
lines long. In the six months to 2026-09-26, 85 commits changed it, and 41 of
them were bug fixes.

That size costs contributors and users in three ways:

- **Changes collide.** Unrelated features edit the same file and often the same
  methods. `onload` alone changed in more than 25 commits in six months.
- **The plugin is hard to test.** Behavior is reached through one class with
  dozens of private fields. The tests that cover `main.ts` routinely reach into
  private members, such as `imageCacheService` and `validateSavedArticles`, to
  arrange or observe behavior.
- **Some bugs come from the file's shape.** The settings object is replaced in
  five places, and every replacement must rebuild the services that were given
  the old object. Missing one rebuild caused the bug fixed by
  [#399](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/399).
  Of the last 12 bug fixes that touched `main.ts`, 6 were in settings loading,
  saving, or service rebuilding.

The refactor umbrella
[#436](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/436)
schedules the break-up of `main.ts` as phase 7. It requires a design note
before any code, covering the module map, dependency direction, facade strategy
and extraction order. These constraints shape the answer:

- **The refactor must not change behavior** (#436 rules 1–3). Characterization
  tests that pin current behavior come first, must pass on the untouched code,
  and are read-only while the extraction runs.
- **One extraction per PR** (rule 5), committed as move, then wiring, then a
  simplify pass (rule 6).
- **Public plugin methods stay as one-line delegates** until a separate ticket
  moves their callers (rule 7). 23 production files import `main.ts`.
- **Only the plugin calls `registerEvent`, `registerInterval` or
  `registerDomEvent`** (rule 8). Startup order, `this` binding, and async,
  debounce and watcher-suppression timing must be preserved exactly (rule 9).
- **The architecture guardrails merged in
  [#253](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/253)**
  and described in the [architecture guardrails](../development/architecture.md):
  - A line ratchet on `main.ts` (baseline 3,911) and four other refactor
    targets. A ratcheted file may not grow, and when it shrinks its baseline
    is lowered in the same change.
  - A ratchet on which files may import `main.ts`.
  - No new runtime import cycles.
  - Services import no views, components, modals, settings or `main.ts`, not
    even as a type.
  - ESLint limits of 150 lines per function and complexity 20, as errors.
    Existing violations are recorded in `eslint-suppressions.json`, which
    covers three `main.ts` functions: `onload` (194 lines), `addFeed`
    (complexity 40) and `loadSettings` (complexity 21). Adding a suppression
    is an architecture exception.
  - On `refactor/*` pull requests, CI keeps `*.characterization.test.ts`
    files read-only.

### Terms used in this record

- **Composition root**: the one place that creates the plugin's parts and
  connects them. Here, the plugin class in `main.ts`.
- **Module**: a class with a small public interface that owns one job, in
  `src/services/`.
- **Port**: a small interface a module declares for something it needs from
  outside, such as "redraw the dashboard". The composition root supplies it.
- **Facade (delegate)**: a plugin method kept only to forward a call to the
  module that now does the work, so existing callers keep working.
- **Characterization test**: a test that records what the code does today,
  including known bugs, so a refactor can prove it changed nothing. In this
  repository such tests are named `*.characterization.test.ts`.
- **[Global feed operation](../../CONTEXT.md#sidebar-feed-management)**: the
  single cancellable, progress-tracked operation over many feeds that the
  sidebar shows.

## Decision

`main.ts` stays the composition root. It keeps the Obsidian lifecycle, every
registration, the settings object, and access to open views. Feature behavior
moves, one cluster at a time, into modules under `src/services/`. Each module
receives what it needs through a constructor dependency object and never sees
the plugin class. Public plugin methods remain as one-line delegates to those
modules until a later ticket moves their callers.

### Module map

| Step | Module (file under `src/services/`) | Owns | Main interface |
|---|---|---|---|
| 1 | `PreviewImageCache` (`preview-image-cache.ts`) | The image cache service's creation and teardown, the warm-up queue, change listeners, and the decision to redraw the dashboard after a warm-up batch | `initialize`, `setEnabled`, `setLimit`, `resolveCachedUrl`, `getSizeBytes`, `onChange` (returns a disposer), `clear`, `forgetFeed`, `warmFeed` |
| 2 | `FeedOperationTracker` (`feed-operation-tracker.ts`) | The global feed operation: whether one runs, cancellation and its abort signal, progress, the per-feed refresh status, and coalescing of sidebar status redraws | begin and end an operation, begin and finish a refresh batch, record a settled feed, cancel, read state, `dispose` |
| 3 | `FeedRefreshRunner` (`feed-refresh-runner.ts`) | Refreshing feeds: which feeds are eligible, the single-feed path, the bounded concurrent batch, timeouts, merging results, the failure summary, and what happens after a refresh | `refreshFeeds`, `refreshFailedFeeds`, `refreshSelectedFeed`, `refreshFeedsInFolder` |
| 4 | `FeedSubscriptionService` (`feed-subscription-service.ts`) | Adding, editing and nesting feeds and folders, and re-applying retention limits to every feed | `addFeed`, `editFeed`, `addSubfolder`, `applyFeedLimitsToAllFeeds` |
| 5 | `UriActionHandler` (`uri-action-handler.ts`) | Interpreting an `obsidian://rss-dashboard` link and reporting problems with it | `dispatch` |
| 6 | `SettingsImportApplier` (`settings-import-applier.ts`) | Applying an import that replaces or overwrites settings, and the rebuild and redraw that follow | One method per import kind (preferences, portable bundle, feed bundle, settings bundle) |
| 7 | Settings store (name fixed after the pilot) | Loading settings, including the bootstrap pointer and vault metadata location, the null-load and failed-load guards, and the reload after a synced change; saving them through the metadata location with watcher suppression; moving the metadata location | Shape fixed in its ticket after the pilot |
| 8 (optional) | inside `main.ts` | `onload` split into private registration helpers that run in the same order | — |

These are intended shapes. Each extraction ticket fixes the exact signatures.
Step 7's interface is settled after the pilot, because the pilot's work on
`feed-storage-repository.ts` changes the persistence code it sits beside.
Step 6 moves only the functions that apply an import. The export, copy and
import-from-file methods stay in `main.ts`. They turn service results into
notices on purpose: services report results and the caller decides what to
tell the user
([#250](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/250)).

Two clusters are deliberately **not** in this map:

- **Playback progress** has barely changed (1 commit and no fixes in six
  months), so it doesn't clear #436's bar for a refactor.
- **The storage migration facade** is mostly one-line delegates to
  `feed-storage-repository.ts`, which #436's target 1 is restructuring. It is
  reconsidered once that work lands.

**What stays in `main.ts`:**

- The constructor, which builds and wires the modules.
- `onload`, `onunload`, and every `register*`, `addCommand`, `addRibbonIcon`
  and `addSettingTab` call.
- Ownership of the settings object, and the rebuild of the services that
  already hold it by value.
- View access and activation: finding open dashboard, reader and discover
  views, redrawing them, opening views and settings tabs, and pushing article
  updates into open views. This code knows the view classes, so it belongs to
  the composition root. It also implements the ports that modules receive.
- Clusters that this ADR leaves in place: the metadata-file watcher and write
  suppression, the startup prompts, factory reset, saved-article checks,
  article-state sync, playback progress, the storage migration facade, and
  the export, copy and notice methods.
- The facades.

### Dependency direction

- `main.ts` may import anything. Nothing new may import `main.ts`, and #253's
  importer allow-list may only shrink.
- New modules depend only on `obsidian`, `src/utils/`, `src/types/` and other
  services. They never import views, components, modals, settings or
  `main.ts`, not even as a type.
- A module that needs a UI effect declares a port in its own file, in the
  style of the existing `DashboardViewLike` in `background-import-service.ts`,
  or takes a callback. `main.ts` supplies the implementation, and opens any
  modal a module needs through a callback. A port moves to `src/types/` only
  when a second module needs the same one.
- Modules never construct their peers. `main.ts` passes peers in, so the
  module graph stays acyclic by construction.
- Code a module needs that lives in a UI directory moves to `src/utils/` first,
  as its own change. The first case is the preview-image helper that step 1
  needs.

### What a module may hold

A module is built once, in the plugin constructor, and is never rebuilt when
settings are reloaded or replaced. Two rules follow from that:

- **Pass by value only what exists at construction and never changes.** That
  covers the feed storage repository, the auto-backup coordinator, peer
  modules and the `app` object.
- **Reach everything else through a getter or callback evaluated at call
  time.**
  - The settings object comes through `getSettings()`, and the module never
    stores the settings object or any part of it.
  - The same applies to every service `main.ts` creates later or replaces at
    runtime: the feed parser, article saver, folder service, backup service,
    import/export service, background import service and refresh scheduler.
  - A callback into the plugin is an arrow that looks up the member when
    called, such as `() => this.validateSavedArticles()`, never a method
    reference captured at construction. Existing tests replace plugin members
    after construction, and they must keep working.

This is what stops a new module from holding a stale object after a reload,
the failure behind #399. Where today's code deliberately captures a value
once, the module keeps doing so, and the characterization tests pin it. The
image cache's size limit is one example.

### Lifecycle and registration

- Only `main.ts` registers anything with Obsidian.
- A module that owns a timer, a listener set or other disposable state exposes
  a synchronous `dispose()`. `onunload` calls it at the exact position the
  equivalent inline cleanup runs today.
- Listener subscriptions return a disposer, as `onImageCacheChanged` already
  does.
- Timers stay `window.setTimeout` and keep their delays and reset rules (see
  *Implementation notes*).
- A refactor adds no cleanup that does not exist today.

### Facade strategy

- Every public member of `RssDashboardPlugin` keeps its name, signature and
  TypeScript shape, as the conservative reading of rule 7. A public field stays
  a field and a getter stays a getter.
- `activeRefreshState` stays a field. Its `Map` is handed to the tracker, and
  the field is never reassigned, so the tracker and the views always share one
  map.
- A delegate is a single statement that forwards to the module. Private
  members move without a delegate.
- Callers move off the facade only after the extraction steps land, in
  separate tickets grouped by caller file.
  - Those tickets are serialized with each file's own phase-8 refactor, since
    `dashboard-view.ts` and `sidebar.ts` are refactor targets themselves.
  - A moved caller depends on a narrow interface declared beside it,
    following the existing `StorageSettingsPlugin` and `GeneralSettingsPlugin`
    interfaces in the settings tabs, not on the module or plugin class.
  - Each caller ticket removes the facades it made unnecessary, lowers the
    ratchet, and removes its file from the importer allow-list.

### How each step lands

Each step is two pull requests. Rules 2 and 3 already imply the order: the
tests exist and pass on untouched code before any code moves, and they do not
change while it moves.

1. **A tests-only PR** (`test(main): characterize <cluster>`, from a
   `test/<issue>-<slug>` branch).
   - Adds `*.characterization.test.ts` files that drive the plugin through
     its public surface and observe settings, views, notices and vault writes.
   - Moves the existing tests that reach into private members this step will
     move into those files, rewritten against public behavior. From then on
     they are locked.
   - Pins known bugs with `// BUG: pinned, see #<issue>`.
2. **The extraction PR** (`refactor(main): extract <module>`, from a
   `refactor/<issue>-<slug>` branch).
   - Three commits, following the #436 contributor loop: move, then wiring,
     then simplify.
   - Modifies no characterization test, which CI enforces. It may add unit
     tests for the new module.

In this epic, a **move** commit must pass the repository's pre-commit hook on
its own. The hook runs the compliance checks, lints the staged files, and runs
the tests related to them. So the move commit does all of the following:

- It moves the code into the module file verbatim, except for mechanical
  rewrites of `this.x` into the module's own state or its dependencies.
- It adds the delegates and the module's construction to the plugin.
- It reroutes every remaining reference to the moved members inside
  `main.ts`, mechanically, so the commit compiles and every test passes.
- It lowers the ratchet to the new line count, because #253's check fails
  whenever `main.ts` shrinks without the ratchet moving.
- It leaves `eslint-suppressions.json` alone, because a function over a limit
  is never moved while it is over (see below).

The **wiring** commit is only for wiring that isn't mechanical. Examples are
replacing step 1's temporary "is an operation running" callback with the
tracker, and ordering construction in the constructor. The **simplify**
commit tidies the moved code without changing behavior.

A function that is over the length or complexity limit is not moved while it
is over. Moving it would need a new suppression in the destination file,
which is an architecture exception. Instead, a separate `refactor/*` PR first
splits it inside `main.ts`, guarded by the same characterization tests, and
prunes its suppression with `npx eslint . --prune-suppressions`. This applies to `addFeed` before step 4 and to
`loadSettings` before step 7. `onload` stays in `main.ts` and is split by
step 8.

### Extraction order

1. **Preview image cache.** It is the smallest self-contained state, with a
   clear public interface and good coverage. The refresh pipeline, feed adding
   and background import all feed it, so extracting it first sets the pattern
   for the rest. A small preparatory change first moves the pure
   preview-image helper out of `src/components/`.
2. **Global feed operation state.** The refresh batch, background import and
   Discover or OPML additions all use it, and the sidebar, mobile navigation
   and dashboard read it. Extracting it before the refresh runner keeps step 3
   a move.
3. **Refresh runner.** The largest cluster, with the most recent changes after
   the lifecycle code, and the best existing test coverage.
4. **Feed subscriptions.** Adding a feed joins global feed operations and warms
   images, so it follows steps 1 and 2.
5. **URI handler.** It calls `addFeed`, so it follows step 4. It is small and
   well covered.
6. **Import application.** It waits for #436's target-1 extraction of bundle
   import and export from `feed-storage-repository.ts`, which it calls, and
   for the phase-6 retro. It replaces the settings object, and its current
   coverage is low.
7. **Settings load and save.** It follows the pilot, whose patterns it
   adopts. It is the file's real bug hotspot: 6 of the last 12 fixes that
   touched `main.ts` were in settings loading, saving or service rebuilding.
   It is also the riskiest step, because every startup and every save goes
   through it.
8. **Split `onload`.** Optional. `onload` is the most-changed member, and
   splitting it into helpers that run in the same order removes its
   line-length suppression.

This keeps #436's sequence for the image cache, refresh pipeline, feed CRUD
and URI handler, with four changes:

- The refresh pipeline is split in two (steps 2 and 3).
- Import/export moves from third to sixth, narrowed to import application,
  behind its prerequisites.
- Playback progress is dropped from the epic.
- Settings load and save is added after the pilot.

The tests-only PRs, the preparatory helper move, and removing the two
uncalled methods can start at once. Extraction PRs wait until the pilot PR is
up, so they can match its patterns.

The characterization tests each step needs first, and the UI surfaces its
manual checklist covers, are listed under *Implementation notes*.

## Consequences

### Benefits

- **Behavior becomes testable through small interfaces.** Most clusters can be
  tested through a module instead of through a plugin instance whose private
  fields tests have to patch.
- **Changes concentrate.** Refresh, image-cache and feed-editing changes each
  land in one module instead of competing for `main.ts`.
- **A class of bug goes away for new modules.** Nothing they reach goes stale
  when settings are reloaded or replaced.
- **The file gets substantially smaller.** Steps 1–7 take `main.ts` from 3,910
  lines to roughly 2,500–2,700, with the facades and wiring kept. Moving the
  callers takes it further.
- **All three suppressions in `main.ts` go.** The in-place splits before steps
  4 and 7 remove the `addFeed` and `loadSettings` suppressions, and step 8
  removes the `onload` one.

### Trade-offs

- **Each step is two PRs**, and the first mostly rewrites existing tests
  before any production code moves.
- **Facades double the surface for a while.** A reader must follow a one-line
  delegate to find behavior until callers move.
- **Wiring grows.** Dependency objects make each module's collaborators
  explicit, but the constructor becomes longer.
- **The hottest area comes last.** Settings load and save wait for the pilot,
  so the area with the most recent fixes is the last to be simplified.

### Existing users and data

- Nothing changes for users. Every step is behavior-preserving and checked
  against a scoped manual checklist in the fixture vault, including disabling
  and re-enabling the plugin.
- No stored data, settings format or migration is affected.
- Bugs found during the analysis are pinned by tests and filed separately.
  The refactor does not fix them.

## Confirmation

The decision is working when every extraction PR shows all of these:

- `main.ts`'s line-count ratchet goes down.
- #253's importer allow-list does not grow.
- No new runtime cycle appears.
- No suppression is added, and `main.ts`'s counts only fall.
- No characterization test was modified.
- The scoped manual checklist passed in the fixture vault.

It is failing if a step needs a follow-up fix for a behavior change, or if the
new modules start importing each other in both directions.

## Considered options

### Keep #436's proposed order unchanged

The proposed order is image cache, refresh pipeline, import/export, feed CRUD,
URI handler, playback progress. It is mostly sound, because it starts from a
cluster that others feed. It was changed in four places:

- Refresh as one step would move about 555 lines together with the global
  feed operation state, which two other features also use.
- Import/export has 19% statement coverage. It replaces the settings object,
  and it calls code that #436's own target 1 is about to restructure.
- Playback progress barely changes, which is #436's own test for whether a
  refactor is justified, so it is dropped.
- Settings load and save is not in #436's list, but it is where most recent
  fixes are, so it is added as the last step.

### Start with the hottest code: settings load and save

This would give the largest payoff per step, since that area accounts for
most recent fixes. It was rejected as a *first* step because it is also the
riskiest: every startup path and every save goes through it. It sits beside
the `feed-storage-repository.ts` pilot, whose patterns are not settled yet.
It comes last instead, as step 7.

### Pass the plugin instance into each module

`new FeedRefreshRunner(this)` is the easiest move, since the code keeps calling
`this.plugin.x`. It was rejected because #253 forbids services from importing
`main.ts`, even for types. The module would also still depend on the whole
plugin, so nothing would become easier to test.

### Split the class across files without new seams

Examples are mixins, assigning methods onto the prototype, or declaration
merging. These shrink the file without changing any dependency. Every piece
still shares all of the plugin's state through `this`, and tests still patch
private fields. It was rejected because it moves text rather than
responsibility.

### Rewrite main.ts into a new application object in one change

Rejected. It breaks #436's one-extraction-per-PR rule, cannot be reviewed
against pinned behavior, and puts the whole startup sequence at risk at once.

### A dependency-injection container or service locator

Rejected as more machinery than roughly ten modules need. Obsidian's lifecycle
still has to be wired by hand in `onload`, and a locator hides the
dependencies that explicit dependency objects make reviewable.

### Notify the UI through workspace events instead of ports

The plugin already triggers a workspace event for filter changes, and an event
bus would decouple modules from views further. It was rejected for now because
moving a direct call onto an event changes when the redraw happens, and rule 9
requires timing to be preserved exactly. It can be revisited once
characterization tests pin the redraw order.

### Move callers first, then extract

Rejected. It would touch 23 files at once, including `dashboard-view.ts` and
`sidebar.ts`, which are phase-8 refactor targets. It also has nothing to move
callers to until the modules exist.

### A new `src/plugin/` directory for modules that know about views

This would let modules open modals or read view classes directly. It was
rejected because such a directory would be a second composition root in all
but name, and modules that depend on views can't be tested with plain fakes.
#253's dependency check would also need a new rule for it.

### Characterization tests and extraction in one PR

Rejected. Existing tests that reach into private members have to be rewritten
before the members move. Rewriting a test during the extraction breaks rule 3,
and the planned CI check would reject it.

## Implementation notes

### Responsibility map at `ca2f6b2`

How each column was measured:

- **Main line ranges** are envelopes. **LOC** counts only the members
  attributed to the cluster, so fields that sit inside another cluster's
  range are not double-counted.
- **Commits** cover the six months to 2026-09-26. Each change was attributed
  to the members its diff touched, and a commit counts as a fix when its
  subject contains "fix".
- **Coverage** is v8 statement coverage from the 43 test files that import
  `main.ts`, 404 tests in all.

| Cluster | Main line ranges | LOC | Commits / fixes | Coverage | Step |
|---|---|---|---|---|---|
| Refresh runner | 1687–1758, 1804–1836, 3449–3822 | ≈480 | 24 / 11 (whole pipeline) | 83% (whole pipeline) | 3 |
| Global feed operation state | 302, 304–308, 318, 321, 903–919, 929–978 | ≈75 | (with the runner) | (with the runner) | 2 |
| Import/export and import application | 300, 1864–1910, 1931–2348 | 415 | 16 / 8 | 19% | 6 (apply functions only: 1959–2065, 2085–2192) |
| Settings load/save and metadata location | 114–120, 181–284, 2358–2364, 2902–3022, 3094–3096, 3275–3447 | 391 | 22 / 11 | 64% | 7 (after the pilot) |
| Lifecycle and service wiring | 286–434, 1103–1323, 1456–1471, 3833–3869 | 349 | 44 / 20 | 50% | stays (step 8 optional) |
| Feed CRUD | 1764–1802, 2653–2900 | 284 | 13 / 5 | 47% | 4 |
| Storage facade and desktop paths | 122–128, 152–173, 921–927, 2350–2615 | 264 | 16 / 6 | 18% | not in the epic |
| Image cache warming | 323–329, 436–636 | 194 | 4 / 3 | 71% | 1 |
| View access and activation | 846–900, 980–1037, 1066–1101, 1473–1556, 1648–1685 | ≈220 | 6 / 3 | 52% | stays |
| Playback progress | 129–150, 317, 3098–3273 | 184 | 1 / 0 | 7% | not in the epic |
| Article-state sync | 1558–1646, 1838–1862 | ≈115 | 4 / 3 | 34% | stays |
| URI handler | 292, 1325–1454 | 127 | 6 / 2 | 77% | 5 |
| Metadata watcher and write suppression | 315, 320, 702–712, 3024–3092 | 80 | 2 / 1 | 91% | stays |
| Factory reset | 287–291, 638–683, 1039–1064 | 75 | 3 / 2 | 3% | stays |
| Saved-article checks | 310, 731–759, 3871–3909 | 67 | 4 / 2 | 57% | stays |
| Startup prompts (What's New, storage warning) | 311–312, 761–844 | 67 | 2 / 1 | 87% | stays |
| Existing delegates (background import, folders, backup) | 685–700, 1912–1929, 2617–2649, 3824–3831 | 63 | small | 70–100% | stays |

`addYouTubeFeed` (2806–2831) and the private `folderPathExists` (2617–2619)
have no callers. They are not moved into new modules; a small PR of their own
deletes them.

### Per step: characterization first, and UI surfaces

| Step | Characterization tests needed first | UI surfaces for the manual checklist |
|---|---|---|
| P0 | None new. Leave a re-export at the old path so `card-view.ts`, `feed-view.ts` and the helper's existing test don't change. | Card and feed layouts: preview images and summaries |
| 1 | Rewrite the tests that set `imageCacheService`, `queuePreviewImageCaching` or `initializeImageCache` directly (`image-cache-lifecycle`, `feed-refresh-pipeline`, `background-import-orchestration`, `plugin-lifecycle`). Pin queue deduplication, the two-worker limit, no dashboard redraw during a refresh batch, `forgetFeed` keeping URLs another feed still uses, limit normalization, and that a reload doesn't change the size limit of a running cache. | Settings → Display (image caching toggle, limit, clear, size); feed manager cache size and clear; deleting a feed; card images after refresh, add and import |
| 2 | Refusal notices for both ways of starting; cancel order (defer schedule, abort, notice); progress written by background import; the 250 ms trailing coalesce and final flush; factory reset clearing only the map and the running flag; an import started while an operation runs (behavior 5). | Sidebar "All feeds" progress and Stop; per-feed spinners; mobile navigation modal; filter status bar; OPML import and Discover "add all" progress; Discover single-feed add (progress 0/1 and Stop) |
| 3 | Rewrite spies on `validateSavedArticles`, `notifySidebarRefreshStatusChanged` and `getRefreshableFeeds` only where the spied member moves. Pin folder prefix matching; exclusion and pending-import filtering; the leading-edge 250 ms progress throttle; soft-timeout detach; the failure-summary text; that cancelling the startup delay also leaves automatic refresh off. | Refresh command; sidebar refresh of a feed, folder, all feeds and retry failed; dashboard toolbar refresh of the current feed, folder, tag or all, and retry; edit-feed refresh; Settings → General "apply and refresh" for maximum items; scheduled and startup refresh |
| 4 | Global-operation path (busy, cancelled mid-parse); parsed values taking precedence over requested ones; the encoding allow-list; `editFeed` URL and title side effects; `editFeed` and `addSubfolder` showing their notice only when a dashboard is open; the cancelled flag being read even for adds that are not global feed operations (behavior 9). | Add-feed modal (from the feed manager, dashboard and URI); Discover and Kagi Small Web "add"; edit-feed modal; subfolder creation; "Apply feed limits to all feeds" command and the Settings → General buttons that call it |
| 5 | The `uriAction` parameter taking precedence over the route action; a route-only link with no URL; malformed percent-encoding; `www.` title stripping; default folder fallback. | `obsidian://rss-dashboard?...` links from a browser |
| 6 | Replacing versus overwriting preference imports (defaults, `replacesFeedList`); bundle imports' rebuild, settings-tab refresh and dashboard and discover redraw order; error wrapping; that these paths replace the background import service. | Settings → Import/Export and Storage tabs (preferences and bundle imports); import confirmation dialog; "Import user preferences" command |
| 7 | The null-load guard (no early save; fresh-install storage location); the unreadable vault-metadata guard; which normalizations trigger the startup save; that a reload rebinds services but keeps a running background import; the failed-load path (behavior 1); the bootstrap pointer written beside vault-location metadata; moving and reverting the metadata location. Many already exist in `plugin-lifecycle`, `fresh-install-storage-location`, `settings-reload-services`, `startup-backup` and `whats-new-trigger`, and move into characterization files. | Startup (fresh install, existing install, synced vault before `data.json` arrives); a synced `data.json` or `user-state.json` reload; Settings → Storage metadata location move and revert; any setting change (every save path) |
| 8 | The phase-4 `plugin-lifecycle.characterization.test.ts` (onload and onunload order, timers, disable and enable). | Plugin disable and enable; views, commands, ribbon icon and settings tab present |

### Couplings a step must handle

- **Step 1.** The image cache:
  - reads whether a multi-feed operation is running (572), which it gets
    from `main.ts` through a callback until step 2 rewires that callback to
    the tracker;
  - redraws the dashboard through a port (631–636);
  - reads the feed list (509–529);
  - writes display settings and saves them (482–498, 531–541).

  It receives its size limit once, when the cache is created (462). Only
  `setImageCacheLimit` changes it later.
- **Step 2.** The global feed operation state is written outside its own
  methods:
  - `refreshFeedBatch` starts its own batch (3561–3578). It uses a different
    notice, clears the status map, doesn't notify, and is cancellable only
    for the global intent.
  - `refreshFeedBatch` also clears state before its final redraw
    (3677–3678) and in `finally` (3692–3698).
  - `refreshFeedBatch` marks every feed pending (3587–3590).
  - `processRefreshBatchFeed` counts completions (3740, 3745), sets and
    deletes status entries (3730, 3762), and checks whether any feed is
    still active (3763).
  - `refreshSingleFeed` sets status entries and awaits an immediate full
    redraw, not the coalesced one, and takes no lock (3522–3526,
    3539–3540).
  - `addFeed` reads the cancelled flag (2732).
  - Factory reset clears only the map and the running flag (1042–1043).
  - Background import writes the progress counters (369–375).

  Other code reads it:
  - the batch reads the cancelled flag and the abort controller (3579, 3631,
    3672, 3684, 3741, 3746);
  - the batch schedules coalesced redraws (3734, 3763);
  - the public getters (930–943);
  - the image cache (572) and the scheduler (721).

  The tracker needs an operation for each of these. The step's move commit
  reroutes them all, so that commit passes the tests on its own.
  `FEED_REFRESH_RENDER_THROTTLE_MS` (321) is used by both the tracker (918)
  and the runner (3600). It becomes a single exported constant in the
  tracker.
- **Steps 3 and 4.** The runner reaches the background import service
  (3457), the scheduler and the saved-article check through getters. Feed
  adding reaches the folder service through `ensureFolderExists`. Each of
  these is either created after the plugin constructor, replaced at runtime,
  or replaced by tests.
- **Step 6.** Preference imports call `migrateSettings`, not the full
  normalization that loading runs, and replace the background import service
  through `initializeSettingsBackedServices`.
- **Step 7.**
  - Loading decides whether services exist yet: it rebinds them on a reload,
    and builds them itself when a first load has to save.
  - Its two flags (`wasNullSettingsLoad`, `settingsLoadFailed`) are read by
    the What's New prompt.
  - Saving goes through `getMetadataSaveCallback`, which writes with watcher
    suppression, then records the change for the auto-backup and reschedules
    auto-refresh.
  - Five places assign the settings object; the store must keep them all
    working.

### Lifecycle invariants every extraction must keep

Phase 4's `plugin-lifecycle.characterization.test.ts` pins these.

**Startup order in `onload`** (1103–1323):

1. Resolve the vault's absolute path. `BackupService` receives it by value.
2. Run `loadSettings`. On a first load, folder repair is skipped because
   `FolderService` does not exist yet. If loading needs a save, services are
   built inside `loadSettings` first, so that save can take a backup.
3. Run `initializeImageCache`.
4. Register the metadata watchers: three `registerEvent` calls, for vault
   modify, create and rename.
5. Redraw an already-open dashboard.

Then, inside the `try` block:

6. Build the settings-backed services.
7. Create the auto-refresh scheduler.
8. Apply mobile adjustments.
9. Schedule the saved-article check for layout-ready. It fixes file paths,
   then migrates playback progress, then validates.
10. Register `active-leaf-change` and layout-ready handlers for What's New.
11. Register the protocol handler.
12. Register four views: dashboard, discover, reader and Small Web.
13. Add the ribbon icon, the settings tab and ten commands.
14. Start the auto-refresh scheduler, after `startupRefreshDelaySeconds`
    (default 5), or immediately when the delay is zero or less.

**Registrations.** There are four `registerEvent` calls and no
`registerInterval` or `registerDomEvent`. Background import adds its status bar
item through a callback to `addStatusBarItem`.

**Timers.** All use `window.setTimeout`:

- The metadata reload waits 1,500 ms and restarts on every watched event.
- The startup refresh delay is cancelled by unload, the refresh command,
  sidebar refresh-all and retry-failed, and the dashboard's refresh-all, tag
  and retry actions. Because the scheduler starts only from that timer, a
  cancelled delay leaves automatic refresh off for the rest of the session.
- Sidebar status redraws are coalesced to 250 ms, trailing. The first request
  starts the timer, later ones do not restart it, and the last feed settling
  flushes it at once.
- Batch progress redraws are throttled to 250 ms, leading-edge. Requests
  inside the window are dropped with no trailing redraw, and a forced redraw
  follows the start of the workers.
- The playback save is throttled to 2,000 ms. It is scheduled once and not
  restarted, and a flush cancels it and saves.
- Each feed has a hard timeout (`FEED_REQUEST_TIMEOUT_MS`), cleared when the
  refresh settles.
- The soft timeout (`FEED_SOFT_TIMEOUT_MS`) is never cleared. A feed that
  exceeds it is detached and awaited at the end of the batch, and it keeps its
  fetch-semaphore slot.
- The scheduler owns its own timer, and rechecks every second while a batch
  holds the lock.

**Concurrency.**

- Refresh workers number `min(MAX_CONCURRENT_FETCHES, feeds)` and share the
  module-level `globalFetchSemaphore` with background import.
- Image warm-up runs at most two workers.
- Only one multi-feed operation runs at a time. Its two entry points show
  different notices when busy.

**Captured once and resolved at call time.**

- `FeedStorageRepository`'s write wrapper, and its user-state health callback
  that triggers a status redraw.
- `AutoBackupCoordinator`'s snapshot writer, which reaches the current
  `BackupService`.
- `BackgroundImportService`'s parser forwarder and its settings getter.

**Captured by value.**

- `FeedParser` receives display, tags and media settings.
- `ArticleSaver`, `ImportExportService`, `BackupService` and `FolderService`
  receive settings.
- The image cache receives its size limit when it is created.
- `ReaderView` receives settings and `ArticleSaver` when the view is created,
  and is never updated.

**Settings replacement.**

- The settings object is assigned in five places: factory reset (1041),
  replacing and overwriting preference imports (1970, 2048), and loading and
  its error path (2944, 3019).
- Bundle imports and storage migrations mutate it in place.
- A synced reload rebuilds services with `bindSettingsBackedServices`, which
  keeps a running background import.
- Imports, migrations and factory reset call
  `initializeSettingsBackedServices`, which replaces the background import
  service.

**Watcher suppression.**

- `writeWithWatcherSuppressed` sets a deadline 3 seconds ahead before writing
  and never clears it early. Events that arrive before the deadline are
  ignored.
- The watched paths are `data.json` and `user-state.json` in the metadata
  folder, falling back to `.rss-dashboard-data`.
- A reload runs `loadSettings`, then redraws dashboards.

**Unload order in `onunload`** (3833–3862):

1. Stop the scheduler.
2. Clear the metadata reload timer.
3. Clear the status redraw timer.
4. Cancel the startup refresh.
5. Without waiting: save pending playback progress, then flush the backup.
   Errors are logged.

Image-cache workers, refresh batches and background imports are not stopped,
and the image cache is not destroyed.

### Behavior to pin, not fix

Items 1–6 are filed as issues, so pinned tests can cite them. Items 7–9 may be
intended and are raised in this ADR's review first.

1. **A failed settings load** ([#447](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/447)).
   - It assigns the shared, unfrozen `DEFAULT_SETTINGS` constant itself
     (3019).
   - After a reload, it does so without rebuilding services that may already
     have been rebuilt around the loaded object.
   - No later save checks for the failure, so the next save can write the
     defaults over the user's data.
2. **Stale reader view** ([#448](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/448)). An open reader view keeps the settings object and
   `ArticleSaver` from before a reload.
3. **Nothing stopped on unload** ([#449](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/449)). `onunload` leaves image-cache workers,
   refresh batches and background imports running.
4. **Automatic refresh stays off after an early refresh** ([#450](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/450)). A manual refresh
   during the startup delay leaves automatic refresh off for the whole
   session (1305–1310, 3864–3869, and the scheduler's `started` check).
5. **Busy OPML or Discover import** ([#451](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/451)). When one starts while an operation runs,
   it saves the new feeds but does not fetch them. The notice still says
   articles will be fetched in the background (`background-import-service.ts`
   266–281, main.ts 1886).
6. **Possibly unintended: folder repair** ([#452](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/452)). The first load skips folder-path
   repair (2621–2622).
7. **Possibly unintended: orphaned imports.** Imports and factory reset
   replace the background import service and orphan a running import's
   queue. The #399 fix avoided exactly that for synced reloads.
8. **Possibly unintended: missing retention defaults.** A replacing
   preference import skips the retention defaults for imported feeds that
   have no keyword rules (2000), until the next load fills them.
9. **Possibly unintended: silent failed add.** `addFeed` checks the global
   cancelled flag even for ordinary adds (2732). An add whose parse finishes
   after Stop, but before the cancelled refresh finishes, stores nothing and
   shows no notice.

### Review outcome and remaining questions

The maintainer's first review (2026-09-26) settled the proposal's open
questions. The answers are folded into the decision above:

- Splitting refresh in two and moving import/export to sixth are agreed.
- Playback progress is dropped from the epic, and settings load and save are
  added after the pilot.
- Tests-only PRs come first, from `test/*` branches, as
  `*.characterization.test.ts` files that are locked from then on.
- *Global feed operation* is added to the glossary.
- The uncalled `addYouTubeFeed` and `folderPathExists` go in their own small
  PR.
- The bugs below are filed so pinned tests can cite them.
- Extraction waits for the pilot PR.

Still open:

1. **Pilot patterns.** Does the pilot use the same patterns as this ADR:
   dependency objects, getters for anything replaced at runtime, and modules
   built once? If it settles on something else, this ADR is amended before it
   is accepted.
2. **Possibly unintended behaviors.** Were items 6–9 in the list above
   intended? Item 6 is filed as #452; items 7–9 are raised here rather than
   filed. All four are pinned either way.

## Related

- [GitHub Issue #436](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/436): refactor umbrella; this ADR is its phase-7 design note
- [GitHub PR #253](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/253) and the [architecture guardrails](../development/architecture.md): ratchets, dependency rules, function limits and the characterization-test check
- [GitHub PR #399](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/399): services kept stale settings after a synced reload
- [GitHub PR #250](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/250): services return results; callers turn them into notices
- [ADR 0007: Article-metadata pipeline seam](0007-article-metadata-pipeline-seam.md): precedent for choosing a seam and its dependency direction
- [ADR 0014: The Obsidian test stub models observed Obsidian behavior](0014-obsidian-test-stub-fidelity.md): characterization tests are only as faithful as the stub
- [Glossary: Sidebar feed management](../../CONTEXT.md#sidebar-feed-management)
