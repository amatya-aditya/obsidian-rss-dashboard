# ADR 0017: Select Saved Article Templates by Feed, Then Global Default

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-05

## Context and problem

Article Saving has a built-in default note template and a library of saved
templates. Saved templates can be loaded into the built-in editor, but users
cannot manage each template's body and options independently. Feed settings can
also choose a template, while the Reader custom-save modal can save new
templates and assign them to the current feed. Without a clear selection rule,
users cannot tell which template will be used for a save or whether a one-time
choice changes future saves from that feed.

## User stories

1. As a user, I want to edit a saved template without changing other templates,
   so that each one retains its own body and save options.
2. As a user, I want to choose a global default and a feed-specific override,
   so that ordinary saves use my preferred template while selected feeds keep
   their own format.
3. As a user, I want to know before replacing a feed's template assignment,
   so that a one-time choice does not silently change future saves.

For the complete acceptance criteria, see [GitHub Issue #762](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/762)
and its tracking issue [#757](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/757).

## Decision

We will manage each saved template as an independent named template with its
own body, optional folder, and optional filename pattern. Editing one template
does not alter another. When a saved template is the global default, editing
that template intentionally changes the global default because both refer to
the same saved template. The existing Article Saving editor continues to edit
the standalone fallback template, which starts with the built-in template.

Template selection follows this order:

1. Use the template assigned to the configured feed, when one exists.
2. Otherwise, use the selected global default saved template, when one exists.
3. Otherwise, use the built-in fallback template.

Each configured feed has at most one assigned template. A feed assignment is
independent of other feeds from the same publisher. Replacing an assignment
requires confirmation wherever the assignment can change. Declining a
replacement keeps the existing assignment; in the Reader save modal, the
selected template may still be used for the current article only. Replaced
templates remain in the saved-template library. When a new template is created
in the Reader modal for a feed with no existing assignment, the user is still
asked whether to assign it to that feed.

Users can make a newly created or existing saved template the global default.
New-template flows leave the “Make global default” checkbox unchecked by
default. The saved-template editor checks it for the current global default;
unchecking it or deleting that template returns selection to the standalone
fallback. In the Reader custom-save modal, a new template and its default
selection are committed only after the article saves successfully.

The Article Saving settings explain the global default and feed override, and
the per-feed template setting explains that it takes precedence. The
saved-template editor uses Save and Cancel, and template names are unique after
trimming whitespace and ignoring case. Global save settings such as adding the
saved tag and fetching full content remain global rather than becoming
per-template options.

## Consequences

### Benefits

- Users can inspect and edit saved templates without loading them into a
  separate default editor.
- A single visible precedence rule applies across default saves, feed settings,
  and the Reader custom-save modal.
- Replacing a feed assignment is an intentional action, and users can still
  apply a different template to one article without changing future saves.
- Keyboard operation, visible and logical focus, and accessible control names
  and values remain requirements for the settings flow.

### Trade-offs

- Users must distinguish a global default saved template from the built-in
  fallback template.
- Replacing a feed assignment adds a confirmation step, but avoids silently
  changing future saves.

### Existing users and data

- Existing saved templates and feed assignments remain available.
- Existing users without a selected global saved template continue to use
  their current standalone default-template body, including any edits they
  have made to it.
- Creating or editing a template does not automatically assign it to feeds.
- Clearing or deleting the global default does not delete its saved-template
  entry unless the user explicitly deletes it.

## Considered options

### Copy a saved template into the built-in default

Copying would make the default body look familiar in the existing editor, but
would separate the default from the saved template's folder and filename
options. Later edits could leave the copy and saved template out of sync.

### Use a saved-template identity with feed-first precedence (chosen)

Selecting a saved template as the global default keeps its body and options
together. A feed-specific assignment remains an explicit override, while the
built-in template provides a stable fallback.

### Allow multiple template assignments per feed

Multiple assignments would require another selection layer for each article
and make the feed's effective template less predictable. One assignment per
configured feed keeps that choice direct.

## Related

- [ADR 0018 — Generate Safe Article Filenames from Template Patterns](0018-generate-safe-article-filenames-from-template-patterns.md)
- [GitHub Issue #762 — Manage saved templates in Article Saving settings](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/762)
- [GitHub Issue #758 — Reader custom-save templates do not retain their selected folder](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/758)
- [GitHub Issue #757 — Article saving: coordinate save fixes and template customization](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/757)
