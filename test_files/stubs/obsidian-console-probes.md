# Obsidian console probes

These probes observe real Obsidian behavior for the stub contract
(`obsidian.contract.test.ts`, ADR 0014). Run them in a throwaway vault, never
a vault with real data, and record the Obsidian version (**Settings → About**)
with each result.

The records below were re-observed on **Obsidian 1.14.4 desktop (Windows)**,
the current stable, on **2026-10-11**. The reference was 1.13.7 before that;
every behavior recorded on 1.13.7 reproduced unchanged on 1.14.4 unless a
record says otherwise. The stub's reference pin is 1.14.4; the installer in the
probe session was 1.13.7 (the renderer updates in place, so the running app was
newer than the installer).

## Re-running these probes (drift check)

The committed drivers under `test_files/stubs/probes/` run over the merged CDP
harness (`scripts/obsidian-cdp.mjs`, see "Driving the vault over CDP" in
`docs/development/fixture-vault.md`). Point a disposable profile at a throwaway
vault, then run one file per API group:

```sh
node scripts/obsidian-cdp.mjs repl test_files/stubs/probes/version-and-platform.repl
node scripts/obsidian-cdp.mjs repl test_files/stubs/probes/request-url.repl
# ...and the rest of the files listed below.
```

Run `version-and-platform.repl` first: it records the running app version from
Settings → About, the exported API version, and the `Platform` flags.

The console exposes only `Notice`, `moment`, `requestUrl`, the DOM helpers, and
`app` as globals; the API classes (`Setting`, `Menu`, `MarkdownRenderer`,
`Scope`, `setIcon`, `requireApiVersion`, ...) are not. Each driver that needs
them starts by writing a tiny local plugin (`.obsidian/plugins/obsidian-probe`)
that stashes `require("obsidian")` on `window.__obsidianApi`, enabling it with
`app.plugins.setEnable(true)`. That is throwaway-vault-only setup, and it is
idempotent. `Notice`, `moment`, `requestUrl`, and the DOM helpers are reachable
without it.

Triggers for a re-run: a reference-pin bump, a `minAppVersion` change, an
`obsidian` package bump, or an Obsidian stable release. Diff each output against
the record below; a change is a new finding (ADR 0014), not a test to fix
silently.

The harness quirk to remember: in `repl`/`eval` mode a **promise result must be
awaited at the top level** (`await somePromise` as the last expression), not
returned from an async IIFE — the harness prints `{}` for the IIFE's promise.

## How to run by hand

- Open DevTools with Ctrl+Shift+I (Cmd+Option+I on macOS) and use the
  **Console** tab.
- `require("obsidian")` doesn't work in the console ("Cannot find module
  'obsidian'"). `requestUrl` is available as the global `window.requestUrl`.
  `app`, `activeDocument`, `createDiv`, `Notice`, and `moment` are globals too.
- Use a bare top-level `await`; an async IIFE prints `Promise {<pending>}`.
- `copy()` only works at the top level of a console command, not inside an
  async function. Store results on `window` and call `copy(window.__probe)`
  afterwards.

## requestUrl throws on status 400 and above

**Probe:** `test_files/stubs/probes/request-url.repl`.
**Observed on 1.14.4 (Windows):** unchanged from 1.13.7. Every status at or
above 400 rejects with an `Error` message `Request failed, status <n>` whose own
keys are exactly `["status", "headers"]`; with `throw: false` the response is
returned (`{ status: 403, text: "" }`).

