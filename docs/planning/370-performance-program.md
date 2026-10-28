---
created: 2026-09-24
issues:
  - https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/370
  - https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/371
  - https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/749
  - https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1519
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

| #   | Track                            | Status      | Issue                                                                                           | Target                     |
| --- | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | Contributor dev-loop speed       | in progress | [GH Issue #371](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/371)             | 2.7.0 (Required)           |
| 2   | Shared-worker unit-test mode     | deferred    | create when ready                                                                               | after 2.7.0                |
| 3   | Plugin runtime benchmark harness | deferred    | create when ready                                                                               | after 2.7.0                |
| 4   | Refresh-all responsiveness       | deferred    | create when ready                                                                               | after 2.7.0; needs Track 3 |
| 5   | Startup and bundle cost          | in progress | [GH Issue #1519](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1519) (slice 1) | 2.8.0                      |

Track 1's follow-up to move full validation from local pre-push to CI is
tracked by [GH Issue #749](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/749).

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

| Stage                                | Cold   | Warm  |
| ------------------------------------ | ------ | ----- |
| Seven `check:*` scripts              | 3.2s   | 2.2s  |
| `eslint .`                           | 102.8s | 53.0s |
| `tsc --noEmit`                       | 9.7s   | 9.6s  |
| esbuild production bundle            | 1.1s   | 0.8s  |
| `vitest run` (227 files, 2289 tests) | 158s   | 126s  |

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
2. **Pre-push skips full local checks.** GitHub Actions runs `npm run build`
   and the full unit suite with coverage on pull requests and pushes to `dev`
   or `master`. This follow-up supersedes the original choice to make every
   contributor wait for the full gate before pushing; local full checks remain
   available when diagnosing CI failures.
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
- A push completes without running the full local build or unit suite.
- GitHub Actions runs `npm run build` and the full unit suite with coverage for
  pull requests and pushes to `dev` or `master`.
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

| Path                                                 | Before         | After                                            |
| ---------------------------------------------------- | -------------- | ------------------------------------------------ |
| Commit, one source file (`src/views/reader-view.ts`) | 221s           | ~45s (128s on the first run after a cache clear) |
| Commit, prose only                                   | 221s           | 10s                                              |
| Push                                                 | 77s (no tests) | 182s (includes the full suite)                   |
| One commit and push                                  | ~5 min         | ~3.75 min                                        |
| Three commits and push                               | ~12 min        | ~5 min                                           |

These measurements describe the original implementation. Its full pre-push
gate intentionally surfaced failures before code left the machine, at the
cost of a slower push. The follow-up decision prioritizes a fast local push
and relies on required pull-request CI for the complete gate.

### Follow-up local push-hook measurement (2026-10-04)

Measured direct hook invocations on the same Ryzen 7 1700, 16-thread,
16 GB Windows 11 machine with Node 24.12.0:

| Hook                                     | Warm samples           | Median |
| ---------------------------------------- | ---------------------- | ------ |
| Informational pre-push after this change | 83.1ms, 79.7ms, 78.4ms | 79.7ms |

The earlier 182-second pre-push result above came from a separate benchmark
session, so it is historical context rather than a controlled before/after
comparison. GitHub Actions has not yet run this follow-up's remote gate.

### Validation

- Unit tests for the staged-file planner.
- `npm run build`, full `npm run test:unit`, and `npm run test:unit -- --coverage`.
- Manual hook scenarios: a prose-only commit, a source-file commit, a
  whole-suite-trigger commit, a fast local push, `SKIP_GIT_HOOKS=1`, and
  `npm install` reinstalling the hooks path. Confirm GitHub Actions runs the
  full build and coverage suite on a pull request.

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

## Track 5: Startup and bundle cost (in progress)

The minified `main.js` is about 1.05 MB. Measure plugin load and
first-dashboard-render time, analyze the bundle with an esbuild metafile, and
defer work that is not needed until after layout is ready.

### Baseline before slice 1 (#1519)

Measured 2026-10-22 on base commit `cd7d183d` (dev), in a vault holding only the 205 Discover feeds (36.6 MB of live shards), with `scripts/benchmark-plugin-load.mjs` (procedure: [Plugin Load Benchmark](../development/plugin-load-benchmark.md)). AMD Ryzen 7 1700 Eight-Core Processor (16 threads, 17 GB), Windows 11 build 26200, Obsidian 1.14.4, plugin 2.7.1, Node 24.12.0. DevTools and the profiler were attached, so compare ratios, not absolute times. "Cold" is a fresh Obsidian process with a warm OS file cache, not a reboot. Another Obsidian instance on its own profile was open and idle. Each run is one cold launch and five warm reloads; no warm run overlapped other lint or test processes.

| Measure                                  | Run 1 | Run 2 |
| ---------------------------------------- | ----- | ----- |
| Warm `onload`, median of 5, ms           | 3226  | 3197  |
| Shard reads per plugin start (205 feeds) | 410   | 410   |
| Shard writes per plugin start            | 0     | 0     |
| Cold launch: plugin CPU, ms              | 5018  | 4955  |
| Cold launch: workspace ready, page ms    | 5786  | 5764  |

Reading each feed once would be 205 reads; the load reads every shard twice. Its startup save re-opens each unchanged shard, and the save has nothing to write. Slice 1 removes that pass.

<details>
<summary>Raw results (before, runs 1 and 2)</summary>

```json
{
  "label": "before",
  "date": "2026-10-22T21:13:15.373Z",
  "commit": "cd7d183d",
  "dirty": true,
  "obsidian": "1.14.4",
  "plugin": "2.7.1",
  "vaultName": "Obsidian_Main",
  "ambientToolProcesses": 1,
  "machine": {
    "cpu": "AMD Ryzen 7 1700 Eight-Core Processor",
    "threads": 16,
    "memoryGb": 17,
    "os": "Windows_NT 10.0.26200",
    "node": "24.12.0"
  },
  "cold": {
    "attachedAfterLaunchMs": 304,
    "layoutReadyMs": 5786,
    "pluginPresentMs": 1062,
    "foreignProcesses": 0,
    "profile": {
      "spanMs": 8074,
      "pluginCpuMs": 5018,
      "idleMs": 848,
      "otherCpuMs": 2208,
      "topPluginFrames": [
        {
          "name": "X",
          "ms": 1918
        },
        {
          "name": "Za",
          "ms": 1561
        },
        {
          "name": "gg",
          "ms": 1469
        },
        {
          "name": "capturePersistedState",
          "ms": 1467
        },
        {
          "name": "eE",
          "ms": 1324
        },
        {
          "name": "tE",
          "ms": 1322
        },
        {
          "name": "yn",
          "ms": 1191
        },
        {
          "name": "ni",
          "ms": 1040
        },
        {
          "name": "JT",
          "ms": 947
        },
        {
          "name": "createPersistedSettings",
          "ms": 761
        }
      ]
    },
    "profileFile": "before-1.json.cold.cpuprofile"
  },
  "warm": {
    "runs": [
      {
        "onloadMs": 3226,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 2,
            "rss-dashboard-user-preferences.json.backup": 2,
            "workspace.json": 2
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 3117,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "workspace.json": 2,
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 3156,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "workspace.json": 2,
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 3338,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "workspace.json": 2,
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 3309,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "workspace.json": 2,
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      }
    ]
  }
}
```

```json
{
  "label": "before",
  "date": "2026-10-22T21:14:37.726Z",
  "commit": "cd7d183d",
  "dirty": true,
  "obsidian": "1.14.4",
  "plugin": "2.7.1",
  "vaultName": "Obsidian_Main",
  "ambientToolProcesses": 1,
  "machine": {
    "cpu": "AMD Ryzen 7 1700 Eight-Core Processor",
    "threads": 16,
    "memoryGb": 17,
    "os": "Windows_NT 10.0.26200",
    "node": "24.12.0"
  },
  "cold": {
    "attachedAfterLaunchMs": 308,
    "layoutReadyMs": 5764,
    "pluginPresentMs": 1129,
    "foreignProcesses": 0,
    "profile": {
      "spanMs": 8048,
      "pluginCpuMs": 4955,
      "idleMs": 797,
      "otherCpuMs": 2296,
      "topPluginFrames": [
        {
          "name": "X",
          "ms": 1900
        },
        {
          "name": "Za",
          "ms": 1534
        },
        {
          "name": "gg",
          "ms": 1430
        },
        {
          "name": "capturePersistedState",
          "ms": 1428
        },
        {
          "name": "eE",
          "ms": 1308
        },
        {
          "name": "tE",
          "ms": 1305
        },
        {
          "name": "yn",
          "ms": 1167
        },
        {
          "name": "ni",
          "ms": 1067
        },
        {
          "name": "JT",
          "ms": 962
        },
        {
          "name": "createPersistedSettings",
          "ms": 760
        }
      ]
    },
    "profileFile": "before-2.json.cold.cpuprofile"
  },
  "warm": {
    "runs": [
      {
        "onloadMs": 3143,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 2,
            "rss-dashboard-user-preferences.json.backup": 2,
            "workspace.json": 2
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 3253,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "workspace.json": 2,
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 3167,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "workspace.json": 2,
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 3327,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "workspace.json": 2,
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 3197,
        "shardReads": 410,
        "writes": {
          "shards": 0,
          "other": {
            "workspace.json": 2,
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      }
    ]
  }
}
```

</details>

### Result after slice 1 (#1519)

Measured 2026-10-22 on `9f3abeb4` (the fix), on the same machine, vault, build procedure and session as the baseline above. Both after-runs were on a clean tree, and no run overlapped other lint or test processes. Each run is one cold launch and five warm reloads. Run 1 compares with the baseline's run 1, run 2 with run 2.

| Measure (run 1)                          | Before | After | Change |
| ---------------------------------------- | ------ | ----- | ------ |
| Warm `onload`, median of 5, ms           | 3226   | 1771  | -45%   |
| Shard reads per plugin start (205 feeds) | 410    | 205   | -50%   |
| Cold launch: plugin CPU, ms              | 5018   | 3414  | -32%   |
| Cold launch: workspace ready, page ms    | 5786   | 4263  | -26%   |

| Measure (run 2)                          | Before | After | Change |
| ---------------------------------------- | ------ | ----- | ------ |
| Warm `onload`, median of 5, ms           | 3197   | 1489  | -53%   |
| Shard reads per plugin start (205 feeds) | 410    | 205   | -50%   |
| Cold launch: plugin CPU, ms              | 4955   | 3436  | -31%   |
| Cold launch: workspace ready, page ms    | 5764   | 4135  | -28%   |

Shard writes stay at 0 per start, `data.json` is not rewritten, and the two backup files are still written once per start. The program target (A <= 1 s, DEC-001) is not met: warm `onload` is about 1.5-1.8 s. What is left in the cold profile is the change-detection bookkeeping and the first render, in inclusive plugin time: `capturePersistedState` about 1.4 s, `recordRead` about 0.7 s, the first dashboard render about 0.5 s. That bookkeeping is the target of slice 2, before any deferred hydration is considered.

<details>
<summary>Raw results (after, runs 1 and 2)</summary>

```json
{
  "label": "after",
  "date": "2026-10-22T21:40:19.927Z",
  "commit": "9f3abeb4",
  "dirty": false,
  "obsidian": "1.14.4",
  "plugin": "2.7.1",
  "vaultName": "Obsidian_Main",
  "ambientToolProcesses": 1,
  "machine": {
    "cpu": "AMD Ryzen 7 1700 Eight-Core Processor",
    "threads": 16,
    "memoryGb": 17,
    "os": "Windows_NT 10.0.26200",
    "node": "24.12.0"
  },
  "cold": {
    "attachedAfterLaunchMs": 339,
    "layoutReadyMs": 4263,
    "pluginPresentMs": 1128,
    "foreignProcesses": 0,
    "profile": {
      "spanMs": 6536,
      "pluginCpuMs": 3414,
      "idleMs": 1126,
      "otherCpuMs": 1996,
      "topPluginFrames": [
        {
          "name": "gg",
          "ms": 1359
        },
        {
          "name": "capturePersistedState",
          "ms": 1357
        },
        {
          "name": "ni",
          "ms": 1004
        },
        {
          "name": "X",
          "ms": 941
        },
        {
          "name": "JT",
          "ms": 914
        },
        {
          "name": "Xa",
          "ms": 864
        },
        {
          "name": "nt",
          "ms": 700
        },
        {
          "name": "recordRead",
          "ms": 673
        },
        {
          "name": "render",
          "ms": 563
        },
        {
          "name": "createPersistedSettings",
          "ms": 489
        }
      ]
    },
    "profileFile": "after-1.json.cold.cpuprofile"
  },
  "warm": {
    "runs": [
      {
        "onloadMs": 1754,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "workspace.json": 2,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 1780,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "workspace.json": 2,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 1759,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "workspace.json": 2,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 1771,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "workspace.json": 2,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 1807,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "workspace.json": 2,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      }
    ]
  }
}
```

```json
{
  "label": "after",
  "date": "2026-10-22T21:41:30.628Z",
  "commit": "9f3abeb4",
  "dirty": false,
  "obsidian": "1.14.4",
  "plugin": "2.7.1",
  "vaultName": "Obsidian_Main",
  "ambientToolProcesses": 1,
  "machine": {
    "cpu": "AMD Ryzen 7 1700 Eight-Core Processor",
    "threads": 16,
    "memoryGb": 17,
    "os": "Windows_NT 10.0.26200",
    "node": "24.12.0"
  },
  "cold": {
    "attachedAfterLaunchMs": 343,
    "layoutReadyMs": 4135,
    "pluginPresentMs": 1212,
    "foreignProcesses": 0,
    "profile": {
      "spanMs": 6413,
      "pluginCpuMs": 3436,
      "idleMs": 782,
      "otherCpuMs": 2196,
      "topPluginFrames": [
        {
          "name": "gg",
          "ms": 1431
        },
        {
          "name": "capturePersistedState",
          "ms": 1429
        },
        {
          "name": "ni",
          "ms": 1038
        },
        {
          "name": "X",
          "ms": 995
        },
        {
          "name": "JT",
          "ms": 962
        },
        {
          "name": "Xa",
          "ms": 913
        },
        {
          "name": "nt",
          "ms": 723
        },
        {
          "name": "recordRead",
          "ms": 711
        },
        {
          "name": "render",
          "ms": 539
        },
        {
          "name": "createPersistedSettings",
          "ms": 512
        }
      ]
    },
    "profileFile": "after-2.json.cold.cpuprofile"
  },
  "warm": {
    "runs": [
      {
        "onloadMs": 1669,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "workspace.json": 2,
            "rss-dashboard-user-preferences.json.backup": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 1479,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1,
            "workspace.json": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 1447,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1,
            "workspace.json": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 1489,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1,
            "workspace.json": 1
          }
        },
        "foreignProcesses": 0
      },
      {
        "onloadMs": 1558,
        "shardReads": 205,
        "writes": {
          "shards": 0,
          "other": {
            "feeds.opml.backup": 1,
            "rss-dashboard-user-preferences.json.backup": 1,
            "workspace.json": 1
          }
        },
        "foreignProcesses": 0
      }
    ]
  }
}
```

</details>

## Reporting

Each track's pull request carries its before/after table. When all scheduled
tracks for a release are done, their results are combined into one report for
the dev team.
