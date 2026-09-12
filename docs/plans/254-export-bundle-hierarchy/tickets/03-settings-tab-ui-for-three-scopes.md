# 03: Settings-tab UI for all three JSON scopes + OPML

**Parent:** #254

**Status:** done

**Blocked by:** 02 — importFeedBundle / importSettingsBundle (done)

## What to build

A user-facing way to pick an export/import scope, matching the decision tree in the plan doc: Portable data bundle (everything), Feed bundle, Settings bundle, or OPML — no platform restriction between desktop and mobile.

Each of the three JSON scopes (Portable data bundle, Feed bundle, Settings bundle) gets symmetric export and import controls, wired to the plugin methods from tickets 01/02 (`buildPortableDataBundle`/`importPortableDataBundle` already exist; `buildFeedBundle`/`buildSettingsBundle`/`importFeedBundle`/`importSettingsBundle` are new). OPML export/import stays as its existing, separate, orthogonal path — unchanged by this ticket.

This ticket does not deduplicate the existing button duplication between the Storage tab and the Import/Export tab — that's explicitly out of scope for this plan (tracked as separate follow-up work). Add the new scopes wherever the existing portable-bundle controls already live, on both tabs, consistent with today's duplication.

## Acceptance criteria

- [x] A user can export a Feed bundle, a Settings bundle, or the combined Portable data bundle independently, in addition to the existing OPML export.
- [x] A user can import each of the three JSON scopes back in, matching what was exported (symmetric import per bundle, per the plan doc's "no bundle you can't import back" decision).
- [x] The four choices and their labels match the plain-language decision tree in `docs/plans/254-export-bundle-hierarchy.md` ("Export everything", "Feed bundle", "Settings bundle only", "OPML export").
- [x] No platform gating — all four options are available on both desktop and mobile.
- [x] UI/interaction tests cover the new scope options; existing settings-tab navigation tests are updated if tab structure changes.

## Implementation notes

- `ImportExportService` (`src/services/import-export-service.ts`) gained `exportFeedBundle`/`importFeedBundleFromFile` and `exportSettingsBundle`/`importSettingsBundleFromFile`, mirroring the existing portable-bundle pair. Both export methods throw a clear error (`"... export is not available in this context"`) rather than silently serializing `undefined` when their provider isn't wired — a gap the existing portable-bundle export didn't have to worry about because it has a `?? { settings }` fallback; there's no equivalent sensible fallback for a feed-only or settings-only bundle.
- `main.ts` gained `getFeedBundle`/`getSettingsBundle` (delegating to `FeedStorageRepository.buildFeedBundle`/`buildSettingsBundle`), `applyFeedBundleImport`/`applySettingsBundleImport` (mirroring `applyPortableDataBundleImport`), and public `exportFeedBundle`/`importFeedBundleFromFile`/`exportSettingsBundle`/`importSettingsBundleFromFile` methods.
- New buttons ("Import feed bundle", "Export feed bundle", "Import settings bundle", "Export settings bundle" — sentence case per `eslint-plugin-obsidianmd`) were added to the Storage tab's existing "Storage actions" button group (`src/settings/tabs/storage-settings-tab.ts`) and as new sections on the Import/Export tab (`src/settings/tabs/import-export-settings-tab.ts`), immediately after the existing "Shard data" (Portable data bundle) section. No tab was added or removed, so `settings-tab-navigation.test.ts`/`settings-tab-orchestrator.test.ts` needed no changes.
- Per the ticket's explicit scope, the existing Storage-tab/Import-Export-tab button duplication was left as-is; the new buttons follow the same duplicated pattern.
- No platform gating was added anywhere in this change (verified: no new `Platform.*`/`isMobile` branches around the new buttons or methods).
