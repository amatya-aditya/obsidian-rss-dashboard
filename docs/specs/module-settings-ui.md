---
id: module-settings-ui
type: submodule-design
status: draft
title: Package — settings UI
parent: architecture
---

# Package — settings UI

## Responsibility

Render the plugin's settings tab: one `PluginSettingTab` with a manual tab bar
that switches between per-tab render functions (general, display, sidebar,
media, tags, highlights, rules, article saving, import/export, storage, about),
plus the shared row helpers, proxy checks, version status bar, and
template-variable help.

Entry points: `RssDashboardSettingTab` and the `render*SettingsTab` functions
in `tabs/`, each taking a narrow `*SettingsPlugin` interface; `tab-names.ts`
as the tab catalog; `settings-ui-compat.ts` for Obsidian version shims;
`storage-settings-sections` for the storage controls.

## Boundary

Eight settings modules are on the `main.ts` importer ratchet, of which seven are
runtime: they reach through the plugin for the settings object and service
calls. The direction is toward the narrow interface — a tab declares the
settings fields and methods it needs, and `settings-ui-compat` isolates the
version-dependent UI calls.

One cross-package edge exists in this direction: `src/utils/domain-icon-helpers.ts`
imports `settings-ui-compat`. It is one of several upward utils edges, all
recorded in [the utils spec](./module-utils.md).

## Invariants

- **One tab catalog.** `tab-names.ts` is the single list of tabs; adding a tab
  is an entry there plus its render function, not a second switch.
- **Obsidian settings conventions**: no top-level plugin heading, section
  headings through `setHeading`, no "settings" in a heading, sentence case.
- **Narrow interfaces over the plugin class** — a tab that needs a new plugin
  member widens its own interface, not the ratchet.
- **Storage controls reflect the active mode**; they never offer an action the
  current mode cannot perform.
