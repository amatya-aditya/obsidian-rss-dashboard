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
