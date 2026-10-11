# ADR 0021: Store the left-handed layout per device

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-11

## Context and problem

The [Article footer](../../CONTEXT.md#article-footer) in card view and feed view
places the article's action buttons at the left, with Mark read leftmost, and
the date at the right. A left-handed user holding a phone in the left hand must
reach across the card to tap Mark read.

Issue [#910](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/910)
asked for a left-handed layout, and
[#986](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/986)
specifies a **Left-handed layout** toggle in Settings → Display that shows the
mirrored footer — the date at the left, then the buttons extending leftward with
Mark read at the far right — in card view and feed view only.

Almost every display preference lives in the synced `data.json`, where it
follows a vault across devices. This preference is different: reaching for the
near edge is a property of the hand holding this device, not of the vault. A
synced value would move the footer on a user's desktop the moment they enabled
it on their phone. The project has to decide where a device-specific display
preference belongs.

## User stories

1. As a left-handed user, I want the Mark read button within my left thumb's reach, so that I do not reach across the card.
2. As a user who syncs one vault across a phone and a desktop, I want this setting kept per device, so that turning it on for my phone does not flip my desktop.
3. As a contributor, I want the setting to never reach the synced settings file, so that the per-device guarantee cannot silently regress.

For the complete set of user stories for this feature, see
[GitHub Issue #986](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/986).

## Decision

Store the Left-handed layout setting in vault-local storage — Obsidian's
per-vault `localStorage` — rather than the synced settings file. It is a single
boolean, off by default, read at render time under the namespaced key
`rss-left-handed-layout`. An absent key, `null`, or any value other than `true`
means off.

The setting is not added to the synced settings interface, its defaults, or its
normalization, so no code path can write it to `data.json` or into the exported
user preferences.

## Consequences

### Benefits

- The preference follows the device rather than the vault, so enabling it on a phone leaves a desktop unchanged.
- The synced settings file, the [Settings bundle](../../CONTEXT.md#storage), and settings export stay free of a preference that is meaningless off its device.
- Vault-local storage is already the plugin's mechanism for per-vault UI state, so the change reuses an existing seam instead of extending the settings schema.

### Trade-offs

- The setting lives outside the settings interface, so its contract is held by a namespaced key and a small helper rather than by the settings type.
- It does not appear in exports and does not travel to a new device; a user enables it again on each device where they want it.
- A reader of `data.json` cannot discover the setting there, so the toggle's description must state that it is per device.

### Existing users and data

- No existing data is migrated. The key is new, and an absent value reads as off, which is the current footer behavior.
- `data.json`, the [Settings bundle](../../CONTEXT.md#storage), and the feed bundle are unchanged, so imports and exports behave exactly as before.

## Considered options

### Store the setting in the synced settings file

Rejected. This is the default home for display settings, but it would flip the footer on every device sharing the vault. The point of the setting is to match the device in hand, so syncing it would defeat the request.

### Replace the toggle with a single footer-layout dropdown

Rejected. The origin issue considered one "footer layout" dropdown, but the request is binary — standard or mirrored — and a dropdown would add states to maintain and test without adding a choice users asked for.

### Store the setting in vault-local storage

Chosen. It keeps the preference on the device where the user set it, reuses the existing vault-local storage helper, and cannot leak into the synced settings file.

## Historical precedent

Obsidian's vault-local storage is its home for per-vault, per-device UI state, and the plugin already uses it for the Discover filters and the first-launch coachmark. The single boolean follows that pattern.

## Implementation notes

- The value is exposed through `loadLeftHandedLayout` / `saveLeftHandedLayout` in `src/utils/left-handed-layout.ts`, keyed by `LEFT_HANDED_LAYOUT_STORAGE_KEY` (`rss-left-handed-layout`).
- The article-list component reads the value at render time and adds one modifier class (`rss-dashboard-mirrored-footer`) to the articles-list root; the mirroring is scoped CSS that sets `direction: rtl` on the footer and restores it on the date, so only the rendered order reverses. The document order stays read → save → star → tags, so Mark read is the far-right icon and still the first footer Tab stop: focus enters at the primary action and moves leftward with the icons, which is what the glossary means by the keyboard order matching the visual order. See [ADR 0016](0016-wcag-22-aa-accessibility-reference.md).
- The key is registered with the factory-reset local-storage set, so a reset returns the layout to off.

## Related

- [ADR 0016 — Use WCAG 2.2 AA as the accessibility reference](0016-wcag-22-aa-accessibility-reference.md)
- [GitHub Issue #986](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/986) — Left-handed layout implementation spec
- [GitHub Issue #910](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/910) — origin request
- [Domain glossary](../../CONTEXT.md#article-footer)
