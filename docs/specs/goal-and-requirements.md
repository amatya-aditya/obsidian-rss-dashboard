---
id: goals
type: goal-and-requirements
status: draft
title: RSS Dashboard — product goal and requirements
tags: [product]
---

# RSS Dashboard — product goal and requirements

Drafted by reverse-engineering the codebase, `README.md`, `CONTRIBUTING.md`,
`docs/development/`, and `CONTEXT.md`; the non-goals below are the only part
confirmed by a maintainer so far.

## Goal

Turn an Obsidian vault into a private reading system: subscribe to the feeds a
person actually follows, read their full content without leaving Obsidian, and
keep what matters as notes — with every piece of state on the user's own device.

RSS Dashboard is an Obsidian community plugin. It is distributed through the
community directory, so it is subject to Obsidian's plugin review and audit
requirements, and it ships on desktop and mobile.

## Problem

Feed readers keep a person's reading state on someone else's server, and the
notes that outlive the tool live somewhere else again. Obsidian users who
follow blogs, podcasts, and channels have to pick: a reader that holds their
data, or a vault that holds their notes. This plugin makes the vault the
reader, so subscriptions, article state, and saved notes share one store and
one backup story.

## Audience

Obsidian users on desktop and mobile who follow RSS/Atom feeds, podcasts,
YouTube channels, and social accounts, and who want a note-first, local
reading workflow rather than a hosted service. Maintainers and agent
contributors are the secondary audience: the repository is written to be
changed safely, not just used.

## Capabilities

What the plugin does today.

- **Subscribe and refresh.** Feeds, nested folders, OPML import/export,
  per-feed retention, keyword rules, and a scheduled or manual refresh that
  runs as one cancellable global operation.
- **Feed formats.** RSS, Atom, and JSON Feed, plus YouTube channels,
  podcasts, and Mastodon accounts as first-class subscriptions.
- **Read.** A dashboard with card, list, and feed presentations, an inline
  reader and a dedicated Reader view, RSS content first with opt-in fetched
  page content, an image lightbox, podcast chapter markers and a sleep timer,
  and video watch progress read from the nested player.
- **Organize.** Feed-level and article-level tags with a colour palette, read
  and starred state, article filters, and a sidebar search over feeds,
  folders, and tags.
- **Save.** Article-to-Markdown saving through templates with variables,
  frontmatter, per-feed template selection ahead of the global default, and
  association of each saved note with its article.
- **Discover.** A curated Discover catalogue, Kagi Small Web browsing, feed
  discovery from a site URL, and a feed preview before subscribing.
- **Store.** Three storage modes (legacy JSON, Shard v1, Shard v2) with
  migration between them, vault-backed or plugin-local placement, journaled
  user state for multi-device merge, and backups.
- **Move data freely.** OPML, Google-Reader-compatible `starred.json`
  (Inoreader, FreshRSS), split feed/settings bundles, and the combined
  portable bundle.
- **Integrate.** The FreshRSS import path, Mastodon, Apple Podcasts links,
  YouTube RSS resolution, a CORS-proxy fallback, and local image and favicon
  caches.
- **Work everywhere.** WCAG 2.2 AA as the accessibility reference, keyboard
  shortcuts for the dashboard and the reader, popout windows, and mobile
  layouts.

## Non-goals

Excluded by decision; anything not listed here is open, not forbidden.

- **No server, account, or telemetry.** The plugin has no backend of its own,
  no account, no ads, no trackers, and no analytics. It talks to the feed
  servers the user subscribes to and to the documented helpers listed in
  [`docs/SECURITY.md`](../../docs/SECURITY.md) (the CORS-proxy fallback and
  favicon/image requests). Do not add a hosted component or a collection
  channel without overturning this.
- **No API impersonation.** Never spoof a crawler, never bypass a bot
  challenge, and never read site-specific content from anywhere but the page
  the fetch already returned (ADR 0013, narrowed by ADR 0037). A blocked fetch
  is reported as blocked.
- **No sync backend of its own.** Multi-device convergence is the user's
  vault sync (Obsidian Sync or another file-sync tool) plus the plugin's own
  journal and ancestor-merge behavior. Explicit sync-replica work stays a
  tracked issue, not a product contract.

## Principles

- **Local first, private by default.** State lives in the vault or the
  plugin's own folder; a new outbound request needs a documented reason and a
  switch.
- **Obsidian-native and accessible.** Use Obsidian's own components and
  tokens, keep the plugin inside the platform rules (see
  [architecture](../development/architecture.md) and
  [UI design](../development/design-spec.md)), and hold WCAG 2.2 AA on every
  plugin-owned surface.
- **The user's data outlives the tool.** Export formats stay readable without
  the plugin, and an upgrade never strands a vault silently.
