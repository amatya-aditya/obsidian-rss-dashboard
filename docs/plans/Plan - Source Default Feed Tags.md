**Plan - Source Default Feed Tags**

Add source-aware feed-tag defaulting to the feed add/edit modals by reusing the existing preview detection path that already drives auto-folder assignment. The recommended approach is one shared helper that maps a resolved preview result plus media settings into default tag names, then both modals use it only when the feed currently has no custom tags and the user has not manually changed tags in the modal.

**Steps**

1. Add a shared source-to-tag resolver near the existing preview-folder logic in feed-preview-loader.ts. This helper should accept the preview result, available tags, and media settings, then return ordered tag names for Twitter, Mastodon, YouTube, Podcast, Video, or RSS using the same configured-tag precedence already used by media-service.ts. This blocks the modal changes.
2. Refactor tag-default resolution so modal defaulting and item-level media tagging share the same decision rules. Preferred approach: expose or extract the configured-tag lookup from media-service.ts instead of duplicating Mastodon and Twitter logic in each modal.
3. Update add-feed-modal.ts so a successful Load call applies detected source-default tags into the modal tag picker only when the tag state is still untouched. Track a small local flag for manual tag edits. Because the current tag picker is initialized from a snapshot, the modal will need to rebuild or rerender that control after auto-defaulting.
4. Update edit-feed-modal.ts with the same detection path, but only seed source-default tags when the feed starts with no customTags and the user has not manually changed tags during the current modal session. Existing feed.customTags stay authoritative, and pressing Load again after a manual edit must not overwrite the current modal selection.
5. Add regression tests in add-feed-modal.test.ts and edit-feed-modal.test.ts. Cover at least:
6. Mastodon preview seeds defaultMastodonTags in Add Feed.
7. Mastodon preview seeds defaultMastodonTags in Edit Feed only when feed.customTags is empty.
8. Existing customTags in Edit Feed are preserved.
9. A manual modal tag change is not clobbered by a later Load call.
10. Run focused verification on the two modal suites first, then any narrow follow-up test command the repo already uses for modal coverage.

**Relevant files**

- tags-settings-tab.ts: source of the default Mastodon, Twitter, YouTube, Podcast, RSS, and smallweb tag settings
- add-feed-modal.ts: current add-flow that already uses preview detection for folder assignment
- edit-feed-modal.ts: current edit-flow with existing customTags initialization and confirm-modal behavior
- feed-preview-loader.ts: best existing place for preview-result interpretation because it already maps detection to default folders
- media-service.ts: existing configured-tag resolution and item-level media tag application logic
- tag-multi-select-control.ts: current tag picker behavior that will require a controlled rerender strategy
- add-feed-modal.test.ts: existing Mastodon load-path tests and tag-selector helpers
- edit-feed-modal.test.ts: existing tag prepopulation and confirm-modal tests

**Verification**

1. Run the Add Feed modal tests and confirm a Mastodon preview now seeds the configured default Mastodon tag names into the save payload when the user does not manually change tags.
2. Run the Edit Feed modal tests and confirm source-default seeding happens only for feeds without existing customTags, while feeds with existing customTags and manually edited modal tags remain unchanged after additional Load actions.
3. If needed, run the narrowest repo test command that covers those modal suites and note unrelated failures separately.
4. Manual smoke-check in Obsidian: set a default Mastodon tag in settings, open Add Feed with a Mastodon profile URL, press Load, verify the Auto-tag control pre-populates; repeat in Edit Feed for an untagged feed and an already-tagged feed.

**Decisions**

- Included: add/edit modal source-default tag seeding using existing preview detection
- Included: Mastodon specifically, with the same shared path covering Twitter/X, YouTube, podcast, video, and RSS where detection already exists
- Excluded: changing item-level tagging during parsing or refresh
- Confirmed: in Edit Feed, only initialize from source defaults when the feed currently has no customTags
- Confirmed: after manual tag changes in the modal, pressing Load again must not overwrite them

The plan is saved to session memory and ready for handoff. If you want, I can revise the plan before implementation, but the current version is specific enough to execute directly.
