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
