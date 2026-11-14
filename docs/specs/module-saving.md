---
id: module-saving
type: submodule-design
status: draft
title: Service area — saving articles to notes
parent: architecture
---

# Service area — saving articles to notes

## Responsibility

Write one article into the vault as a Markdown note: choose a template,
resolve its variables, render frontmatter and body, pick a safe path, write
the file, and keep the note associated with its article afterwards.

Entry points: `ArticleSaver`, `renderArticleTemplate`,
`buildArticleTemplateValues`, `resolveNoteTemplate`, `ARTICLE_SAVER_*_STEPS`
(`services/article-template/`), `WebViewerIntegration`.

## Boundary

It calls the ingestion area's item-identity and date kernel
(`feed-parser/feed-retention.ts`), the enrichment area's page reads, and
utility modules (dates, tags, safe HTML, Markdown conversion). It never
imports a view or component; the save flow's UI lives in the reader and the
modals.

## Invariants

- **Template selection is feed-first**: a feed's assigned template wins, then
  the selected global saved template, then the built-in one
  ([ADR 0017](../../docs/adr/0017-select-saved-article-templates-by-feed-then-global-default.md)).
- **A template may override the save version**, so a feed can write its own
  version while the rest follow the default
  ([ADR 0026](../../docs/adr/0026-let-a-saved-template-override-the-save-version.md)).
- **Filenames are generated, never replaced**: an optional per-template stem,
  existing article paths preserved, numeric suffixes instead of overwriting a
  different note ([ADR 0018](../../docs/adr/0018-generate-safe-article-filenames-from-template-patterns.md)).
- **The note records what was actually written**, including a fallback to feed
  content, through the `{{contentSource}}` row
  ([ADR 0029](../../docs/adr/0029-record-the-version-a-save-wrote-in-the-note.md)).
- **Association is event-driven.** A saved note is linked through events,
  plugin metadata, and explicit opens; the plugin never probes the vault for a
  note that might exist on another device
  ([ADR 0019](../../docs/adr/0019-saved-note-association-authority.md)).
- A save of a YouTube item produces a playable embed, not only a thumbnail.
- A background rewrite of an existing saved note goes through `vault.process`,
  not `vault.modify` — the point of audit finding V2, which is closed.