```js
for (const s of [403, 404, 500]) {
  try {
    const r = await requestUrl({ url: `https://httpbin.org/status/${s}` });
    console.log(s, "returned", r.status);
  } catch (e) {
    console.log(s, "threw", e.message, "status=", e.status, Object.keys(e));
  }
}
const r = await requestUrl({
  url: "https://httpbin.org/status/403",
  throw: false,
});
console.log("throw:false returned", r.status);
```

## Document.createDiv appends to the document

**Probe:** `test_files/stubs/probes/dom-helpers.repl`.
**Observed on 1.14.4 (Windows):** unchanged. `activeDocument.createDiv()` throws
`HierarchyRequestError` ("Only one element on document allowed"), because the
document already has its `<html>` element. The global `createDiv()` returns a
detached element instead; use it, or `el.win.createDiv()`, for a temporary
container (#409).

```js
try {
  const d = activeDocument.createDiv();
  console.log("ok, parent:", d.parentNode);
  d.remove();
} catch (e) {
  console.log("threw", e.name, e.message);
}
```

## Hidden paths aren't indexed

**Probe:** `test_files/stubs/probes/vault-index.repl`.
**Observed on 1.14.4 (Windows):** unchanged. `getAbstractFileByPath` returns
`null` for anything under a dot folder (including `configDir`), even when it's
on disk.

```js
for (const p of [
  `${app.vault.configDir}/plugins`,
  `${app.vault.configDir}/community-plugins.json`,
]) {
  console.log(
    p,
    "indexed:",
    app.vault.getAbstractFileByPath(p),
    "on disk:",
    await app.vault.adapter.exists(p),
  );
}
```

Observed: both paths are indexed `null` and on disk `true`.

## create and createFolder on existing paths

**Probe:** `test_files/stubs/probes/vault-index.repl`.
**Observed on 1.14.4 (Windows):** unchanged. `createFolder` throws `Folder
already exists.` for an existing path and for a case variant of it. `create`
throws `File already exists.` the same way. `getAbstractFileByPath` is
case-sensitive, so the case variant returns `null` while `adapter.exists`
returns `true`. `create` with a missing parent folder throws `ENOENT` with the
absolute path.

```js
await app.vault.createFolder("probe-folder");
for (const p of ["probe-folder", "PROBE-Folder"]) {
  try {
    await app.vault.createFolder(p);
    console.log(p, "created");
  } catch (e) {
    console.log(p, "threw", e.message);
  }
}
console.log(
  "case-variant lookup:",
  app.vault.getAbstractFileByPath("PROBE-Folder"),
);
console.log(
  "case-variant exists:",
  await app.vault.adapter.exists("PROBE-Folder"),
);
try {
  await app.vault.create("probe-missing/x.md", "");
} catch (e) {
  console.log("missing parent threw", e.message);
}
// Clean up: delete probe-folder from the file explorer.
```

## Adapter file system model

**Probe:** `test_files/stubs/probes/adapter.repl`.
**Observed on 1.14.4 (Windows):** `adapter.write` under a missing parent folder
throws an `Error` with `code: "ENOENT"` and the message `ENOENT: no such file
or directory, open '<absolute path>'`. `adapter.mkdir` creates nested folders
and resolves `undefined`; it also **resolves on an existing folder** (no
throw). `exists` and `list` then report mkdir-made folders, and the folder
**joins the vault index** — `getAbstractFileByPath("probe-adapter/m1/m2")`
returns it — not only `vault.createFolder` folders. After `adapter.write`,
`exists` is true and `getAbstractFileByPath` returns the file. `list` returns
the full vault paths of the direct children (`{ folders: ["probe-adapter/m1"],
files: [] }` for the nested mkdir above).

```js
const A = app.vault.adapter;
const root = "probe-adapter";
if (await A.exists(root)) await A.rmdir(root, true);
await A.mkdir(root);
try {
  await A.write(`${root}/nope/x.md`, "x");
  console.log("missing parent: wrote");
} catch (e) {
  console.log("missing parent threw", e.code, e.message);
}
console.log("mkdir resolved", await A.mkdir(`${root}/m1/m2`));
console.log("mkdir on existing", await A.mkdir(`${root}/m1`));
console.log("exists after mkdir", await A.exists(`${root}/m1/m2`));
console.log("list after mkdir", await A.list(root));
console.log(
  "mkdir folder indexed",
  app.vault.getAbstractFileByPath(`${root}/m1/m2`)?.path ?? null,
);
await A.write(`${root}/w.md`, "w");
console.log(
  "after write: exists",
  await A.exists(`${root}/w.md`),
  "indexed",
  !!app.vault.getAbstractFileByPath(`${root}/w.md`),
);
// Clean up: await A.rmdir(root, true);
```

## Modal lifecycle and DOM

**Probe:** `test_files/stubs/probes/modal.repl`.
**Observed on 1.14.4 (Windows):** unchanged. `onOpen` runs with
`containerEl.isConnected` true. `close()` detaches `containerEl` first and then
runs `onClose` synchronously, so `isConnected` is false inside `onClose`.
`scope` exists, `headerEl` has class `modal-header` and holds `titleEl`.
`modalEl`'s children are, in order, `modal-header-button mod-raised
clickable-icon` (the close button), `modal-header`, and `modal-content`; there
is no `.modal-close-button`. `containerEl`'s class is `modal-container mod-dim`.
Clicking the header button closes the modal.

```js
const findCtor = (o, needs) => {
  let p = Object.getPrototypeOf(o);
  while (p && p !== Object.prototype) {
    const own = Object.getOwnPropertyNames(p);
    if (needs.every((n) => own.includes(n))) return p.constructor;
    p = Object.getPrototypeOf(p);
  }
  return null;
};
const Modal = findCtor(app.setting, ["open", "close", "onOpen", "onClose"]);
const log = [];
const m = new Modal(app);
m.onOpen = () => log.push("onOpen connected=" + m.containerEl.isConnected);
m.onClose = () => log.push("onClose connected=" + m.containerEl.isConnected);
m.setTitle("T");
m.open();
await new Promise((r) => setTimeout(r, 100));
console.log({
  scope: !!m.scope,
  containerElClass: m.containerEl.className,
  headerElClass: m.headerEl?.className,
  titleElParent: m.titleEl?.parentElement?.className,
  modalElChildren: [...m.modalEl.children].map((e) => e.className),
  hasModalCloseButton: !!m.modalEl.querySelector(".modal-close-button"),
});
m.close();
log.push("after close() sync, connected=" + m.containerEl.isConnected);
console.log(log);
```

The driver reaches `Modal` as `api.Modal` from the bootstrapped module; the
console route above (its base class on `app.setting`) gives the same class.

## DOM helpers on elements

**Probe:** `test_files/stubs/probes/dom-helpers.repl`.
**Observed on 1.14.4 (Windows):** unchanged from 1.13.7, plus the `parent`
option below.

- A `cls` array is joined with spaces (`"a b"`).
- An `attr` value of `null` leaves the attribute out; `false`, `true` and `0`
  become `"false"`, `"true"` and `"0"`. `setAttr(k, null)` removes `k`.
- A `DocumentFragment` given to `setText` or as the `text` option inserts the
  fragment's nodes.
- `createEl(tag, opts, cb)` calls `cb` with the new element, and
  `prepend: true` inserts it as the first child.
- `toggleClass(c)` without a second argument removes `c`, whether or not it
  was there. It doesn't toggle.
- Elements have `detach`, `instanceOf`, `doc` (`=== document`), `win`
  (`=== window`), `show`, `hide`, `toggle`, `isShown`, `find`, `findAll`,
  `setCssProps` and `setCssStyles`. `hide()` sets `style.display` to `"none"`
  and `show()` sets it to `""`. `setCssProps` sets custom properties too.
- `createEl` applies `type` to input and button only, `value` to input and
  option only (not select, textarea, button or div), and `placeholder` to
  input only (a textarea gets neither the property nor the attribute; use
  `attr: { placeholder }`). `title` applies to any element, `href` to a link.
- **`parent` (new):** the global Window helpers (`createEl`, `createDiv`,
  `createSpan`) append the new element to a `parent` option (`createEl("span",
{ parent: host })` puts it in `host`, and `{ parent: fragment }` appends to
  the fragment). A Node receiver ignores `parent`:
  `receiver.createEl("span", { parent: other })` appends to `receiver`, not
  `other`. `test_files/unit/test-dom-polyfills.ts` models this.

```js
const r = {};
r.clsArray = createEl("div", { cls: ["a", "b"] }).className;
const e1 = createEl("div", { attr: { x: null, z: false, w: true, n: 0 } });
r.attr = {
  hasX: e1.hasAttribute("x"),
  z: e1.getAttribute("z"),
  w: e1.getAttribute("w"),
  n: e1.getAttribute("n"),
};
const e2 = createDiv();
e2.setAttr("k", "v");
e2.setAttr("k", null);
r.setAttrNull = e2.hasAttribute("k");
const e3 = createDiv();
e3.setText(createFragment((f) => f.createSpan({ text: "S" })));
r.setTextFragment = e3.innerHTML;
r.textFragment = createDiv({
  text: createFragment((f) => f.appendText("T")),
}).innerHTML;
const host = createDiv();
let cbArg = null;
const e5 = host.createEl("span", { text: "x" }, (el) => {
  cbArg = el;
});
r.callbackArg = cbArg === e5;
host.createDiv({ cls: "first" });
host.createDiv({ cls: "pre", prepend: true });
r.prepend = [...host.children].map((c) => c.className);
const had = createDiv({ cls: "c" });
had.toggleClass("c");
const lacked = createDiv();
lacked.toggleClass("c");
r.toggleNoForce = [had.className, lacked.className];
r.helpers = Object.fromEntries(
  [
    "detach",
    "instanceOf",
    "show",
    "hide",
    "find",
    "findAll",
    "setCssProps",
    "setCssStyles",
  ].map((n) => [n, typeof host[n]]),
);
r.docWin = [host.doc === document, host.win === window];
r.find = host.find(".first")?.className ?? null;
const e8 = createDiv();
e8.hide();
r.hide = e8.style.display;
e8.show();
r.show = e8.style.display;
const e9 = createDiv();
e9.setCssProps({ "--x": "1", color: "red" });
r.setCssProps = e9.getAttribute("style");
r.byTag = {
  divType: createEl("div", { type: "text" }).getAttribute("type"),
  inputType: createEl("input", { type: "checkbox" }).type,
  buttonType: createEl("button", { type: "submit" }).type,
  inputValue: createEl("input", { value: "v" }).value,
  optionValue: createEl("option", { value: "o" }).value,
  selectValue: createEl("select", { value: "s" }).getAttribute("value"),
  inputPlaceholder: createEl("input", { placeholder: "p" }).placeholder,
  textareaPlaceholder: createEl("textarea", { placeholder: "p" }).placeholder,
  divTitle: createEl("div", { title: "t" }).title,
  aHref: createEl("a", { href: "https://example.com/" }).getAttribute("href"),
};
const pHost = createDiv();
const pChild = createEl("span", { text: "x", parent: pHost });
r.parentOption = { appended: pChild.parentElement === pHost };
const frag = createFragment();
const pChild2 = createEl("span", { text: "y", parent: frag });
r.parentFragment = { appendedToFragment: pChild2.parentNode === frag };
console.log(JSON.stringify(r, null, 1));
```

## normalizePath

**Probe:** `test_files/stubs/probes/normalize-path.repl`.
**Observed on 1.14.4 (Windows):** the 1.13.7 source-audit rules still hold,
confirmed indirectly through `vault.create` and `fileManager.renameFile`:
`/` and `\` are both separators, runs of them collapse to one `/`, leading and
trailing separators are trimmed, non-breaking spaces (U+00A0, U+202F) become
spaces, and the result is NFC-normalized. `normalizePath` itself isn't a
console global, so every result here comes through an API that applies it.

```js
await app.vault.createFolder("probe-np");
const cases = [
  ["probe-np//double.md", "probe-np/double.md"],
  ["/probe-np/lead.md", "probe-np/lead.md"],
  ["probe-np/trail.md/", "probe-np/trail.md"],
  ["probe-np\\back.md", "probe-np/back.md"],
  ["probe-np/nb\u00a0sp.md", "probe-np/nb sp.md"],
  ["probe-np/nnb\u202fsp.md", "probe-np/nnb sp.md"],
  ["probe-np/cafe\u0301.md", "probe-np/caf\u00e9.md"],
];
for (const [input, expected] of cases) {
  try {
    const f = await app.vault.create(input, "x");
    console.log(
      JSON.stringify(input),
      "created",
      JSON.stringify(f.path),
      f.path === expected ? "(normalized)" : "(not normalized)",
    );
  } catch (e) {
    console.log(JSON.stringify(input), "threw", e.message);
  }
}
console.log(
  "root lookups:",
  JSON.stringify(app.vault.getAbstractFileByPath("")?.path ?? null),
  JSON.stringify(app.vault.getAbstractFileByPath("/")?.path ?? null),
);
const target = app.vault
  .getAllLoadedFiles()
  .find((f) => f.path.startsWith("probe-np/") && f.name.endsWith(".md"));
