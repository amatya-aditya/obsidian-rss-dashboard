# ADR 0029: Record the Version a Save Wrote in the Note

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

Decided in
[#1248](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1248),
which carries the change.

## Date

2026-10-16

## Context and problem

A save writes one of two versions of an article: the feed item's own content
(**RSS content**) or the article page fetched from the link (**Fetched
content**). [ADR 0022](0022-rss-first-reader-content-selection.md) named both
versions and deliberately deferred anything about what a _saved note_ records;
[issue #1183](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1183)
made the version a setting, and
[issue #1184](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1184)
made every save surface announce it. The announcement is transient. Once the
notice is gone, a note saved as Fetched content is indistinguishable from one
saved as RSS content — including the case that matters most, a Fetched content
save whose page could not be fetched and whose note therefore holds feed text.
The note itself carries no record of which of the two it received.

The default template already ships a `source:` row, so a reader might reasonably
expect it to answer this. It does not: `{{source}}` resolves to the feed title,
the same value as `{{feedTitle}}`, and is shipped in the default template and in
user templates, so its meaning cannot be changed without breaking them.

## User stories

1. As a reader, I want a saved note to say which version it holds, so that I can
   tell months later whether it was the feed's text or the article page.
2. As a reader, I want that record to be true, so that a save that fell back to
   feed text is not labelled as the page I asked for.

For the complete acceptance criteria, see
[issue #1248](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1248).

## Decision

A save records the version **written**, not the version requested, in a new
template variable `{{contentSource}}`, which resolves to the same wording the
Default save version setting uses: `RSS content` or `Fetched content`. The
shipped default article template and its frontmatter-only twin gain a
`contentSource: "{{contentSource}}"` row directly after the `source:` row, and so
do the two frontmatter fallbacks used when that setting is empty, in
`ArticleSaver` and in the web viewer. The body-only fallback templates carry no
metadata rows at all, so they are unchanged.

The version is resolved where the content is chosen, not where the version is
requested. A Fetched content save that falls back to the feed item's own text —
a failed or timed-out fetch, a restricted response with no usable body, or a
save failure — writes `RSS content`, because that is what the note holds. A
restricted or truncated page that still returned a body writes `Fetched
content`, because that text did come from the page.

The variable is available in the article note template, the article frontmatter
template, and both web viewer save templates, where it reports `Fetched
content` because a web viewer save has no RSS twin. It is not available in
filename patterns. It is marked `omitIfEmpty`, so a call site that cannot say
which version it wrote leaves the row out rather than guessing; both article
chains and the web viewer set the value, so in practice it is always filled.

The variable is render-only. Nothing new is persisted per article, and no
existing note is upgraded or rewritten: `{{contentSource}}` is a fact about the
save being performed, refreshed into the note whenever that note is next saved.

## Consequences

### Benefits

- The note answers the question itself, without the notice, a stored field, or a
  lookup — the record travels with the file, survives copying and syncing, and
  needs no database.
- The wording comes from `saveVersionLabel`, the same helper the setting's
  options and the notices use, so a note and the UI cannot drift apart.
- The row is a template variable like any other: a reader can place it, rename
  it, or remove it, exactly as they can with `{{source}}` or `{{summary}}`.

### Trade-offs

- The default template changes, so notes saved after upgrading carry one more
  frontmatter row than before. That is a visible change to a shipped default.
- The record is a snapshot of the moment of saving, not live state. If an
  article's version is later switched in the Reader, the note still describes
  what was written; the Reader does not rewrite saved notes
  ([ADR 0022](0022-rss-first-reader-content-selection.md)).
- Distinguishing "written" from "requested" costs one more piece of context to
  thread from the save's content choice into template substitution.

### Existing users and data

- No migration and no backfill. An existing note is unchanged until it is saved
  again, at which point the current template applies as it always has.
- A user template that does not mention `{{contentSource}}` renders exactly as
  before; the new step in the chain is inert unless the placeholder is present.
- `{{source}}` and `{{feedTitle}}` keep their existing meaning and value, so
  shipped and user templates that rely on either are unaffected.

## Considered options

### Reuse `{{source}}` as the version

It is already shipped in the default template, so it would need no new row. It
resolves to the feed title, though, and is used by user templates; repurposing
it would silently change the meaning of every existing template and lose the
feed title it provides today.

### Persist the version on the article and show it in the views

A stored field would let the article list, cards, and feed view show whether an
article was saved as feed text or page text. [ADR 0022](0022-rss-first-reader-content-selection.md)
parked exactly that — a new note-provenance contract and an upgrade path for
existing notes — behind its own ticket and review. The need here is what a note
records about itself, which a template row answers without a schema change.

### A separate row per version

Writing `rss: true` or `fetched: true` would be machine-friendly, but the point
is a note a reader can understand, and it would double the rows to read.
`{{contentSource}}` carries the setting's own words.

### Report the version requested

Simpler, and already resolved at the decision point. It is also wrong in the one
case that matters: the note would claim the page was saved while holding the
feed's text, which is worse than recording nothing.

## Related

- [ADR 0022 — RSS-First Reader Content Selection](0022-rss-first-reader-content-selection.md),
  whose deferred saving decisions this record partially resolves.
- [ADR 0026 — Let a Saved Template Override the Default Save Version](0026-let-a-saved-template-override-the-save-version.md),
  which decides the version a save requests; this record decides what the note
  says about the version it holds.
- [ADR 0018 — Generate Safe Article Filenames from Template Patterns](0018-generate-safe-article-filenames-from-template-patterns.md),
  which draws the filename-pattern boundary the new variable stays outside.
- [GitHub Issue #1248 — Record the version a save wrote in the note via a {{contentSource}} row](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1248)
- [GitHub Issue #1183 — Replace "Save full content" with a "Default save version" setting](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1183)
- [GitHub Issue #1184 — Say which version a save wrote](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1184)
- [GitHub Issue #1185 — Let a saved template override the Default save version](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1185)
