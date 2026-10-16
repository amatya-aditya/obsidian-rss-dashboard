# ADR 0026: Let a Saved Template Override the Default Save Version

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-15

## Context and problem

A save writes one of two versions of an article: the feed item's own content
(**RSS content**) or the article page fetched from the link (**Fetched
content**). [ADR 0022](0022-rss-first-reader-content-selection.md) and
[GitHub Issue #1183](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1183)
made that a named **Default save version** setting, but kept it global.
[ADR 0017](0017-select-saved-article-templates-by-feed-then-global-default.md)
recorded the same choice: global save options such as the saved tag and fetching
full content stay global rather than becoming per-template options.

One global answer does not suit every feed. A reader who saves RSS content by
default may still want a feed whose own content is thin — a GitHub releases
feed, for example — saved from the fetched page, or the reverse for a feed whose
page is behind a paywall. Saved templates can already be assigned to a feed and
already carry that feed's folder and filename, so they are the natural place for
a per-feed version too.

A second problem is visibility. If a feed silently writes a different version
from the setting, the reader is surprised. [GitHub Issue #1184](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1184)
already made the save tooltips and the post-save notice name the version a save
writes, resolved per article, so an override can be shown wherever a save
happens.

## User stories

1. As a reader, I want one feed's saves to write a different version from my
   default, so that a feed with thin content or a richer page is saved the way
   it deserves.
2. As a reader, I want to know which version a save will write, so a per-feed
   override is never hidden.

For the complete acceptance criteria, see
[GitHub Issue #1185](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1185).

## Decision

A saved template gains an optional **Save version**. The saved-template editor
offers three choices:

- **Use Default save version (<the current default>)** — the default for new and
  existing templates, stored as an absent field;
- **RSS content**;
- **Fetched content**.

The version a save writes follows one precedence rule, highest first:

1. the version set by the template applied to the article — the feed's assigned
   template when it has one, otherwise the global default saved template;
2. the **Default save version** setting.

There is no cascade: a feed-assigned template that leaves the field unset
follows the setting, not the global default template's version, because only one
template applies to an article. The first option's label names the setting it
falls back to, so the precedence is visible where the choice is made.

The web viewer saves a page rather than a feed item, so its save flow neither
shows nor applies the field.

## Consequences

### Benefits

- A feed keeps its save version beside the folder and filename it already
  carries, and no new menu item or per-feed setting is needed.
- One resolver, `resolveSaveVersion`, answers for the saver, both readers, the
  dashboard, and every tooltip and notice, so a per-feed override appears
  everywhere at once.
- The field is optional and absent by default, so existing templates and
  exported settings load and behave as before.

### Trade-offs

- The setting and one feed's behavior can differ, which is deliberately hidden
  precedence. The template editor's first option names the setting it follows,
  and the save surfaces name the resolved version per article.
- A template now carries one content decision as well as presentation, on top of
  the folder and filename it already governed.
- The template type is shared with the web viewer save flow, which must keep
  ignoring the field.

### Existing users and data

- Existing saved templates load with no version and follow the **Default save
  version** setting, so their saves are unchanged.
- No migration is needed: an absent field is the "use the setting" state, and an
  unknown value is ignored in favor of the setting.
- Settings export and import carry the whole `articleSaving` group, so the field
  round-trips; an older export without it still imports.

## Considered options

### A per-feed save-version setting outside templates

A separate per-feed setting would say plainly what it does, but it adds another
place to configure a feed next to the template that already holds the feed's
folder and filename, and it splits one feed's save behavior across two screens.

### A one-off version choice in the save dialog

A per-save choice would fit the existing custom-save dialog, but it makes the
common case a per-save decision and does not express a feed's standing
preference. [GitHub Issue #1183](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1183)
closed the dialog's version choices, and
[GitHub Issue #1184](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1184)
kept the closed set: the setting, optionally overridden by the applied template.

### Version in the saved template (chosen)

The template is already how a feed gets its own folder and filename, so reusing
its assignment adds no new menu item, needs no migration, and lets one resolver
keep every save surface in step.

## Related

- [ADR 0017 — Select Saved Article Templates by Feed, Then Global Default](0017-select-saved-article-templates-by-feed-then-global-default.md),
  whose decision that save options stay global this ADR revises for the save
  version.
- [ADR 0018 — Generate Safe Article Filenames from Template Patterns](0018-generate-safe-article-filenames-from-template-patterns.md)
- [GitHub Issue #1185 — Let a saved template override the Default save version](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1185)
- [GitHub Issue #1183 — Replace "Save full content" with a "Default save version" setting](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1183)
- [GitHub Issue #1184 — Say which version a save wrote](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1184)
