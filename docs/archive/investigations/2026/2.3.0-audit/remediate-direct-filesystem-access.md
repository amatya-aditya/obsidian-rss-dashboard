# Audit & Remediate Direct Filesystem Access — Implementation Plan

## Summary of Approach

Based on user feedback, we will **completely eliminate** all Node.js/Electron `fs` and `path` usages from the production plugin code:

1. **OPML Import**: Migrate desktop & mobile import flows to standard browser `<input type="file" accept=".opml,.xml,.backup">` elements, which use the browser sandbox DOM File API instead of direct filesystem access.
2. **Auto-Backups**: Completely remove the synchronous desktop-only backup method (`performAutoBackupsSyncDesktop()`) which used direct Node.js `fs` access. Auto-backups will now run exclusively via standard asynchronous, cross-platform Obsidian Vault Adapter APIs (`vault.adapter`), which are fully sandboxed.

By doing this, the production plugin code will have **zero direct filesystem access** and **zero Node.js `fs` module dependencies**, achieving 100% sandbox compliance without requiring any security exemptions in `docs/SECURITY.md`.

---

## Detailed Proposed Changes

### 1. OPML Import Dialog Migration

We will remove Electron remote dialogs and Node `fs` imports from:

- [main.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/main.ts#L1204) (in `importOpml()`)
- [src/modals/import-opml-modal.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/modals/import-opml-modal.ts#L173) (in `openFilePicker()`)

Both files will use the standard HTML file input element. This opens the OS file picker natively, runs inside the browser sandbox, is fully cross-platform, and returns a standard `File` object that can be read with `file.text()`.

### 2. Auto-Backup Cleanup

We will clean up the backup service to use only Obsidian APIs:

- **`src/services/backup-service.ts`**:
  - Delete `performAutoBackupsSyncDesktop()` entirely.
  - Remove all inner `activeWindow.require("fs")` and `path` logic.
- **`main.ts`**:
  - Remove the `beforeunload` event listener registration and `this._beforeUnloadHandler` from `onload()`.
  - Remove the `performAutoBackupsSyncDesktop` delegation method.
  - In `onunload()`, call `void this.backupService.performAutoBackups()` directly to perform a best-effort async backup using the vault adapter.

### 3. Test Suite Alignment

- **`test_files/unit/services/backup-service.test.ts`**:
  - Delete the `describe("performAutoBackupsSyncDesktop")` block and all its tests.
- **`test_files/unit/main/plugin-lifecycle.test.ts`**:
  - Remove the tests for `attempts sync backup on desktop` and `falls back to async backup when sync fails`.
  - Update any mocks for `performAutoBackupsSyncDesktop` to reflect its removal.

---

## Proposed File Changes

### [MODIFY] [main.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/main.ts)

- Remove `_beforeUnloadHandler` setup.
- Replace `importOpml` implementation with standard HTML file input picker.
- Remove `performAutoBackupsSyncDesktop` method.
- Update `onunload()` to only trigger `performAutoBackups()`.

### [MODIFY] [import-opml-modal.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/modals/import-opml-modal.ts)

- Replace `openFilePicker` implementation with standard HTML file input picker.

### [MODIFY] [backup-service.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/backup-service.ts)

- Delete `performAutoBackupsSyncDesktop()` method.

### [MODIFY] [backup-service.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/services/backup-service.test.ts)

- Delete `performAutoBackupsSyncDesktop` test suite.

### [MODIFY] [plugin-lifecycle.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/main/plugin-lifecycle.test.ts)

- Remove `performAutoBackupsSyncDesktop` test cases.

---

## Verification Plan

### Automated Tests

Run linting and the test suite:

```powershell
npm run lint
npm run test:unit
```

All unit tests must pass.
