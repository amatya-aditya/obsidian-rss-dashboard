# 03: Settings-tab UI for all three JSON scopes + OPML

**Parent:** #254

**Status:** ready-for-agent

**Blocked by:** 02 — importFeedBundle / importSettingsBundle

## What to build

A user-facing way to pick an export/import scope, matching the decision tree in the plan doc: Portable data bundle (everything), Feed bundle, Settings bundle, or OPML — no platform restriction between desktop and mobile.

Each of the three JSON scopes (Portable data bundle, Feed bundle, Settings bundle) gets symmetric export and import controls, wired to the plugin methods from tickets 01/02 (`buildPortableDataBundle`/`importPortableDataBundle` already exist; `buildFeedBundle`/`buildSettingsBundle`/`importFeedBundle`/`importSettingsBundle` are new). OPML export/import stays as its existing, separate, orthogonal path — unchanged by this ticket.

This ticket does not deduplicate the existing button duplication between the Storage tab and the Import/Export tab — that's explicitly out of scope for this plan (tracked as separate follow-up work). Add the new scopes wherever the existing portable-bundle controls already live, on both tabs, consistent with today's duplication.

## Acceptance criteria

- [ ] A user can export a Feed bundle, a Settings bundle, or the combined Portable data bundle independently, in addition to the existing OPML export.
- [ ] A user can import each of the three JSON scopes back in, matching what was exported (symmetric import per bundle, per the plan doc's "no bundle you can't import back" decision).
- [ ] The four choices and their labels match the plain-language decision tree in `docs/plans/254-export-bundle-hierarchy.md` ("Export everything", "Feed bundle", "Settings bundle only", "OPML export").
- [ ] No platform gating — all four options are available on both desktop and mobile.
- [ ] UI/interaction tests cover the new scope options; existing settings-tab navigation tests are updated if tab structure changes.
