# ADR 0027: Merge imported settings one group deep

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-16

## Context and problem

A preferences import merges the imported file over the current settings. The
merge is shallow: the file is spread over the top-level keys only, so any nested
settings group the file carries replaces the current group whole. Importing a
hand-edited or trimmed file that holds, say, only `articleSaving.defaultFolder`
therefore drops the user's `fetchTimeout`, `defaultTemplate` and `savedTemplates`
silently.

The settings migration that runs after an import repairs only some groups
(`display`, `keywordRules`, `autoBackup`, `dashboardMultiFilters`), and repairs
them to their _defaults_ rather than to the user's current values. `media`,
`readerFormat`, `highlights` and `articleFilter` get no repair at all. Issue
#1191 reports the `articleSaving` case; the same shallow merge exposes every
group.

## Decision

On a preferences import — both the [Replacing import](../../GLOSSARY.md#import-and-export)
and the [Overwriting import](../../GLOSSARY.md#import-and-export) — merge each
affected nested settings group one level deep: the current group's keys first,
then the imported group's keys. A key the file omits keeps its current value; an
array the file carries replaces the current array wholesale. The affected groups
are `articleSaving`, `media`, `readerFormat`, `highlights` and `articleFilter`.

Each group's legacy migration runs on the _imported_ group before the merge, so
an imported legacy key is not masked by the current group's modern value — for
example an imported `articleSaving.saveFullContent: false` still means
[RSS content](../../GLOSSARY.md#language) even when the current setting is
Fetched content.

The four groups already repaired after import keep that behaviour for now. The
import path gains no scalar or feed validation beyond merging the groups.

## Consequences

### Benefits

- A trimmed or hand-edited preferences file changes only the settings it
  carries; nothing else is lost.
- The rule matches what the import already does for the top-level settings, and
  matches the contract the confirmation dialog states ("keys the file omits are
  kept on import").

### Trade-offs

- The merge is one level deep, so an object-of-objects such as
  `folderFeedSortOrders` still replaces wholesale.
- The rule applies to a named list of groups, so a new group is covered only
  once it is added to that list.
- `display`, `keywordRules`, `autoBackup` and `dashboardMultiFilters` remain
  inconsistent with the rule until a later change.

### Existing users and data

- No stored data is migrated. The change affects only how future imports are
  applied.
- A file that carries complete groups imports exactly as before.

## Considered options

### Recurse into nested objects

Rejected. A deeper merge makes the effect of an import harder to predict, and
the only object-of-objects values (`folderFeedSortOrders` and the sort orders)
are meaningful as whole values.

### Reuse the load-time normalization

Rejected. It merges each group against the defaults, not against the current
settings, so it cannot keep what the file omits. It also clamps values and runs
repairs that do not belong on a merge.

### Repair every group in the post-import migration

Rejected. By the time that migration runs the current group has already been
overwritten, so it can restore defaults but not the user's values. The merge has
to happen where both the current and the imported group are still available.

### Merge one level deep on import (chosen)

Chosen. It keeps the current value for everything the file omits, is applied
where both sides are available, and is one rule across the affected groups.

## Implementation notes

- The affected groups are listed once, so the rule is visible in one place.
- The legacy per-group migrations must run on the imported group before it is
  merged, or the current group's value masks the imported legacy key.

## Related

- [GitHub Issue #1191](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1191) — the reported defect
- [GitHub Issue #1214](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1214) — the settings bundle import has the same shallow merge and needs its own decision
- [Domain glossary](../../GLOSSARY.md#import-and-export)
