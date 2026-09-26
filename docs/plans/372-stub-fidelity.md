---
status: accepted
created: 2026-09-25
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/372"
milestone: "vNext"
owner: unassigned
workstream: test-infrastructure
sequence: null
depends_on:
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/362"
release_requirement: ""
implementation: ""
---

# Obsidian test stub fidelity

## Goal

Make the unit-test stub of Obsidian (`test_files/stubs/obsidian.ts` and
`test_files/unit/test-dom-polyfills.ts`) behave like real Obsidian, and fix the
production bugs the current divergences hide. The rules the stub follows are in
[ADR 0014](../adr/0014-obsidian-test-stub-fidelity.md). #372 holds the full
audit findings.

## Tracks

The work runs on two tracks, so real bugs aren't held up by test
infrastructure.

### Track A: production bugs (target: 2.7.0 beta.2)

1. Reproduce #372's findings 1 to 4 in real Obsidian. See the
   [reproduction runbook](#reproduction-runbook).
2. File a separate `bug` issue for each finding that reproduces. Don't file one
   for a finding that doesn't; record the result on #372 instead.
3. Fix each bug on its own branch off `dev`. The PR also fixes the stub for
   that one divergence and adds its contract expectation, so the regression
   test fails for the real reason.
4. Bring the fixes into `release/2.7.0` with a merge PR (not a squash) and cut
   beta.2, following **Release Branches** in `CONTRIBUTING.md`.

### Track B: stub fidelity (vNext; joins 2.7.0 only if finished before it goes stable)

In order:

1. **Types (#362).** Type the stub's exports as the real `obsidian.d.ts`, so
   production code type-checks against Obsidian's own API in tests too. Each
   stub class stays private (`NoticeStub`), and its export is cast to the real
   type. A compile-time `StubMatches` check compares every method the stub
   defines with the real one: a mistyped member fails to compile, and a missing
   member fails the test that needs it, at runtime. This clears all of the
   roughly 437 `src/` errors #362 reports. `npm run build` runs the test
   type-check (`scripts/check-test-types.mjs`): `src/`, `main.ts` and the stub
   must have no errors, and test files may not exceed the recorded baseline,
   which is lowered as they are fixed.
2. **Behavior.** One divergence per PR, highest risk first (the order of
   #372's lists). Each PR adds the divergence's contract expectation.
3. **Rest of the audit.** Cover #372's "Suspected, not verified" and "Not yet
   audited" lists the same way.
4. **Drift check (#253).** Run the contract test as one of #253's guardrails.

## Rules for every Track B PR

- **Contract first.** Add the expectation to
  `test_files/stubs/obsidian.contract.test.ts`, with the Obsidian version it was
  observed on, before changing the stub.
- **Reference version.** The stub models the latest stable desktop release,
  pinned in the stub's header comment. It adds a switch only for a verified
  difference in the minimum supported version (1.11.5 after #403) that
  production code must handle.
- **Source.** Never copy Obsidian's code. MIT code from obsidian-test-mocks may
  be copied with an attribution header once the contract expectation passes.
  Note that its `requestUrl` doesn't throw on responses of 400 and above, so
  don't copy that part.
- **Breaking tests.** When a faithful stub breaks a test, fix the production
  code. Never weaken the stub again. If the bug doesn't reproduce in real
  Obsidian, correct the contract expectation instead, with a note.
- **Triage on breakage.** Don't audit the suite up front. When a stub or type
  change breaks a test, fix the test if it checks behavior a user can see.
  Delete it if it only checks wiring (that a mock was called), and list each
  deletion in the PR description.
- **Probes in the repo.** Keep the console probes from the runbook with the
  contract test, so the next audit doesn't depend on a lost scratchpad.

## Follow-ups

- **Mutation testing.** Once Track B is done, try a mutation tester (such as
  Stryker) on two or three critical modules, like feed refresh and article
  saving, to see which tests would catch a real bug. Adopt it only if the
  signal is worth the run time.
- **`Scope` modifiers.** The stub stores a registered hotkey's `modifiers` as
  an array. Real Obsidian appears to store a string. Verify it with a console
  probe before changing the stub.

## Reproduction runbook

This is written for a separate session that drives Obsidian through computer
use.

### Setup

- Use a throwaway vault at `C:\Obsidian\rss-372-scratch`, never
  `C:\Obsidian\Obsidian_Main`. Findings 3 and 4 create, delete, and look up
  folders and `data.json`.
- Install the plugin from `release/2.7.0` (`npm run build`, then copy
  `main.js`, `manifest.json`, and `styles.css` into
  `.obsidian/plugins/rss-dashboard/`).
- Computer use needs Obsidian's hardware acceleration turned off (Settings →
  Appearance). Remind the user to turn it back on afterwards.
- Record the Obsidian version (Settings → About) with every result.
- Run the probes in the DevTools console (Ctrl+Shift+I). Obsidian's console
  exposes the API through `require("obsidian")`.

### Finding 1: `requestUrl` throws on status 400 and above

```js
const { requestUrl } = require("obsidian");
for (const s of [403, 404, 500]) {
  try {
    const r = await requestUrl({ url: `https://httpbin.org/status/${s}` });
    console.log(s, "returned", r.status);
  } catch (e) {
    console.log(s, "threw", e.message, "status=", e.status, Object.keys(e));
  }
}
```

It reproduces if every status throws. Also record whether the error carries a
`status` property: the `catch` branch of `fetchWithProxyFallbackDetailed`
depends on it. For the user-visible effect, configure a proxy, open an article
from a site that blocks with 403 (for example, a Cloudflare-protected one), and
check the console. `Attempting proxy...` should never appear; instead you'll see
`Restricted article fetch blocked (403)`.

### Finding 2: `activeDocument.createDiv()` throws

```js
try {
  const d = activeDocument.createDiv();
  console.log("ok, parent:", d.parentNode);
  d.remove();
} catch (e) {
  console.log("threw", e.name, e.message);
}
```

It reproduces if the call throws `HierarchyRequestError`. For the user-visible
effect, set **Group by** to none and trigger `syncArticleListAfterUpdate` for an
article that isn't in the list but now matches the filter. For example, open the
Starred view and star an article that isn't listed there from another pane.
Watch for an uncaught error and a list that fails to update.

### Finding 3: hidden files aren't indexed

```js
const p = `${app.vault.configDir}/plugins/rss-dashboard/data.json`;
console.log("indexed:", app.vault.getAbstractFileByPath(p));
console.log("on disk:", await app.vault.adapter.exists(p));
```

It reproduces if `indexed` is `null` while `on disk` is `true`. For the
user-visible effect, move metadata storage to a vault folder, choose
**Delete previous copy**, and check whether the old `data.json` is still on
disk.

### Finding 4: `create` and `createFolder` throw on existing paths

```js
await app.vault.createFolder("rss372-probe");
for (const p of ["rss372-probe", "RSS372-Probe"]) {
  try {
    await app.vault.createFolder(p);
    console.log(p, "created");
  } catch (e) {
    console.log(p, "threw", e.message);
  }
}
console.log(
  "case-variant lookup:",
  app.vault.getAbstractFileByPath("RSS372-Probe"),
);
try {
  await app.vault.create("rss372-missing/x.md", "");
} catch (e) {
  console.log("missing parent threw", e.message);
}
```

It reproduces if the second and third calls throw ("Folder already exists.")
and the case-variant lookup returns `null`. For the user-visible effect, create
a folder `RSS Articles`, set the article save folder to `rss articles`, and save
an article. Do the same for the web-viewer integration and the shortcut help
export (`article-saver.ts`, `web-viewer-integration.ts`,
`shortcut-help-modal.ts`). Delete the probe folders afterwards.

### Reporting

Report each finding on #372 in the `AGENTS.md` bug-report format, with the
Obsidian version and the probe output. Ask the user before filing the bug
issues.