await app.fileManager.renameFile(
  target,
  "\\probe-np\\\\renamed cafe\u0301.md/",
);
console.log("renamed to", JSON.stringify(target.path));
// Clean up: delete probe-np from the file explorer.
```

Observed: every case is normalized, including the combining-accent `cafe\u0301`
→ `caf\u00e9`; `getAbstractFileByPath("")` is `null`, `getAbstractFileByPath("/")`
is `"/"`, and a direct lookup with a backslash (`probe-np\back.md`) is `null`
(lookups don't normalize). The rename lands at `"probe-np/renamed café.md"`.

## Reading a missing file

**Probe:** `test_files/stubs/probes/adapter.repl`.
**Observed on 1.14.4 (Windows):** unchanged for the recorded cases.
`adapter.read` of a missing path throws an `Error` with `code: "ENOENT"` and the
message `ENOENT: no such file or directory, open '<absolute path>'`. `vault.read`
of a `TFile` whose file was removed on disk through the adapter throws the same
way. Now probed too: `vault.readBinary` and `adapter.readBinary` of a missing
path throw the same `ENOENT`. **`vault.cachedRead` does not throw**: it returned
the content it had cached before the removal. The cache model was settled on
1.14.4 by reading the running renderer's `Vault`/`TFile` implementation over the
same CDP connection (introspecting `app.vault.cachedRead`, `Vault.read`,
`Vault.create`, and `TFile.cache`):

- `cachedRead(file)` returns the file's entry in a module-level `Map` keyed by
  the `TFile` object, and falls back to `read(file)` on a miss; the entry
  therefore outlives an `adapter.remove` of the file, and a rename carries it
  too (the map is not re-keyed, the same `TFile` object is kept).
- `read(file)` reads the path through the adapter, strips a leading BOM, and
  calls `file.cache(content)`. Only `Vault.read` fills the cache that way;
  `adapter.read` bypasses it. `file.cache` stores content whose length is at or
  under the vault's cache limit (`vault.cacheLimit`, 65536 by default), evicts
  content over it, and clears the entry for `null`.
- `create` writes through the adapter and returns the `TFile` without caching,
  so a file removed before it is ever read has nothing to serve and `cachedRead`
  still throws `ENOENT`.
- `modify(file, content)` updates the cache to the new content on success and
  clears it when the write fails; `append(file, content)` clears it.

The stub models the `cachedRead`/`read`/`create` cases in
`MockDataVault.cachedRead`: a per-`TFile` cache filled by `read`, served by
`cachedRead`, and left empty for content over the limit (#1001). It does not
model the `modify`/`append` cache effects (the stub's `modify` is a no-op that
never changes content) or the BOM strip. The cache cases below are added to
`adapter.repl` (step 4) for the behavioral drift check.

```js
const A = app.vault.adapter;
try {
  await A.read("probe-read-missing.md");
  console.log("adapter.read: returned");
} catch (e) {
  console.log("adapter.read threw", e.code, e.message);
}
const f = await app.vault.create("probe-read.md", "hello");
await A.remove("probe-read.md");
try {
  await app.vault.read(f);
  console.log("vault.read: returned");
} catch (e) {
  console.log("vault.read threw", e.code, e.message);
}
```

## Component lifecycle

**Probe:** `test_files/stubs/probes/component.repl`.
**Observed on 1.14.4 (Windows):** unchanged. A `register` callback runs on
`unload()`, and `unload()` removes a `registerDomEvent` listener (1 click
counted before unload, none after). `addChild` on a loaded parent loads the
child at once, and the parent's `unload()` unloads it (its `onunload` runs,
`_loaded` is `false`). `addChild` on an unloaded parent doesn't load the child;
the parent's later `load()` does.

```js
const findCtor = (o, needs) => {
  let p = Object.getPrototypeOf(o);
  while (p && p !== Object.prototype) {
    const own = Object.getOwnPropertyNames(p);
    if (needs.every((n) => own.includes(n))) return p.constructor;
    p = Object.getPrototypeOf(p);
  }
  return null;
};
const Component = findCtor(Object.values(app.plugins.plugins)[0], [
  "load",
  "unload",
  "register",
  "registerDomEvent",
  "addChild",
]);

