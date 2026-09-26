# Obsidian console probes

These probes observe real Obsidian behavior for the stub contract
(`obsidian.contract.test.ts`, ADR 0014). Run them in a throwaway vault, never
a vault with real data, and record the Obsidian version
(**Settings → About**) with each result.

## How to run

- Open DevTools with Ctrl+Shift+I (Cmd+Option+I on macOS) and use the
  **Console** tab.
- `require("obsidian")` doesn't work in the console ("Cannot find module
  'obsidian'"). `requestUrl` is available as the global `window.requestUrl`.
  `app`, `activeDocument`, and `createDiv` are globals too.
- `copy()` only works at the top level of a console command, not inside an
  async function. Store results on `window` and call `copy(window.__probe)`
  afterwards.

## requestUrl throws on status 400 and above

Observed on 1.13.7: every status throws an `Error` with `status` and
`headers` properties. With `throw: false`, the response is returned.

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

Observed on 1.13.7: throws `HierarchyRequestError` ("Only one element on
document allowed"), because the document already has its `<html>` element.
The stack trace shows `createDiv` going through `createEl`, and `createSpan`
is the same Node helper. The global `createDiv()` (a Window helper) returns a
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

Observed on 1.13.7: `getAbstractFileByPath` returns `null` for anything
under a dot folder (including `configDir`), even when it's on disk.

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

## create and createFolder on existing paths

Observed on 1.13.7 (Windows): `createFolder` throws `Folder already exists.`
for an existing path and for a case variant of it. `create` throws `File
already exists.` the same way. `getAbstractFileByPath` is case-sensitive, so
the case variant returns `null` while `adapter.exists` returns `true`.
`create` with a missing parent folder throws `ENOENT`.

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

Observed on 1.13.7 (Windows): `adapter.write` under a missing parent folder
throws an `Error` with `code: "ENOENT"` and the message `ENOENT: no such file
or directory, open '<absolute path>'`. `adapter.mkdir` creates nested folders
and resolves `undefined`, and `exists` then reports them. `adapter.list` sees
folders made by `mkdir` (not only `vault.createFolder`) and returns the full
vault paths of the direct children. After `adapter.write`, `exists` is true
and `getAbstractFileByPath` returns the file.

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
console.log("exists after mkdir", await A.exists(`${root}/m1/m2`));
console.log("list after mkdir", await A.list(root));
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

Observed on 1.13.7 (Windows): `onOpen` runs with `containerEl.isConnected`
true. `close()` detaches `containerEl` first and then runs `onClose`
synchronously, so `isConnected` is false inside `onClose`. `scope` exists,
`headerEl` has class `modal-header` and holds `titleEl`. `modalEl`'s children
are, in order, `modal-header-button mod-raised clickable-icon` (the close
button), `modal-header`, and `modal-content`; there is no
`.modal-close-button`. `containerEl`'s class is `modal-container mod-dim`.

`Modal` isn't a console global. The probe reaches it as the base class of
`app.setting`, the prototype that owns `open`, `close`, `onOpen`, and
`onClose`.

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

## DOM helpers on elements

Observed on 1.13.7 (Windows):

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
console.log(JSON.stringify(r, null, 1));
```

## normalizePath

**Not yet run.** `normalizePath` isn't a console global, so the contract
expectations come from the 1.13.7 source audit (#372): `/` and `\` are both
separators, runs of them collapse to one `/`, leading and trailing separators
are trimmed, an empty path (or one of only slashes) becomes `/`, non-breaking
spaces (U+00A0, U+202F) become spaces, and the result is NFC-normalized.

Observed on 1.13.7 (Windows), indirectly: `fileManager.renameFile(f,
"a//r3.md")` left `f.path` as `a/r3.md`.

This probe reaches `normalizePath` through vault APIs. It only shows the
normalization where the API applies it, so an input that comes back unchanged
means that API doesn't normalize, not that `normalizePath` doesn't. Record the
result of each line.

```js
await app.vault.createFolder("probe-np");
const cases = [
  ["probe-np//double.md", "probe-np/double.md"],
  ["/probe-np/lead.md", "probe-np/lead.md"],
  ["probe-np/trail.md/", "probe-np/trail.md"],
  ["probe-np\\back.md", "probe-np/back.md"],
  ["probe-np/nb sp.md", "probe-np/nb sp.md"],
  ["probe-np/nnb sp.md", "probe-np/nnb sp.md"],
  ["probe-np/café.md", "probe-np/café.md"],
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
for (const [input] of cases) {
  console.log(
    "lookup",
    JSON.stringify(input),
    "->",
    JSON.stringify(app.vault.getAbstractFileByPath(input)?.path ?? null),
  );
}
console.log(
  "root lookups:",
  JSON.stringify(app.vault.getAbstractFileByPath("")?.path ?? null),
  JSON.stringify(app.vault.getAbstractFileByPath("/")?.path ?? null),
);
const target = app.vault
  .getAllLoadedFiles()
  .find((f) => f.path.startsWith("probe-np/") && f.name.endsWith(".md"));
await app.fileManager.renameFile(target, "\\probe-np\\\\renamed café.md/");
console.log("renamed to", JSON.stringify(target.path));
// Expected if renameFile normalizes fully: "probe-np/renamed café.md".
// Clean up: delete probe-np from the file explorer.
```

## Reading a missing file

Observed on 1.13.7 (Windows): `adapter.read` of a missing path throws an
`Error` with `code: "ENOENT"` and the message `ENOENT: no such file or
directory, open '<absolute path>'`. `vault.read` of a `TFile` whose file was
removed on disk through the adapter throws the same way. `vault.cachedRead`,
`vault.readBinary`, and `adapter.readBinary` weren't probed.

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

Observed on 1.13.7 (Windows): a `register` callback runs on `unload()`, and
`unload()` removes a `registerDomEvent` listener (1 click counted before
unload, none after). `addChild` on a loaded parent loads the child at once,
and the parent's `unload()` unloads it (its `onunload` runs, `_loaded` is
`false`). `addChild` on an unloaded parent doesn't load the child; the
parent's later `load()` does.

`Component` isn't a console global. Reach it as the base class of a plugin
instance: the prototype that owns `load`, `unload`, `register`,
`registerDomEvent`, and `addChild`.

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

## Workspace leaves by type

Observed on 1.13.7 (Windows), with rss-dashboard-view, file-explorer, and
backlink leaves open: `getLeavesOfType` returned 0 leaves for `"markdown"` and
for an unknown type, so it filters by view type.
`revealLeaf` is a function, and `getLeaf.length` is 2.
`openViewTypes` lists the open leaves as a check; it was added after the
recorded run.

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

## fileManager.trashFile on a folder

Observed on 1.13.7 (Windows): after `fileManager.trashFile(folder)` where the
folder holds `c.md`, the folder and the child are gone from the vault index,
and `adapter.exists` reports the child gone on disk. Not probed: descendants
nested more than one level down, and `adapter.exists` for the folder itself.

```js
const V = app.vault;
const A = V.adapter;
const root = "probe-trash";
if (await A.exists(root)) await A.rmdir(root, true);
await V.createFolder(`${root}/tf`);
await V.create(`${root}/tf/c.md`, "c");
await app.fileManager.trashFile(V.getAbstractFileByPath(`${root}/tf`));
await new Promise((r) => setTimeout(r, 300));
console.log({
  folder: !!V.getAbstractFileByPath(`${root}/tf`),
  child: !!V.getAbstractFileByPath(`${root}/tf/c.md`),
  childOnDisk: await A.exists(`${root}/tf/c.md`),
});
// Observed: { folder: false, child: false, childOnDisk: false }
// Clean up: await A.rmdir(root, true); then empty the trashed folder from
// the system trash or the vault's .trash folder.
```

## TFile names and adapter paths

Observed on 1.13.7 desktop (Windows): for `dir/my.file.name.md`, `name` is
`my.file.name.md`, `basename` is `my.file.name` (up to the last dot), and
`extension` is `md`. For `dir/noext`, `name` and `basename` are `noext` and
`extension` is `""`. `adapter.getBasePath` is a function that returns the
vault's absolute path, and `adapter.getFullPath("a/b.md")` returns it joined
with the vault path in OS separators (`C:\Obsidian\rss-372-scratch\a\b.md`).
The stub always joins with `/`. Mobile wasn't probed; its adapter has no
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

Observed on 1.13.7 (Windows): `adapter.remove` of a missing path throws an
`Error` with `code: "ENOENT"` and the message `ENOENT: no such file or
directory, unlink '<absolute path>'`. `adapter.remove` of a folder throws an
`Error` with `code: "EPERM"` and the message `EPERM: operation not permitted,
unlink '<absolute path>'`, and the folder stays. Node's `unlink` on Linux and
macOS reports `EISDIR` for a folder instead; that wasn't probed. Removing a
case variant of an existing file's path wasn't probed either.

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
