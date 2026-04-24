# Saved Articles Lose `saved` Status While File Still Exists In Vault

Last updated: April 24, 2026

## Summary

This bug is now understood and fixed locally.

The article save itself was succeeding, `savedFilePath` was being persisted to `data.json`, and the saved markdown file still existed in the vault. The actual failure happened later during plugin startup: `validateSavedArticles()` ran too early in `onload()`, before saved article files could be resolved reliably, and it cleared valid saved state. That bad cleared state was then written back to `data.json`.

The validated local fix is to defer startup saved-article reconciliation until Obsidian layout is ready.

## User-Observed Reproduction

Original repro:

1. Save an article from the plugin.
2. Verify the markdown file exists in the Obsidian vault.
3. Close Obsidian.
4. Reopen Obsidian.
5. The article file is still present, but RSS Dashboard no longer shows the article as saved.

This reproduced even when waiting much longer before closing and reopening Obsidian, which weakened the original “closed too fast before `data.json` wrote” theory.

## What PR `#106` Had

The other user's PR addressed real contributing issues, but not the final root cause.

Work that PR and follow-up investigation covered:

- preserve `savedFilePath` more consistently during save flows
- preserve `savedFilePath` across feed refresh / merge behavior
- add regression coverage around those persistence and refresh theories

Why that was not enough:

- a clean repro of branch `crazyrokr/fix-saved-articles` still failed in real Obsidian usage
- runtime tracing later showed the saved state survived save and persistence, then was cleared on startup validation

Conclusion:

- PR `#106` improved part of the problem space
- but it did not fix the startup timing bug that was actually clearing saved state after reload

## What We Proved

Using temporary targeted runtime logging for one saved Ars article, we observed:

1. `ArticleSaver.saveArticle()` created the markdown file successfully.
2. `saveSettings()` completed successfully.
3. `data.json` contained:
   - `saved: true`
   - the correct `savedFilePath`
4. On the next Obsidian restart, `loadSettings()` still loaded the correct saved state from `data.json`.
5. `fixSavedFilePaths()` did not clear the article.
6. `validateSavedArticles()` was the first code path that flipped the article from saved to unsaved.

The important trace sequence was:

- `loadSettings:afterLoadData` -> still saved
- `loadSettings:afterNormalize` -> still saved
- `loadSettings:afterDedupe` -> still saved
- `onload:afterFixSavedFilePaths` -> still saved
- `validateSavedArticles:beforeClear` -> lookup failed
- `validateSavedArticles:afterClear` -> saved state removed

That proved the bug was not:

- save-time persistence loss
- `data.json` write failure
- reload-time settings loss

It was specifically:

- startup validation clearing correct saved state because file lookup happened too early during plugin startup

## Root Cause

Before the fix, startup did this inside `onload()`:

1. load settings
2. immediately run `fixSavedFilePaths()`
3. immediately run `validateSavedArticles()`

For some saved articles, that early validation happened before file resolution was reliable, so `checkSavedFileExists()` returned false even though the vault file really existed. `validateSavedArticles()` then:

- set `saved = false`
- cleared `savedFilePath`
- removed the `Saved` tag
- persisted the cleared state back to `data.json`

## Local Fix That Worked

Implemented in [main.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/main.ts:201).

What changed:

- extracted startup saved-article reconciliation into `reconcileSavedArticlesOnStartup()`
- scheduled that reconciliation through `workspace.onLayoutReady(...)`
- prevented duplicate startup validation with a one-time guard

Behaviorally, the fix is:

- do not validate saved articles immediately during early `onload()`
- wait until Obsidian layout is ready
- then run `fixSavedFilePaths()` and `validateSavedArticles()`

This local fix was manually validated: the saved article now stays marked saved after restart.

## Regression Coverage Added

Regression coverage was added so startup validation is no longer allowed to run too early.

Relevant test:

- [test_files/unit/main/plugin-lifecycle.test.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/main/plugin-lifecycle.test.ts:454)

Supporting test-stub update:

- [test_files/stubs/obsidian.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/stubs/obsidian.ts:249)

The new regression verifies:

- `onload()` does not immediately run saved-article startup validation
- validation runs only after simulated layout readiness

## Temporary Diagnostic Work Completed

Temporary trace logging was added to prove the lifecycle behavior around:

- `ArticleSaver.saveArticle()`
- `saveSettings()`
- `loadSettings()`
- `validateSavedArticles()`
- refresh merge behavior

Those diagnostics were useful to prove the root cause, but they are temporary investigation code and should be removed once the fix is finalized and no longer needs live tracing.

## Remaining Follow-Up: Truncated Saved Article Titles

This is a separate bug and should be addressed next.

Current behavior in [article-saver.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/article-saver.ts:10):

- filename generation keeps only the first 5 words
- then truncates to 50 characters

Current code:

- `const words = sanitized.split(" ");`
- `const shortened = words.slice(0, 5).join(" ");`
- `return shortened.substring(0, 50);`

Why this is still a bug:

- the saved article filename does not preserve the real article title
- fallback path reconstruction depends on that truncated filename behavior
- this creates brittleness and can make saved article lookup harder to reason about
- it was part of the context around the original PR, but it is not fixed by the startup-validation change

Recommended next task:

- redesign saved article filename generation so it does not arbitrarily truncate to the first 5 words
- update any lookup / fallback logic and regression tests to match the new filename policy

## Status

Saved-state-loss bug:

- root cause confirmed
- local fix implemented
- manually validated as fixed

Truncated-title bug:

- still open
- recommended next follow-up
