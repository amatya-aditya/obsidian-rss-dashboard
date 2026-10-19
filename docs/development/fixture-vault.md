# Fixture Vault

The fixture vault is the one shared starting point for manual testing. Every
maintainer opens the same seeded feeds, articles, tags, and settings, so a bug
found in it can be reproduced by anyone from a clean reset.

**Manual testing happens only in the fixture vault, never in a personal
vault.** A personal vault holds real reading history and notes that a bug or a
storage migration can damage, and its state can't be shared or reset.

## Layout

| Path                                 | What it is                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `test_files/fixture-vault/`          | The pristine template, tracked in git. Testing never changes it.                                                   |
| `.fixture-vault/`                    | The working copy you open in Obsidian. Gitignored and disposable.                                                  |
| `scripts/setup-fixture-vault.mjs`    | Creates or resets a working copy and installs the current build (`npm run fixture:vault`).                         |
| `scripts/generate-fixture-vault.mjs` | Regenerates the template's seeded plugin data (`npm run fixture:vault:generate`).                                  |
| `test_files/fixture-pages/`          | Committed HTML pages and images the fixture server serves to seeded articles.                                      |
| `scripts/fixture-server.mjs`         | Serves `test_files/fixture-pages/` over HTTP (`npm run fixture:serve`).                                            |
| `scripts/obsidian-cdp.mjs`           | Drives the running app over the DevTools Protocol (see [Driving the vault over CDP](#driving-the-vault-over-cdp)). |

Inside the template:

| Path                                        | Contents                                                             |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `.obsidian/community-plugins.json`          | Enables `rss-dashboard`. The build is copied in by the setup script. |
| `.obsidian/plugins/rss-dashboard/data.json` | The plugin's bootstrap pointer to the vault metadata folder.         |
| `rss-dashboard-data/data.json`              | Plugin settings, feed list, folders, and tags.                       |
| `rss-dashboard-data/feeds/<feedId>.json`    | One Shard storage v2 article shard per feed.                         |
| `rss-dashboard-data/user-state.json`        | Read, starred, saved, tag, and playback state, keyed `feedId:guid`.  |
| `import-fixtures/`                          | One file for each import dialog.                                     |
| `saved-articles/`                           | The note behind the seeded saved article.                            |
| `welcome.md`, `notes/`                      | Ordinary notes, so the vault looks like a real one.                  |

The data uses **Shard storage v2**, the current default, with the storage and
metadata folders visible (`rss-dashboard-data/`, not a dot-folder) so you can
inspect the files in a file manager or editor. The settings file stores only
values that differ from the plugin's defaults; the plugin fills in the rest and
writes a complete file on its first save.

## Set up, reset, and open

Build the plugin first, so there is a `main.js`, `manifest.json`, and
`styles.css` in the repository root:

```sh
npm run build        # or leave `npm run dev` running
npm run fixture:vault
```

The script prints the folder to open. In Obsidian, choose **Open another
vault** → **Open folder as vault** and pick that folder (by default
`.fixture-vault/` in the repository root). On first open, Obsidian asks
whether to trust the vault's plugins: choose **Trust author and enable
plugins**.

Run `npm run fixture:vault` again at any time to reset the working copy to the
template. Close the vault in Obsidian first: Obsidian keeps files open, and it
would write its workspace back into the new copy.

Options, passed after `--`:

| Command                                          | Effect                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `npm run fixture:vault -- <folder>`              | Create or reset the vault in another folder.                             |
| `npm run fixture:vault -- --plugin-only`         | Copy a new build into the existing vault without resetting its data.     |
| `npm run fixture:vault -- --storage legacy-json` | Seed the same content in deprecated Legacy JSON storage.                 |
| `npm run fixture:vault -- --storage shard-v1`    | Seed the same content in deprecated Shard storage v1.                    |
| `npm run fixture:vault -- --show-whats-new`      | Leave the last shown version unset, so What's New opens on first launch. |
| `npm run fixture:vault -- --help`                | Print the usage.                                                         |

The script replaces a folder only when it is empty or carries the
`.rss-dashboard-fixture-vault.json` marker it writes, and it refuses folders
that contain the repository or overlap the template. By default it records the
installed release as the last shown version, so What's New does not open over
the dashboard after every reset.

### Load a new build

1. Rebuild: `npm run build`, or let `npm run dev` rebuild on save.
2. Run `npm run fixture:vault -- --plugin-only` to copy it in, or a plain
   `npm run fixture:vault` to also reset the data.
3. In Obsidian, turn **RSS Dashboard** off and on again under **Settings** →
   **Community plugins**, or run **Reload app without saving** from the
   command palette.

### Migration testing

`--storage legacy-json` puts every feed, article, and article state into the
plugin's own `data.json`. `--storage shard-v1` keeps settings in the plugin's
`data.json` and article state inside each shard under
`rss-dashboard-data/feeds/`. Both hold the same content as the default, so
after running the storage migration the dashboard should look exactly as it
does in a Shard storage v2 vault.

## Fixture pages and the fixture server

One seeded article, **GitHub Blog: "Article with no feed description"**, ships
an empty description, content, and summary, and its link points at a page served
from this repository instead of `example.com`. The Reader fetches that page when
you open the article and stores the page's description, which is the case where
a card preview falls back to the reader-fetched description (#959, #975).

The tracking-counter scenarios (#1169) point at images served the same way.
Their counters must genuinely load for the defect to be reproducible: a 404
takes the card's error path and hides it. Run the server to check that the
defect still reproduces on a build without the fix. With the fix, no counter is
requested, so the expected view is the same either way.

The **duplicate-lead-photo-credit page** (`credit-caption-page.html`) backs the
#1305 scenario: a caption-only `<figure>` whose credit is repeated as a
paragraph above the body, a differing credit paragraph, a body paragraph, and a
matching paragraph after the body. The seeded article sets a hero from the same
server (`credit-caption-hero.png`), so the caption's figure is lead media.

Fetched content is wrapped in a single root element (Readability's
`#readability-page-1`), which the readers hoist before the body-child cleanup
scans run (#1304). That hoist is what makes the lead-media scan act on this
page: with the hero set, the caption's `<figure>` goes as lead media and the
matching `Photo credit: Jane Doe` paragraph goes with it, while
`Photo credit: John Roe` and the repeat after the body stay. Before #1304 the
figure was never treated as lead media, so the page rendered the same on both
sides of #1305; the pairing is also pinned at the caller level by
`test_files/unit/views/reader-view-html-cleanup.characterization.test.ts` and
`test_files/unit/components/article-renderer-html-cleanup.characterization.test.ts`.

The **feed-advertising page** (`feed-advertising-page.html`) is not a feed but
announces one, and names WordPress so the Save path reaches the same feed
through the plugin's WordPress fallback. No seeded article links it: it is the
page address to type into **Add feed** (or **Edit feed**) when checking that
**Load** resolves a page to the feed **Save** would add (#1201). With **Enable
CORS proxy** off, load
`http://127.0.0.1:8787/feed-advertising-page.html`: **Title** and **Latest
entry** fill from the synthesized feed, and the URL field rewrites to
`http://127.0.0.1:8787/user-agent-feed.xml`.

Serve the files in a second terminal before opening the article, and when
checking that a counter really loads:

```sh
npm run fixture:serve
```

The server is dependency-free. It serves the `.html` pages and the `.gif` and
`.png` images directly inside `test_files/fixture-pages/`, plus one synthesized
feed at `/user-agent-feed.xml`, on `127.0.0.1:8787` — the address the seeded
link, the counter images, and the seeded feed all use. Every request it answers
prints the identity headers that request carried, so you can confirm what the
fetch actually sent. If that port is already taken, free it, or change
`FIXTURE_SERVER_PORT` in `scripts/generate-fixture-vault.mjs`, regenerate the
template, and reset the vault. With the server stopped the article still opens;
the preview stays blank because the fetch fails, as it would for any unreachable
page, and the seeded User-Agent feed shows a fetch error.

### Checking the outbound User-Agent

The seeded **User-Agent echo (fixture)** feed points at the server's feed
address. Refresh it with the server running and read the terminal:

```text
GET /user-agent-feed.xml -> 200 (fixture feed)
  user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.14.4 Chrome/150.0.7871.250 Electron/43.7.7 Safari/537.36
  sec-ch-ua: (not sent)
  sec-ch-ua-mobile: (not sent)
  sec-ch-ua-platform: (not sent)
```

A header the request omitted reads `(not sent)` rather than sitting blank,
because telling those apart is the point: most tooling shows an absent header and
an empty one the same way. A user agent that claims `Chrome/…` while all three
`sec-ch-ua` headers read `(not sent)` is exactly the mismatch anti-bot filters
answer with 403 (#1109, #1162).

## Driving the vault over CDP

The developer console needs a human at the keyboard. For agent or headless
verification, drive the same running app over the Chrome DevTools Protocol with
`scripts/obsidian-cdp.mjs`, a dependency-free Node helper (Node 22 or newer).

Start Obsidian with a debug port, in its own disposable profile. Close the app
first — an instance that is already running without the flag cannot be attached
to. Several sessions can share a machine, and each opens its own app, so give
every session its own port and profile — otherwise a session can attach to
another session's window:

```powershell
$profile = "$env:TEMP\rss-dashboard-cdp-profile-$PID"
# Per-user install: "$env:LOCALAPPDATA\Obsidian\Obsidian.exe"
# All-users install: "C:\Program Files\Obsidian\Obsidian.exe"
& "$env:LOCALAPPDATA\Obsidian\Obsidian.exe" `
  --remote-debugging-port=9333 `
  --user-data-dir=$profile
```

Then open the fixture vault in that instance (**Open another vault** → **Open
folder as vault** → `.fixture-vault/`) and trust it. The harness probes ports
9222, 9333, and 9334, so any of them works; pin one with `--port` or `CDP_PORT`
when several apps are open.

A fresh `--user-data-dir` opens Obsidian's **vault picker**
(`app://obsidian.md/starter.html`), which has no vault loaded and whose **Open
folder as vault** is a native dialog you cannot drive over CDP. The picker does
expose Electron, so open a vault directly with the same IPC its buttons call:

```js
window.electron.ipcRenderer.sendSync("vault-list"); // the known vault paths
window.electron.ipcRenderer.sendSync(
  "vault-open",
  "<absolute vault path>",
  false,
); // true on success, else an error string
```

`--user-data-dir` is Chromium-only. Obsidian still reads its vault registry
from `%APPDATA%\obsidian\obsidian.json`, so overriding the child's `APPDATA`
does not redirect it; open the vault with the IPC call above rather than
pre-seeding the registry.

### Prepare the window

Opening the vault leaves three surfaces behind that cover or sit in front of the
dashboard, so close them once before you drive a checklist:

```sh
node scripts/obsidian-cdp.mjs --profile "$env:TEMP\rss-dashboard-cdp-profile" --expect-vault "$PWD\.fixture-vault" prepare-vault
```

It closes the **vault picker** (`starter.html`) that stays open after the IPC
`vault-open` call, closes the **Settings** window that enabling community
plugins opens (the same surface #1279 fixed for the Linux launch script), and
collapses the workspace **side panes** — the fixture template ships no
`.obsidian/workspace.json`, so Obsidian's default left pane (Files, Search,
Bookmarks) otherwise covers the dashboard.

It needs `--profile` and `--expect-vault`, so it can only touch this session's
windows. Pass `--keep-settings` when the checklist tests a settings feature, and
`--keep-left` when an item drives the file explorer.

Kill only your own instance. Match the process command line to your
`--user-data-dir` and stop that tree (`Get-NetTCPConnection -LocalPort <port>`
names the owning process); never blanket-kill Obsidian, or other sessions lose
their sandbox.

### Guard the session you attach to

By default the harness attaches to the first Obsidian target it finds, which on
a shared machine may belong to another session. Add an ownership expectation so
it refuses, with a non-zero exit, unless the attached window is the vault you
meant:

| Option                  | Effect                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `--expect-vault <path>` | Refuse unless `app.vault.adapter.getBasePath()` matches `<path>` (case-insensitive, separators normalised). |
| `--profile <dir>`       | Pin the port recorded in `<dir>\DevToolsActivePort`, and refuse any target that is not the expected vault.  |
| `--wait <ms>`           | Poll `/json/list` for up to `<ms>` until a ready vault target appears; without it, the harness fails fast.  |

A **ready** target is a real vault window (`app://obsidian.md/index.html` with a
readable `app.vault.adapter.getBasePath()`), not the picker. With `--profile`,
the profile's own recorded port is trusted: if its target is not the expected
vault, the harness fails loudly instead of falling back to another port. The
matching environment variables are `CDP_EXPECT_VAULT`, `CDP_PROFILE`, and
`CDP_WAIT`. Callers that pass none of these keep the previous behavior.

```sh
node scripts/obsidian-cdp.mjs --profile "$env:TEMP\rss-dashboard-cdp-profile" --expect-vault "$PWD\.fixture-vault" eval ./probe.js
```

After copying in a new build (`npm run fixture:vault -- --plugin-only`), reload
the app before you attach, as in [Load a new build](#load-a-new-build).

```sh
node scripts/obsidian-cdp.mjs targets                # list windows
node scripts/obsidian-cdp.mjs eval ./probe.js        # one expression, from a file
echo "document.title" | node scripts/obsidian-cdp.mjs eval -   # or stdin
node scripts/obsidian-cdp.mjs shot dashboard.png     # one screenshot
node scripts/obsidian-cdp.mjs repl ./steps.txt       # many steps, one connection
node scripts/obsidian-cdp.mjs --profile <dir> --expect-vault <vault> prepare-vault  # clean the window
```

The committed Obsidian console probes under `test_files/stubs/probes/` drive
this harness. `npm run stub:probes` re-runs the whole library (the version
guard first) so its output can be diffed against the records; see
[Re-running these probes (drift check)](../../test_files/stubs/obsidian-console-probes.md#re-running-these-probes-drift-check)
in that ledger for the setup, the diff rule, and the triggers.

A real Obsidian **mobile** app is driven the same way over an Android emulator:
forward the renderer's webview devtools socket with `adb forward` and pass
`--host`/`--port`. The full route — AVD, APK, `adb forward`, the throwaway
device vault, and the keep-awake step — lives with the probe library in
[Mobile (Android) setup over
adb](../../test_files/stubs/obsidian-console-probes.md#mobile-android-setup-over-adb).

`eval`'s expression runs in the app's renderer, where `app` is the Obsidian
API. It is evaluated in REPL mode, so a bare top-level `await` works and a
later step can redeclare a `const` or `let` from an earlier one — the harness
waits for the returned promise.

A `repl` script (alias `batch`) runs every step over one connection, so nothing
drifts between them. Each step starts with `@`: `@eval` (an inline expression,
or a multi-line body up to the next `@` line), `@shot <path>`, `@wait <ms>`,
`@target <text>` (switch to another window, such as the settings window, and
keep going), or the keyboard and accessibility-tree steps described
[below](#keyboard-and-accessibility-tree-steps). For example, open the dashboard, wait for it to finish rendering,
read the first card previews, and screenshot:

```text
@eval
app.commands.executeCommandById("rss-dashboard:open-dashboard")

@eval
const ready = () =>
  document.querySelector(
    '.workspace-leaf-content[data-type="rss-dashboard-view"][data-rss-ready]',
  );
for (let i = 0; i < 50 && !ready(); i += 1) {
  await new Promise((resolve) => window.setTimeout(resolve, 100));
}
Boolean(ready())

@eval
Array.from(document.querySelectorAll(".rss-dashboard-card-preview-region"))
  .map((element) => element.textContent.trim())
  .slice(0, 3)

@shot dashboard.png
```

### Keyboard and accessibility-tree steps

Three more steps check what a keyboard or screen-reader user meets, which DOM
reads and synthetic events can miss:

| Step                         | Effect                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@key <key> [count]`         | Presses a real key through the browser's input pipeline, `count` times. Examples: `Tab`, `Shift+Tab`, `Enter`, `Escape`, `Space`, `ArrowDown`, `Shift+F10`, `t`, `Shift+s`. |
| `@ax <selector>`             | Prints the accessibility node of the first matching element: role, name, `ignored`, and properties such as `level`, `checked` or `expanded`.                                |
| `@axquery <role> <selector>` | Prints the exposed nodes with that role inside the first matching element, with a count. Ignored nodes are left out.                                                        |

Use `@key` rather than `element.dispatchEvent(new KeyboardEvent(...))` for
focus behavior. A synthetic event does not move focus on Tab, does not activate
a button on Enter, and does not fire `contextmenu` on Shift+F10. `@key` does
all three, so it is how to check a focus trap, focus return, or a keyboard path
to a context menu. Enter and Space carry the typed character, which native
buttons need in order to activate.

Use `@ax` and `@axquery` to confirm roles and names. The DOM can mislead in
both directions: a `div` with `role="heading"` is a heading, and a `<footer>`
outside sectioning content becomes a `contentinfo` landmark.

```text
@axquery heading .workspace-leaf-content[data-type="rss-dashboard-view"] .rss-dashboard-article-card
@ax .workspace-leaf-content[data-type="rss-dashboard-view"] .rss-dashboard-feed

@eval document.querySelector('.workspace-leaf-content[data-type="rss-dashboard-view"] button[aria-label="Add folder"]').focus()
@key Enter
@wait 800
@key Tab 4
@eval document.querySelector(".modal-container").contains(document.activeElement)
@key Escape
```

Gotchas:

- Scope selectors with `.workspace-leaf-content[data-type="..."]`. The tab
  header carries the same `data-type`, so a bare `[data-type="..."]` can match
  it first.
- Set the window to desktop width before you test layout-dependent keys. A
  narrow window switches the dashboard to its compact layout, which hides the
  sidebar and moves header controls into the ☰ menu, so `Shift+s` and `focus()`
  on those controls do nothing.
- `@axquery` on a large subtree with no match (the Reader body, Discover's
  cards) can outlast the call timeout. Point the selector at a smaller element.
- Dashboard hotkeys answer only while the dashboard leaf is active. Activate it
  first with `app.workspace.setActiveLeaf(leaf, { focus: true })`.

To act on another window, `@target` reconnects by title. This switches to the
settings window and captures it:

```text
@target Settings
@wait 300
@shot settings.png
```

Opening **Settings** in application mode creates a second page target titled
`Settings - <vault> - Obsidian <version>` (url `about:blank`, no `app`). It makes
`--target <vault>` ambiguous and points `activeDocument` at the wrong window, so
close it before you target the vault — `window.close()` works on it even though
it has no `app`:

```text
@target Settings
@eval window.close()
```

### Drive the Settings window under the guard

The Settings window has no `app` and is not `index.html`, so the ownership guard
would refuse it. Instead the harness treats it as a **companion target**: a page
on the same port whose title is `Settings - <vault name> - Obsidian <version>`,
where `<vault name>` is the folder name of the `--expect-vault` path (compared
case-insensitively) and the url is `about:blank`. The harness first confirms the
vault window on that port is the expected vault, then trusts the Settings window
beside it. This works only when `--profile` pinned the port to your own
instance; without `--profile` or `--expect-vault`, or when the title names
another vault, it refuses with a non-zero exit.

| Command                      | Effect                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--settings eval ./probe.js` | Evaluate in the Settings window instead of the vault window (`--settings shot <out.png>` captures it).              |
| `@settings` (repl step)      | Switch the connection to the Settings window, guarded the same way.                                                 |
| `@vault` (repl step)         | Switch back to the vault window, checked against `--expect-vault` and `--profile`, whether or not Settings is open. |
| `open-settings <tab-id>`     | In the vault window, run `app:open-settings` and `app.setting.openTabById(<tab-id>)`, then wait for the window.     |

`open-settings` prints the Settings window it found, so the next `--settings`
call attaches to a ready window. `--wait <ms>` sets how long it waits (default
10000). The plugin's tab id is `rss-dashboard`:

```sh
node scripts/obsidian-cdp.mjs --profile "$env:TEMP\rss-dashboard-cdp-profile" --expect-vault "$PWD\.fixture-vault" open-settings rss-dashboard
node scripts/obsidian-cdp.mjs --profile "$env:TEMP\rss-dashboard-cdp-profile" --expect-vault "$PWD\.fixture-vault" --settings shot settings.png
```

Unlike the older workarounds (mounting the tab in an overlay in the vault
window, or `@target Settings` without the guard), this captures the real
Settings layout under the ownership check.

#### Phone width

The Settings window cannot be resized below 599px, so emulate a phone: set the
device metrics to 390x844 with `Emulation.setDeviceMetricsOverride`, and add the
`is-mobile` and `is-phone` classes to `<body>` so Obsidian's mobile styles
apply. The override lasts only while the connection that set it stays open, so
set it and capture in the same script. `repl` has no step for raw protocol
calls, so use a short Node 22 script over the same Settings target:

```js
// phone-settings.mjs: node phone-settings.mjs <port> <out.png>
import { writeFileSync } from "node:fs";

const [port, out] = process.argv.slice(2);
const pages = await (await fetch(`http://localhost:${port}/json/list`)).json();
const settings = pages.find(
  (page) =>
    page.type === "page" && /^Settings - .+ - Obsidian \S+$/.test(page.title),
);
const socket = new WebSocket(settings.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve));
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  pending.get(message.id)?.(message);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Runtime.evaluate", {
  expression: "document.body.classList.add('is-mobile', 'is-phone')",
});
await new Promise((resolve) => setTimeout(resolve, 500));
const { result } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(result.data, "base64"));
socket.close();
```

Pass the port from your own profile's `DevToolsActivePort` file, so the script
cannot pick up another session's Settings window; run `open-settings` first so
the window is open and on the tab you want. It is a hand-written script, so it
does not carry the ownership guard itself.

A release build (`npm run build`) is byte-for-byte reproducible: its `main.js`
embeds no commit or timestamp, so its hash is stable. A local dev/watch build
embeds a fresh commit and build time, so compare those by their **build stamp**,
not by file hash; the status bar label (Display setting **Show version in
status bar**, also shown in About) names the build.

Obsidian's own **Command line interface** (**Settings → General → Advanced**,
which some builds surface as a standalone **Advanced** group; "Allow
interactions with Obsidian from the command line") is off by default and not
part of this route yet.

Reach for full computer control (a mouse-and-keyboard driver) instead of this
route only when the behaviour needs real input or native chrome — a drag, a
native dialog, or pixel-level layout. Reading the DOM, clicking, and
screenshotting are cheaper and repeatable over CDP, which is why this is the
default for automated checks.

## Headless Obsidian in a Linux container

A Linux cloud container has no desktop, but Obsidian runs there headless under
`xvfb`, and the CDP harness drives it the same way as on a desktop. The one
script covers install, launch, and teardown:

```sh
npm run build
scripts/launch-obsidian-cloud.sh start   # prints the --port, --profile, --expect-vault flags
node scripts/obsidian-cdp.mjs --port 9333 --profile <profile> --expect-vault <vault> shot out.png
scripts/launch-obsidian-cloud.sh stop    # stops only the instance this script started
```

`start` downloads the Obsidian AppImage (`OBS_VER`, default pinned in the
script) and extracts it to `/opt/obsidian` when it is missing, since the
container has no FUSE. It then creates a fresh fixture vault and profile under
`$TMPDIR/rss-dashboard-obsidian`, launches with `--no-sandbox` (the container
runs as root), turns on community plugins, and enables `rss-dashboard`, closing
the Settings window that opens and collapsing the side panes. To skip
the download in later sessions, run the same install block from the cloud
environment's setup script. The environment's network policy must allow
`github.com` release downloads.

Set `OBS_DIR`, `OBS_WORK_DIR`, or `CDP_PORT` to change the install folder, the
working folder, or the debug port. The guard rules under
[Guard the session you attach to](#guard-the-session-you-attach-to) still apply:
pass `--profile` and `--expect-vault` on every harness call.

## Testing a refactor

A refactor's scoped checklist compares the build before and after, so every
result must come from a known build and a clean vault.

- **Before a reset, check whether Obsidian has the vault open.** An open vault
  keeps the old build in memory, so results taken after the reset belong to
  the old code. If you reset under a running app, run
  `app.commands.executeCommandById('app:reload')` in the developer console,
  then confirm the new code is loaded (for example, that a method the change
  added or removed is present or gone on
  `app.plugins.plugins['rss-dashboard']`) before testing.
- **Drive import dialogs from the console.** Pass a `File` built from text to
  the plugin's import method, which opens the real confirmation modal without
  the native file picker:

  ```js
  const plugin = app.plugins.plugins["rss-dashboard"];
  const text = await app.vault.adapter.read(
    "import-fixtures/rss-dashboard-feed-bundle.json",
  );
  await plugin.importFeedBundleFromFile(
    new File([text], "rss-dashboard-feed-bundle.json"),
  );
  ```

  The other entry points are `importPortableDataBundleFromFile`,
  `importSettingsBundleFromFile`, and `importUserSettingsJsonFromFile`.

- **Use top-level `await` in the console.** An async IIFE prints only
  `Promise {<pending>}`.
- **Check the files on disk, not only the UI.** Open the file the refactor
  writes (for a storage change, `rss-dashboard-data/user-state.json` or a feed
  shard) in the folder you opened, and confirm it holds what the UI shows.
- **Run the ticket's extra checks.** The baseline checklist covers ordinary
  use; the ticket's **Scoped checklist** adds the edge cases the moved code
  handles. For [#467](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/467)
  those were a corrupt `user-state.json`, the orphaned file left after
  reverting to Legacy JSON, and removed versus unrecognized feed state.

## Seeded scenarios

12 feeds, 167 articles: 48 read, 9 starred, 9 tagged, 1 saved, 2 with playback
progress. The automated test in
`test_files/unit/main/fixture-vault-loading.test.ts` checks these counts.

| Scenario                                       | Where to find it                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RSS feed                                       | **GitHub Blog (fixture)**, folder `News/Tech`                                                                                                                                                                                                                                                           |
| Atom feed                                      | **RSS Dashboard releases (fixture)**, folder `News/Tech/Releases`                                                                                                                                                                                                                                       |
| JSON Feed                                      | **JSON Feed (fixture)**, folder `News`                                                                                                                                                                                                                                                                  |
| YouTube feed                                   | **Google for Developers (fixture)**, folder `Videos`                                                                                                                                                                                                                                                    |
| Podcast feed                                   | **The Changelog (fixture)**, folder `Podcasts`                                                                                                                                                                                                                                                          |
| Mastodon feed                                  | **Mastodon (fixture)**, folder `Mastodon`; posts have no title                                                                                                                                                                                                                                          |
| Small web feed                                 | **Kagi Small Web (fixture)**, folder `Smallweb` (the default small web folder)                                                                                                                                                                                                                          |
| Feed in the root                               | **RSS 2.0 sample (fixture, one article)**                                                                                                                                                                                                                                                               |
| Nested folders                                 | `News` → `Tech` → `Releases`; `News` is pinned and `News/Tech` has an auto-tag                                                                                                                                                                                                                          |
| Empty folder                                   | `Empty`                                                                                                                                                                                                                                                                                                 |
| Feed with no articles                          | **Hacker News (fixture, no articles)**                                                                                                                                                                                                                                                                  |
| Feed with one article                          | **RSS 2.0 sample (fixture, one article)**                                                                                                                                                                                                                                                               |
| Feed with many articles                        | **BBC Technology (fixture, 120 articles)**, folder `Bulk`: every third read, every 25th starred, every 40th tagged, every fourth with an image                                                                                                                                                          |
| Feed with a fetch error                        | **Unreachable feed (fixture)**: shows the error badge; its URL never resolves                                                                                                                                                                                                                           |
| Feed that reports the fetch's identity headers | **User-Agent echo (fixture)**: refresh it with `npm run fixture:serve` running and read the terminal (see [Checking the outbound User-Agent](#checking-the-outbound-user-agent)); shows a fetch error when the server is stopped                                                                        |
| Unread article with an image                   | GitHub Blog: "Unread article with a preview image"                                                                                                                                                                                                                                                      |
| Article with no feed description               | GitHub Blog: "Article with no feed description"; the preview stays blank until you open it with `npm run fixture:serve` running, then shows the fetched page's description                                                                                                                              |
| Duplicate lead photo credit                    | GitHub Blog: "Article with a duplicate lead photo credit" (#1305): a caption-only figure whose credit repeats as a paragraph above the body, with a hero set; the figure and its repeated paragraph go together, while a differing credit and one after the body stay                                   |
| Read article without an image                  | GitHub Blog: "Read article without a preview image"                                                                                                                                                                                                                                                     |
| Starred, several tags                          | GitHub Blog: "Starred article with two tags" (Important, Research)                                                                                                                                                                                                                                      |
| Saved article                                  | GitHub Blog: "Fixture guide to offline reading", saved to `saved-articles/`                                                                                                                                                                                                                             |
| Long article                                   | GitHub Blog: "A very long article for reader layout checks": headings, figure, list, quote, code, table                                                                                                                                                                                                 |
| Table for Markdown checks                      | GitHub Blog: "Article with a table for Markdown checks" (#1193): a colspan header, an alignment, and nested list/paragraph content in cells; a saved note should hold a pipe table rather than flattened cell text                                                                                      |
| Resized CDN image                              | GitHub Blog: "CDN image resizing": an inline Cloudinary demo image with `w_300,c_scale` in its URL; the lightbox should load the original (`.../image/upload/sample.jpg`)                                                                                                                               |
| Counter as the only image                      | GitHub Blog: "1x1 counter as the only image" (#1169): the card shows its description with no cover, and the shard stores `coverImage: ""` and `image: ""`; run `npm run fixture:serve` so the counter genuinely loads (a 404 would hide the defect on a build without the fix)                          |
| Counter before a photo                         | GitHub Blog: "1x1 counter before a real photo" (#1169): the counter comes first, so both the cover and the card image are the later photo                                                                                                                                                               |
| Photo with a declared size                     | GitHub Blog: "Photo with a declared size" (#1169): a photo with `width="640" height="360"` is still used as the image, so the size rule does not over-reject                                                                                                                                            |
| URL-pattern pixel as the only image            | GitHub Blog: "URL-pattern pixel as the only image" (#1169): nothing is stored or shown, in any build                                                                                                                                                                                                    |
| Stored tracking pixel as the preview image     | GitHub Blog: "Stored tracking pixel as the preview image" (#1182): a tracking pixel stored in `coverImage` while the body has no usable image; the hero and the saved note show none. Run `npm run fixture:serve` so the pixel genuinely loads (a 404 would hide the defect on a build without the fix) |
| Non-http feed link                             | GitHub Blog: "Article with a non-http link" (#1297): the feed `link` is `javascript:alert(1)`; the restricted, video-source, fetch-failure, starred-import and video-id-not-found links must be left out, never rendered as an anchor `href`                                                            |
| Paywalled article                              | GitHub Blog: "Paywalled article showing only an excerpt"                                                                                                                                                                                                                                                |
| Undated articles                               | GitHub Blog: two undated articles, one with a first-seen date and one without                                                                                                                                                                                                                           |
| Imported starred article                       | JSON Feed: "Starred article imported from starred.json" (cached preview banner)                                                                                                                                                                                                                         |
| Video with playback progress                   | Google for Developers: "Placeholder video two, half watched"                                                                                                                                                                                                                                            |
| YouTube embed in an article                    | GitHub Blog: "Article with an inline YouTube video" (#1173): the Reader and the dashboard inline reader show a click-to-play placeholder; playing loads the video and the **Watch on YouTube** link stays beneath it                                                                                    |
| Podcast with playback progress                 | The Changelog: "Fixture episode 4", about 40% played                                                                                                                                                                                                                                                    |
| Tags                                           | Important, Read later, Video, Podcast, Research, Reference, RSS (all used, in different colors) and Unused (defined, never applied)                                                                                                                                                                     |
| Page image over the feed cover                 | GitHub Blog: "Article whose page declares a hero image" (#812): the page's `og:image` is the fetched version's hero, while the card and the RSS version keep the feed cover. Open it with `npm run fixture:serve` running.                                                                              |
| Page image with no feed image                  | GitHub Blog: "Article with no feed image but a page image" (#812): the card stays imageless; opening the article makes the page's `og:image` the fetched version's hero, above the body image. Serve it with `npm run fixture:serve`.                                                                   |
| Card cover fetched from the page               | GitHub Blog: "Article whose card cover was fetched from the page" (#1354): the card shows the page's `og:image` and the fetched version uses it, while the RSS version's hero stays the feed's own image and a note saved from RSS content uses that image. Serve it with `npm run fixture:serve`.      |

The "Stored tracking pixel as the preview image" row seeds the URL-pattern
variant only. Its size-only twin (The Conversation's `count.gif`) carries no
declared size in a stored `coverImage`, so no offline check can reject it;
seeding it would present a known limitation as expected behaviour (#1182).

Every feed URL is a real public feed, so a manual refresh works and adds that
feed's current articles next to the seeded ones. Everything above displays
offline from the seeded data, except the counter and pixel images, which come
from the local fixture server (`npm run fixture:serve`). Preview images come
from Lorem Picsum and the resized CDN image from
Cloudinary's public demo account; both need a network connection, as do the audio and video: the podcast audio and YouTube
video IDs are placeholders that do not play.

Retention is off for every seeded feed (**Auto delete** and **Max items** are
0), because the seeded articles are older than the default 30-day window. To
test retention, set either limit on a feed, such as the 120-article feed, and
refresh it.

Article text is generated placeholder text. Links point at `example.com`,
which is reserved for documentation, except the "Article with no feed
description" link, which points at the fixture server. Nothing in the vault is
personal data or a credential.

## Import fixtures

| File                                     | Import dialog               | What it tests                                                                                                                                                                         |
| ---------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feeds.opml`                             | Import OPML/XML             | Nested folders, a feed outside any folder, and one feed the vault already follows.                                                                                                    |
| `starred.json`                           | Import starred articles     | A Google Reader compatible export: one article from a followed feed, one from a new feed, `Read later` and new labels, and one entry the importer rejects for having no article link. |
| `rss-dashboard-feed-bundle.json`         | Import feed bundle          | Two feeds in nested folders with articles and state. Replaces the vault's feeds.                                                                                                      |
| `rss-dashboard-settings-bundle.json`     | Import settings bundle      | List view, oldest first, grouped by feed. Keeps the storage location.                                                                                                                 |
| `rss-dashboard-portable-bundle.json`     | Import portable data bundle | One feed with four articles plus the settings above. Replaces everything.                                                                                                             |
| `rss-dashboard-user-preferences.json`    | Import user preferences     | Preferences only: an Overwriting import that keeps feeds, folders, and tags.                                                                                                          |
| `preferences-folders-and-tags-only.json` | Import user preferences     | Folders and tags with no `feeds` key: a Replacing import that keeps the vault's feeds.                                                                                                |

`test_files/unit/services/fixture-vault-import-fixtures.test.ts` parses each
file with the plugin's own parsers and validators.

## Changing the fixture

Edit `scripts/generate-fixture-vault.mjs` for feeds, articles, settings, and
the JSON import fixtures, then run `npm run fixture:vault:generate`. Edit the
notes, `feeds.opml`, `starred.json`, and the `.obsidian` files by hand. Add a
page or image to `test_files/fixture-pages/` — for a seed article to link to, or
for a dialog to be pointed at, as the feed-advertising page is — and name it in
`scripts/generate-fixture-vault.mjs` when a test or the seed data needs it. The
fixture server serves each `.html`, `.gif`, and `.png` file there by its
filename.
`test_files/unit/setup-fixture-vault.test.ts` fails if the committed files no
longer match the generator. Update the counts and the table above when the
scenarios change.
