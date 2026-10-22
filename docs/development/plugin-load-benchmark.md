# Plugin Load Benchmark

How to measure how long the plugin takes to load in a real Obsidian, and how
to compare two builds. It is the measurement behind Track 5 of the
[performance program](../planning/370-performance-program.md) and the
before/after numbers in startup-cost pull requests (#1519).

`scripts/benchmark-plugin-load.mjs` drives a real Obsidian over the Chrome
DevTools Protocol, as [`scripts/obsidian-cdp.mjs`](./fixture-vault.md#driving-the-vault-over-cdp)
does. Mocks cannot show this cost: the time goes to reading and checking real
files, so the unit tests count reads and writes and this script times them.

## What it records

| Measure                            | How                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Warm `onload`, median of N reloads | The plugin is disabled and enabled in the open vault; `enablePlugin` returns when `onload` has finished.                    |
| Shard reads and writes per start   | The vault adapter's `read` and `write` are counted for the reload and for 7 s after it, so a save queued by the load shows. |
| Cold launch plugin CPU             | A CPU profile starts as the vault window appears. The sample time under the plugin's own `plugin:<id>` frames is totalled.  |
| Cold launch workspace-ready time   | Page milliseconds until `app.workspace.layoutReady`.                                                                        |
| Machine, versions, commit, date    | CPU, threads, memory, OS, Obsidian version, plugin version, `git` commit and whether the tree was dirty.                    |

"Cold" means a fresh Obsidian process. Windows keeps recently read files in
memory, so the first launch after a reboot reads from disk and a later one
does not; the script does not flush that cache. State which it was when you
report a number, and report the cold run apart from the warm median, as the
[measurement rules](../planning/370-performance-program.md#measurement-rules-all-tracks)
require.

## Before you run it

- Use a vault with many feeds whose reading history you do not mind touching,
  such as one holding only the Discover feeds. The run reloads the plugin, and
  the load writes the plugin's backup files. A personal vault is the wrong
  place; the [fixture vault](./fixture-vault.md) is too small to show the cost.
- Close Obsidian. The script launches it, and a second launch hands over to the
  running instance and drops the debug port. It also refuses a port that is
  already in use, and any vault other than `--vault`.
- Keep the machine quiet. Lint, type-check and test processes inflate the
  numbers; the script counts them before and after each run and marks a run
  that overlapped them as contaminated. Contaminated runs stay in the JSON but
  are left out of the median whenever a clean run exists.
- Node 22 or newer (a global `WebSocket`).

## Procedure

Build and install the base commit, then the change, restarting Obsidian between
them. Each `run` launches Obsidian and leaves it running, so close it before the
next one.

```bash
npm run build
cp main.js manifest.json styles.css <vault>/.obsidian/plugins/rss-dashboard/

node scripts/benchmark-plugin-load.mjs run \
  --exe "<path to the Obsidian executable>" \
  --vault "<path to the vault>" \
  --label before --out before.json
```

Close Obsidian, switch to the change, rebuild, copy the files again, and run it
with `--label after --out after.json`. Then:

```bash
node scripts/benchmark-plugin-load.mjs compare before.json after.json
```

`compare` prints a Markdown table for the pull request. Keep the JSON files and
the `.cold.cpuprofile` beside each one; load a profile in the Performance panel
of Chrome DevTools to see which functions the time went to.

Options: `--port` (default 9444), `--warm-runs` (default 4, report at least
three), `--plugin-id` (default `rss-dashboard`).

## Reading the result

- **Shard reads per start** should equal the number of feeds. Twice that means
  something reads every shard a second time.
- **Shard writes per start** should be 0 for a vault with nothing to repair.
- Named frames in `cold.profile.topPluginFrames` are class methods; the bundle
  is minified, so local functions appear as short letters. Match a letter to
  source with a development build or a source map.
- Compare absolute times only on the same machine in the same session.
  DevTools and the profiler add overhead, so the ratios carry the finding.
