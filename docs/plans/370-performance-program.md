---
status: in-progress
created: 2026-09-24
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/370"
milestone: ""
owner: unassigned
workstream: performance
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Performance program: measured baselines and before/after results

## Goal

Make RSS Dashboard measurably faster for contributors and for users, using
repeatable metrics rather than impressions. Every track starts from a recorded
baseline and ends with a before/after comparison the dev team can read without
rerunning anything.

The program has two halves:

- **Contributor loop** (Tracks 1-2): time spent in git hooks, lint,
  type-checking, bundling, and unit tests.
- **Plugin runtime** (Tracks 3-5): what users feel, above all during
  **Refresh all**, which currently makes the plugin unusable until it finishes
  on a mid-range desktop.

Only Track 1 is scheduled now; it ships before 2.7.0. Tracks 2-5 wait until
after 2.7.0. **Create each deferred track's GitHub issue only when it is ready
for implementation**, then link it in the track table below.

## Tracks

| # | Track | Status | Issue | Target |
| --- | --- | --- | --- | --- |
| 1 | Contributor dev-loop speed | in progress | [GH Issue #371](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/371) | 2.7.0 (Required) |
| 2 | Shared-worker unit-test mode | deferred | create when ready | after 2.7.0 |
| 3 | Plugin runtime benchmark harness | deferred | create when ready | after 2.7.0 |
| 4 | Refresh-all responsiveness | deferred | create when ready | after 2.7.0; needs Track 3 |
| 5 | Startup and bundle cost | deferred | create when ready | after 2.7.0; needs Track 3 |

## Measurement rules (all tracks)

The spike behind this plan showed how easily timings go wrong on a shared
workstation: other agent sessions ran Vitest and ESLint in the main checkout at
the same time, adding up to 17 competing Node processes, which doubled some run
times and produced timeouts that looked like test failures.

- Record machine, OS, Node version, commit, and run date with every result.
- Run on a quiet machine: no other test, lint, or build processes. Benchmark
  scripts count competing Node tool processes before and after each run and
  flag contaminated runs instead of silently averaging them.
- Report the **median of at least three warm runs**, plus the first (cold) run
  separately. A cache-backed step reports cold and warm separately.
- Measure "before" on the base commit and "after" on the branch head, on the
  same machine, in the same session.
- Keep raw results as JSON beside the human-readable table so a later run can
  be compared exactly.

## Track 1: Contributor dev-loop speed

**Type:** maintenance (build tooling, no plugin behavior change).
**Risk:** medium. It changes every contributor's commit and push path and the
Vitest configuration CI uses, but no shipped code.
**Surfaces:** dependencies, manifest, or release (build output only); no
runtime surfaces.

### Baseline observed in the spike

Measured on `f26d3cc` (Ryzen 7 1700, 16 threads, 16 GB, Windows 11,
Node 24.12). Indicative only: `dev` has since gained stricter lint rules
(#361), so the official "before" must be re-measured on the Track 1 base
commit.

| Stage | Cold | Warm |
| --- | --- | --- |
| Seven `check:*` scripts | 3.2s | 2.2s |
| `eslint .` | 102.8s | 53.0s |
| `tsc --noEmit` | 9.7s | 9.6s |
| esbuild production bundle | 1.1s | 0.8s |
| `vitest run` (227 files, 2289 tests) | 158s | 126s |

- **Commit** (pre-commit hook: compliance, full lint, full suite): about
  3-4.5 minutes.
- **Push** (pre-push hook: `npm run build`, which repeats compliance and lint,
  then type-checks and bundles): about 1-2 minutes, with no tests.
- Vitest spent **1,697s of cumulative jsdom environment setup** against 82s of
  test execution; per-file environment creation dominates.
- ESLint is dominated by type-aware rules (`no-misused-promises` and
  `no-floating-promises` alone are about 40% of rule time) and by building two
  TypeScript programs. `--concurrency` and `projectService` gave no meaningful
  gain.

### Scope

1. **Pre-commit checks only what is staged.** Keep `check:compliance`; lint only
   the staged files with the ESLint cache; run only the unit tests related to
   the staged files (`vitest related`). Changes to runner configuration, the
   Obsidian stub, shared test setup, dependencies, or on-disk fixtures run the
   whole suite instead.
2. **Pre-push runs the complete gate:** `npm run build` followed by the full
   unit suite. CI already runs the full suite with coverage on every push and
   pull request, so no check is lost.
3. **Vitest uses the `threads` pool** with full per-file isolation unchanged.
4. **`tsc` in `npm run build` is incremental**, with its build-info file under
   `node_modules/.cache/`.
5. **A committed benchmark script** measures every stage above plus the hook
   scenarios below, following the measurement rules, and prints the
   before/after table.
6. **Contributor documentation** describes the new hook behavior: `CONTRIBUTING.md`,
   the testing guide, `AGENTS.md` validation guidance, and the
   `work-on-rss-dashboard-change` skill's validation ladder.

### Out of scope

- Reusing one module graph or jsdom across files (Track 2).
- Changing lint rules, rule severity, or the lint gate in `npm run build` or CI.
- Caching lint in `npm run build`: the ESLint cache cannot see type changes in
  other files, so the authoritative full lint stays uncached.

### Acceptance criteria

- A commit that stages only prose runs compliance and skips lint and tests.
- A commit that stages source or test files lints exactly those files and runs
  the tests related to them; a lint error or failing related test blocks the
  commit.
- A commit that stages a whole-suite trigger runs the full unit suite.
- `SKIP_GIT_HOOKS=1` still bypasses both hooks.
- A push runs `npm run build` and the full unit suite, and fails if either fails.
- The full suite passes under the `threads` pool locally and in CI, with the
  same test count as the base commit.
- `npm run build` passes, and a second run type-checks incrementally.
- The pull request reports before and after times for a code commit, a
  prose-only commit, and a push.
- Contributor docs and the skill match the new hooks.

### Measured results

Single runs on a quiet machine (Ryzen 7 1700, 16 GB, Windows 11, Node 24.12),
base `dev` at `9f09a92` against this track's head. The full multi-run
benchmark was waived in favor of these rough numbers; the script remains for
later tracks.

| Path | Before | After |
| --- | --- | --- |
| Commit, one source file (`src/views/reader-view.ts`) | 221s | ~45s (128s on the first run after a cache clear) |
| Commit, prose only | 221s | 10s |
| Push | 77s (no tests) | 182s (includes the full suite) |
| One commit and push | ~5 min | ~3.75 min |
| Three commits and push | ~12 min | ~5 min |

Keeping the full suite in pre-push was a deliberate choice: failures surface
before code leaves the machine, at the cost of a slower push.

### Validation

- Unit tests for the staged-file planner.
- `npm run build`, full `npm run test:unit`, and `npm run test:unit -- --coverage`.
- Manual hook scenarios: a prose-only commit, a source-file commit, a
  whole-suite-trigger commit, a push, `SKIP_GIT_HOOKS=1`, and `npm install`
  reinstalling the hooks path.

### Deliverable

The measured results above, in the pull request description, for the dev
team.

## Track 2: Shared-worker unit-test mode (deferred)

Running files that do not replace modules in a shared project
(`isolate: false`, one module graph and jsdom per worker) cut the suite from
about 143s to about 40s in the spike. It is not safe yet: across shuffled file
orders it produced 0-4 failures per run, from state that leaks between files
on one worker:

- Direct overrides of `window` and `navigator` properties (`innerWidth`,
  `matchMedia`, `ResizeObserver`, `requestAnimationFrame`, `navigator.share`).
- Fake timers never restored (`feed-refresh-scheduler.test.ts`) and spies never
  restored in about ten files.
- Background work, such as full-article fetches, started by one file and still
  running during the next (`article-saver.test.ts` saw 5-11 calls instead of 2).
- Recurring victims whose leak source was not identified:
  `feed-manager-modal-wrapper.test.ts` and
  `dashboard-header-title-batching.test.ts`.

A setup-level helper that snapshots and restores `window` and `navigator` and
cancels pending timers per file roughly halved the failures but did not remove
them. Entry criteria for implementation: identify and fix each leak source,
then require at least ten consecutive clean runs with shuffled file order on a
quiet machine before enabling the shared project.

## Track 3: Plugin runtime benchmark harness (deferred)

Build a repeatable end-to-end measurement of the plugin in a real Obsidian
instance.

- **Vault:** `C:\Obsidian\test`, a dedicated vault with the plugin installed
  and no feeds; never the main vault.
- **Driver:** launch Obsidian with `--remote-debugging-port` and drive it over
  the Chrome DevTools Protocol from a Node script. Collect Performance traces,
  CPU profiles, heap statistics, and `performance.mark` timings the plugin
  emits behind a development-only flag.
- **Feeds:** the 208 predefined Discover feeds, served either live or from a
  local fixture server that replays captured responses, so the network does
  not decide the result.
- **Journey:** open the dashboard, add all Discover feeds, **Refresh all**,
  wait for completion, open the first article, save it, and reload the plugin.
- **Metrics:** plugin load time; refresh-all wall time; main-thread long tasks
  during refresh (count, total blocked time, longest); input responsiveness
  during refresh (event-loop lag and time to handle a click); peak heap;
  number and size of storage writes; time to first article and to a completed
  save.
- **Lab counterparts:** deterministic Vitest benchmarks for parsing, merging,
  and filtering large fixture sets, and DOM-mutation counts for article-list
  rendering, so regressions surface in CI without Obsidian.

## Track 4: Refresh-all responsiveness (deferred)

Use the Track 3 baseline to find and remove what blocks the main thread during
Refresh all. Hypotheses to test, not conclusions:

- Unchanged feeds are downloaded and parsed in full each time. No
  `If-None-Match` or `If-Modified-Since` handling was found in `src/`, so
  conditional requests may save most of the work.
- Parsing, merging, and rendering run in long synchronous stretches rather than
  yielding between feeds.
- The article list re-renders fully during refresh and has no virtualization.
- Storage writes are not coalesced across feeds.
- The `ConcurrencySemaphore` limits may not suit 200+ feeds, and there is no
  per-host limit.

## Track 5: Startup and bundle cost (deferred)

The minified `main.js` is about 1.05 MB. Measure plugin load and
first-dashboard-render time, analyze the bundle with an esbuild metafile, and
defer work that is not needed until after layout is ready.

## Reporting

Each track's pull request carries its before/after table. When all scheduled
tracks for a release are done, their results are combined into one report for
the dev team.
