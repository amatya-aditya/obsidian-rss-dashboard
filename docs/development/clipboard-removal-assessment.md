# Clipboard Removal Assessment

Status: decision recorded. Clipboard behavior will be retained; no removal
work is authorized by the post-2.5.0 scorecard remediation. This inventory
records the current source paths and supports a transparent disclosure.

## Decision summary

The plugin does not call `navigator.clipboard.readText()` or otherwise perform
a programmatic clipboard read. Its programmatic access is user-triggered
writing. Removing every listed path would not stop feed fetching, reading,
storage, file-based imports, or download-based exports. It would, however,
remove several sharing/support conveniences, the Reader's formula-source copy
enhancement, and ordinary URL pasting in feed forms if "complete removal" also
means disabling native paste events.

Decision: retain the user-triggered behavior and keep the disclosure accurate.
Do not remove any listed path merely to reduce a disclosure count. The YouTube
iframe permission remains documented as part of the retained behavior and is
not a removal task in this remediation scope.

## Runtime inventory

| ID | Current path and mechanism | User entry point / data | Effect of removal | Replacement or decision | Validation if changed |
| --- | --- | --- | --- | --- | --- |
| C1 | `src/utils/export-utils.ts` `copyTextToClipboard()` calls `navigator.clipboard.writeText()`. It is the shared writer for C2-C5. | Runs only from the invoking button/action. | Removing it requires removing or replacing every consumer; no feed-reading or persistence flow depends on it. | Remove only after deciding the consumer features are unwanted; do not replace it with deprecated `execCommand`. | Unit tests in `test_files/unit/utils/export-utils.test.ts`; consumer tests below. |
| C2 | `src/services/import-export-service.ts` `copyDataJsonToClipboard()`, surfaced by `main.ts` and the **Copy data.json to clipboard** settings button. | Full plugin `data.json` settings copied for user sharing/support. | Removes a support/backup convenience. The existing download export and automatic backup remain. | Remove the button, plugin wrapper, service method, and associated test mock together; preserve download export. | `test_files/unit/services/import-export-service*.test.ts`, `test_files/unit/settings/import-export-settings-tab.test.ts`, manual settings export. |
| C3 | `src/services/import-export-service.ts` `copyUserSettingsJsonToClipboard()`, surfaced by the **Copy usersettings.json to clipboard** button. | Portable user settings excluding feeds, folders, and available tags. | Removes a convenience for sharing preferences; file export remains. | Same removal shape as C2, while retaining `exportUserSettingsJson()`. | Same focused import/export and settings-tab tests; verify serialized file export remains unchanged. |
| C4 | `src/services/import-export-service.ts` `copyOpmlToClipboard()`, surfaced by the **Copy feeds.opml to clipboard** button. | Generated OPML feed list. | Removes quick feed-list sharing; the command and UI download export remain. | Same removal shape as C2, while retaining `exportOpml()`. | Same focused tests; manual OPML download and import round trip. |
| C5 | `src/modals/feed-manager/edit-feed-modal.ts` calls the shared writer for **Copy local storage address**. | A resolved local feed-storage address. | Removes a troubleshooting/navigation shortcut only. | Safe candidate to remove independently if the product wants a smaller scope; remove its icon/button and related styles with the callback. | Edit-feed modal tests/manual verification of the storage-address row. |
| C6 | `src/components/article-list/utils/article-context-menu.ts` directly calls `navigator.clipboard.writeText()` for **Copy article URL** and **Copy feed URL**. | Article link or feed URL selected from a context menu. | Removes familiar sharing actions but does not prevent opening, saving, or managing articles/feeds. | Prefer consolidating through C1 before any broader decision; otherwise remove both menu items and success notices together. | Article context-menu tests and manual menu verification, including items without a feed URL. |
| C7 | `src/utils/math-copy.ts` handles a native `copy` event and writes plain-text and HTML payloads through `event.clipboardData.setData()`. `src/views/reader-view.ts` and `src/views/dashboard-view.ts` register the handler. | User copies a Reader selection containing rendered formulas; the handler preserves retained LaTeX source. | Ordinary browser/Obsidian copy can remain, but copied formulas would no longer be converted to source. This is a Reader fidelity regression, not a core RSS failure. | Keep unless product explicitly retires formula-source copying. Full removal also deletes selection tracking and Reader copy notices. | `test_files/unit/utils/math-copy.test.ts`, Reader/dashboard copy tests if present, and manual mixed text/formula selection in both Reader surfaces. |
| C8 | `src/services/media-service.ts` sets `clipboard-write` in the YouTube iframe `allow` attribute. | Permission is delegated to embedded YouTube content; the plugin itself does not invoke it from this path. | May prevent an embedded player from performing clipboard writes; playback should be unaffected, but embedded YouTube features must be verified. | Investigate first; remove the permission only after confirming no supported embed action needs it. | YouTube embed creation tests and manual desktop/mobile playback plus relevant player interactions. |

## Native paste handling

These are not programmatic reads and do not use `ClipboardEvent.clipboardData`
to inspect clipboard content. They respond after the browser/Obsidian has pasted
text into a normal URL input.

| ID | Current path | Effect of removing the listener | Recommendation |
| --- | --- | --- | --- |

`docs/SECURITY.md` currently describes “Importing feeds via clipboard paste.”
The source inventory found normal URL-input paste handling, not a general
programmatic clipboard import. Any disclosure update should use that narrower,
verifiable description.

## Non-runtime and test references

- `src/styles/settings.css` defines `.rss-dashboard-clipboard-textarea`, but no
  current source reference to that class was found. Treat it as a candidate
  stale style for a separate, verified cleanup—not evidence of clipboard access.
- `test_files/unit/utils/export-utils.test.ts`,
  `test_files/unit/utils/math-copy.test.ts`,
  `test_files/unit/services/import-export-service*.test.ts`, and
  `test_files/unit/settings/import-export-settings-tab.test.ts` exercise or
  mock the runtime paths above. These are test coverage, not additional plugin
  access paths.

## Recorded follow-up

1. Retain C1-C8 and the native paste handling P1-P2 unchanged.
2. Keep public/community disclosure specific: no programmatic clipboard reads;
   writes are user-triggered; ordinary paste remains user-mediated; clipboard
   contents can be sensitive.
3. Reconfirm that disclosure against the published 2.6.0 listing during the
   community rescan. No source, test, CSS, or iframe-permission changes are
   planned for this item.