const log = [];
const c = new Component();
c.load();
c.register(() => log.push("register cb ran"));
const el = createDiv();
document.body.appendChild(el);
let clicks = 0;
c.registerDomEvent(el, "click", () => clicks++);
el.click();
c.unload();
el.click();
el.remove();

const child = new Component();
child.onunload = () => log.push("child onunload");
const parent = new Component();
parent.load();
parent.addChild(child);
const loadedAfterAdd = child._loaded;
parent.unload();

const late = new Component();
const idle = new Component();
idle.addChild(late);
const lateBeforeLoad = late._loaded;
idle.load();
console.log({
  log,
  clicks,
  loadedAfterAdd,
  loadedAfterParentUnload: child._loaded,
  lateBeforeLoad,
  lateAfterLoad: late._loaded,
});
```

Observed: `{ log: ["register cb ran", "child onunload"], clicks: 1,
loadedAfterAdd: true, loadedAfterParentUnload: false, lateBeforeLoad: false,
lateAfterLoad: true }`. The driver reaches `Component` as `api.Component` (the
console route above needs at least one enabled community plugin).

## Workspace leaves by type

**Probe:** `test_files/stubs/probes/workspace.repl`.
**Observed on 1.14.4 (Windows), with empty, file-explorer, and backlink leaves
open:** unchanged. `getLeavesOfType` filters by view type (`"markdown"` and an
unknown type both returned 0). `revealLeaf` is a function, and
`getLeaf.length` is 2. `openViewTypes` lists the open leaves as a check:
`["empty", "file-explorer", "backlink"]`.

```js
console.log({
  unknownType: app.workspace.getLeavesOfType("definitely-not-a-view").length,
  markdown: app.workspace.getLeavesOfType("markdown").length,
  openViewTypes: (() => {
    const types = [];
    app.workspace.iterateAllLeaves((l) => types.push(l.view.getViewType()));
    return types;
  })(),
  revealLeaf: typeof app.workspace.revealLeaf,
  getLeafLength: app.workspace.getLeaf.length,
});
```

The driver's last step checks `typeof leaf.loadIfDeferred` and its resolved
value. That step was added after the 1.14.4 run, so its output is not recorded
yet; run it against a scratch vault to record it. Until then the stub models
`loadIfDeferred` as resolving immediately, marked "Not probed".

## fileManager.trashFile on a folder

**Probe:** `test_files/stubs/probes/workspace.repl`.
**Observed on 1.14.4 (Windows):** after `fileManager.trashFile(folder)`, the
folder and its whole subtree are gone from the vault index, and `adapter.exists`
reports them gone on disk. Now probed: a descendant nested a level deeper than
one (`tf/nested/c.md`) and the folder path itself are also gone.

```js
const V = app.vault;
const A = V.adapter;
const root = "probe-trash";
if (await A.exists(root)) await A.rmdir(root, true);
await V.createFolder(`${root}/tf`);
await V.create("probe-trash/tf/deep.md", "d");
await V.createFolder(`${root}/tf/nested`);
await V.create(`${root}/tf/nested/c.md`, "c");
await app.fileManager.trashFile(V.getAbstractFileByPath(`${root}/tf`));
await new Promise((r) => setTimeout(r, 400));
console.log({
  folder: !!V.getAbstractFileByPath(`${root}/tf`),
  child: !!V.getAbstractFileByPath(`${root}/tf/deep.md`),
  grandchild: !!V.getAbstractFileByPath(`${root}/tf/nested/c.md`),
  folderOnDisk: await A.exists(`${root}/tf`),
  childOnDisk: await A.exists(`${root}/tf/deep.md`),
  grandchildOnDisk: await A.exists(`${root}/tf/nested/c.md`),
});
// Observed: every field false.
// Clean up: empty the trashed folder from the system trash or the vault's
// .trash folder.
```

## TFile names and adapter paths

**Probe:** `test_files/stubs/probes/vault-index.repl`.
**Observed on 1.14.4 desktop (Windows):** unchanged. For `dir/my.file.name.md`,
`name` is `my.file.name.md`, `basename` is `my.file.name` (up to the last dot),
and `extension` is `md`. For `dir/noext`, `name` and `basename` are `noext` and
`extension` is `""`. `adapter.getBasePath` is a function that returns the
vault's absolute path, and `adapter.getFullPath("a/b.md")` returns it joined
with the vault path in OS separators (`...\rss-431-scratch-vault\a\b.md`). The
stub always joins with `/`. Mobile wasn't probed; its adapter has no
`getBasePath`.

```js
const V = app.vault;
const A = V.adapter;
const root = "probe-names";
await V.createFolder(root).catch(() => {});
const files = [
  await V.create(`${root}/my.file.name.md`, ""),
  await V.create(`${root}/noext`, ""),
];
console.log(
  files.map((f) => ({
    path: f.path,
    name: f.name,
    basename: f.basename,
    extension: f.extension,
  })),
);
console.log({
  getBasePath: typeof A.getBasePath,
  basePath: A.getBasePath?.(),
  getFullPath: A.getFullPath?.("a/b.md"),
});
```

## Removing a missing path or a folder

**Probe:** `test_files/stubs/probes/adapter.repl`.
**Observed on 1.14.4 (Windows):** unchanged. `adapter.remove` of a missing path
throws an `Error` with `code: "ENOENT"` and the message `ENOENT: no such file or
directory, unlink '<absolute path>'`. `adapter.remove` of a folder throws an
`Error` with `code: "EPERM"` and the message `EPERM: operation not permitted,
unlink '<absolute path>'`, and the folder stays. Node's `unlink` on Linux and
macOS reports `EISDIR` for a folder instead; that wasn't probed. Removing a case
variant of an existing file's path wasn't probed either. `adapter.remove` of an
existing file resolves and the file is gone.

```js
const A = app.vault.adapter;
await A.mkdir("probe-remove/m1");
try {
  await A.remove("probe-remove/missing.md");
  console.log("remove missing: returned");
} catch (e) {
  console.log("remove missing threw", e.code, e.message);
}
try {
  await A.remove("probe-remove/m1");
  console.log("remove folder: returned");
} catch (e) {
  console.log("remove folder threw", e.code, e.message);
}
console.log("folder still exists:", await A.exists("probe-remove/m1"));
// Clean up: delete probe-remove from the file explorer.
```

## Renaming a file

**Probe:** `test_files/stubs/probes/vault-index.repl`.
**Observed on 1.14.4 desktop (Windows):** unchanged. After
`fileManager.renameFile(f, newPath)`, `vault.read(f)` returns the old content,
`f.path` is the new path, and the old path is no longer indexed.
`renameFile(f, "probe-rename//r3.md")` leaves `f.path` as `probe-rename/r3.md`
(normalized). Renaming onto an existing path throws "Destination file already
exists!", from both `fileManager.renameFile` and `vault.rename`. Not probed:
`adapter.exists` for the old and new paths, whether `vault.rename` normalizes,
a case-only rename, a missing destination folder, and renaming a folder.

```js
const V = app.vault;
const root = "probe-rename";
await V.createFolder(root).catch(() => {});
const f = await V.create(`${root}/r1.md`, "hello");
await app.fileManager.renameFile(f, `${root}/r2.md`);
console.log({
  path: f.path,
  content: await V.read(f),
  oldIndexed: !!V.getAbstractFileByPath(`${root}/r1.md`),
});
// Observed: { path: "probe-rename/r2.md", content: "hello", oldIndexed: false }
await app.fileManager.renameFile(f, `${root}//r3.md`);
console.log(f.path);
// Observed: "probe-rename/r3.md"
const other = await V.create(`${root}/r4.md`, "4");
for (const [label, rename] of [
  ["renameFile", () => app.fileManager.renameFile(other, `${root}/r3.md`)],
  ["vault.rename", () => V.rename(other, `${root}/r3.md`)],
]) {
  try {
    await rename();
    console.log(label, "resolved");
  } catch (e) {
    console.log(label, "threw", e.message);
  }
}
// Observed: both threw "Destination file already exists!"
// Clean up: await V.adapter.rmdir(root, true);
```

## Step 3: version and Platform

**Probe:** `test_files/stubs/probes/version-and-platform.repl`.
**Observed on 1.14.4 (Windows):** Settings → About reads **Version 1.14.4** and
**Installer version: 1.13.7** (the renderer updates in place, so the app can be
newer than the installer). The exported `apiVersion` is `"1.14.4"`. `Platform`
has `isDesktop`, `isDesktopApp`, `isWin` true; every other flag false;
`resourcePathPrefix` is a per-install `app://<hash>/` URL. The stub keeps the OS
flags false and a fixed `resourcePathPrefix` so tests don't depend on the
machine.

## Step 3: requireApiVersion

**Probe:** `test_files/stubs/probes/require-api-version.repl`.
**Observed on 1.14.4 (Windows):** `true` for every version at or below 1.14.4
(1.0.0, 1.8.7, 1.13.7, 1.14.3, 1.14.4) and `false` above it (1.14.5, 1.15.0,
2.0.0). The stub models this against a running version that defaults to the
pinned reference (1.14.4) and is switchable through a test hook (#431).

## Step 3: Setting

**Probe:** `test_files/stubs/probes/setting.repl`.
**Observed on 1.14.4 (Windows):** a `Setting(containerEl)` builds
`setting-item` → `setting-item-info` (`setting-item-name`,
`setting-item-description`) plus `setting-item-control`. `setHeading()` adds
`setting-item-heading`. `setClass(cls)` adds the class. `setTooltip(text)` sets
`aria-label` on `nameEl`. `setDisabled(true)` adds `is-disabled` to
`settingEl`; it does not set the `disabled` attribute on the control.
`addButton` builds `<button class="mod-cta" aria-label="...">`; `addExtraButton`
builds a `div.clickable-icon.extra-setting-button[tabindex=0][aria-label]`
holding an `<svg class="svg-icon lucide-<name>">`; `addText` builds
`<input type="text" spellcheck="false" placeholder="...">`; `addDropdown` builds
a `<select>` with the added options. The stub models the base DOM and buttons;
the heading, tooltip, disabled and extra-button shapes are not modeled yet
(#431).

## Step 3: Menu

**Probe:** `test_files/stubs/probes/menu.repl`.
**Observed on 1.14.4 (Windows):** a `MenuItem` exposes `disabled` and `checked`
as readable properties (`setChecked(true)` → `checked: true`,
`setDisabled(true)` → `disabled: true`), and has `setTitle`, `setIcon`,
`setChecked`, `setDisabled`, `onClick`, plus `titleEl`, `iconEl`,
`checkIconEl`, `submenu`, `section`, `menu`, `dom` and `callback`. `Menu` has
`addItem`, `addSeparator`, `showAtPosition`, `showAtMouseEvent`, and also `hide`
and `close`. The stub's `MenuItem` lacks `setDisabled` (production calls it in
`src/views/reader-view.ts`), and its `Menu` lacks `hide`/`close`; the
disabled/checked behavior is a separate slice (#431). A shown menu renders in
the main window's `document` as `.menu > .menu-scroll > .menu-group >
.menu-item`; a disabled item carries `is-disabled` and a checked one carries
`mod-checked` (`menu-item tappable`, `menu-item tappable mod-checked`,
`menu-item tappable is-disabled`). Close the Settings popout before probing, or
`activeDocument` points at that window and the menu renders elsewhere.

## Step 3: Notice

**Probe:** `test_files/stubs/probes/notice.repl`.
**Observed on 1.14.4 (Windows):** a `Notice` instance has own keys `timerId`,
`buttonContainerEl`, `win`, `containerEl`, `noticeEl`, `messageEl`; its
prototype has `setMessage`, `setAutoHide`, `addButton`, `hide`; `noticeEl` has
class `notice-message` and holds the message text. The global `Notice` is the
same constructor. The stub only models `hide()`; the instance shape is a
separate confirmation slice (#431).

## Step 3: setIcon

**Probe:** `test_files/stubs/probes/set-icon.repl`.
**Observed on 1.14.4 (Windows):** `setIcon(el, "play")` empties `el` and writes
the inline lucide SVG

```
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path></svg>
```

and `setIcon(el, "rss")` writes

```
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-rss"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>
```

The wrapper attributes are identical for every lucide icon; the class is
`svg-icon` plus the id Obsidian resolves. That id differs from the requested
name for Obsidian's aliases, which the probe's final step records directly:
`trash` -> `lucide-trash-2`, `pencil` -> `lucide-edit-3`, `folder` ->
`lucide-folder-open`, `fullscreen` -> `lucide-maximize`, and `link` ->
`svg-icon link` (an id with no `lucide-` prefix). An unknown name empties the
element and inserts nothing (the probe set it on an element that held text).
`"youtube"` is unknown on 1.14.4, so `setIcon(youtubeIcon, "youtube")` renders
nothing (issue #1015). `getIcon("play")` returns a detached `svg` with the same
`class`. `getIconIds()` returned 1979 ids and did **not** include `"play"`
(custom icons only, it seems). The stub models the SVG through
`lucide-icons.ts`: `ICON_BODIES` carries the ids the plugin's code and tests name
and `ICON_ALIASES` the five names above; every other name resolves to
`lucide-<name>` and, if it is not carried, renders empty — the same thing the app
does for a name it does not ship. The stub models neither `getIcon` nor
`getIconIds`, which have no production consumer.

## Step 3: Scope

**Probe:** `test_files/stubs/probes/scope.repl`.
**Observed on 1.14.4 (Windows):** `register` returns a handler with own keys
`scope`, `modifiers`, `key`, `func`. `modifiers` is a **comma-joined string**
with `Mod` resolved to the platform key: `["Mod", "Shift"]` → `"Ctrl,Shift"` on
Windows, `["Ctrl", "Alt"]` → `"Alt,Ctrl"`, `null` → `null`, `[]` → `""`. A
`Scope` has no `handlers` property. The stub stores the modifier array that
tests inspect; the string form is not modeled (#431).

## Step 3: AbstractInputSuggest

**Probe:** `test_files/stubs/probes/abstract-input-suggest.repl`.
**Observed on 1.14.4 (Windows):** `AbstractInputSuggest` extends
`PopoverSuggest`. Its prototype has `showSuggestions`, `setValue`, `getValue`,
`onInputFocus`, `onInputChange`, `selectSuggestion`, `onSelect`, `close`,
`reposition`, `open`, `autoReposition`; `getSuggestions` and `renderSuggestion`
are abstract. Stays thin in the stub: no production consumer; model it
faithfully when one appears (#431).

## Step 3: MarkdownRenderer (the 1.14 math DOM)

**Probe:** `test_files/stubs/probes/markdown-renderer.repl`.
**Observed on 1.14.4 (Windows):** math renders through MathJax 4 CHTML. Inline
`$x^2$` becomes `<span class="math math-inline is-loaded"><mjx-container
class="MathJax" jax="CHTML" overflow="overflow"><mjx-math data-latex="x^2"
class="TEX-N">…</mjx-math></mjx-container></span>`; display math uses a
`div.math.math-block` and `mjx-container … display="true"`. The `.math` span
gains `is-loaded` once MathJax finishes. `renderMath("a+b", false)` returns an
`MJX-CONTAINER` with class `MathJax`; `finishRenderMath` and `loadMathJax`
exist. Plain markdown renders `<h1 data-heading="H" dir="auto">H</h1>` and
`<p dir="auto"><strong>b</strong> and <code>c</code></p>`.

**Containment check:** the plugin's reader math path
(`src/utils/math-rendering.ts`) reads back only `.math` and `mjx-container` and
sets its own `data-math`, all of which the MathJax 4 DOM still provides, so the
swap did not break the plugin; the reference pin moves to 1.14.4. The stub's
math model is a bare `mjx-container` holding the LaTeX text, a divergence to
confirm in the confirmations slice (#431).

## Step 3: moment

**Probe:** `test_files/stubs/probes/moment.repl`.
**Observed on 1.14.4 (Windows):** `format("YYYY-MM-DD HH:mm")` →
`2026-10-11 13:05`; `format("ddd MMM Do YYYY h:mm A")` → `Sun Oct 11th 2026
1:05 PM`; `locale()` → `"en"`; `isMoment` true; an invalid string is not valid;
`duration(90, "minutes").humanize()` → `"2 hours"`; `fromNow` and `calendar`
are functions; `utcOffset()` follows the machine time zone. The stub models the
common tokens; the remaining boundaries stay documented gaps (#431).
