---
id: module-integrations
type: submodule-design
status: draft
title: Service area — external integrations
parent: architecture
---

# Service area — external integrations

## Responsibility

Adapt an external service into something the rest of the plugin understands: a
resolvable feed URL, inherited tags and category, or a platform-specific link
destination.

Entry points: `MediaService` (YouTube RSS resolution, inherited tags and
category), `MastodonService`, `getYouTubeRssFeed`,
`resolveApplePodcastsShowUrl`, `media-tag-inheritance`.

## Boundary

A leaf: no service-to-service imports, consumed by views and utilities. It
owns the knowledge of _how_ a service is addressed — never the fetching
policy, which belongs to the fetch helpers, and never a UI concern.

## Invariants

- **No impersonation.** A service is read through the public feed or page it
  offers; the plugin does not spoof a crawler or call an undocumented endpoint
  to obtain formatted content
  ([ADR 0013](../../docs/adr/0013-render-reddit-posts-from-rss-content.md),
  narrowed by
  [ADR 0037](../../docs/adr/0037-read-site-specific-content-only-from-the-fetched-page.md)).
- **No identity override on any request**
  ([ADR 0025](../../docs/adr/0025-identify-outbound-requests-as-obsidian.md)).
- **Deferred services stay deferred.** YouTube metadata through the Data API
  waits on compliance clearance
  ([ADR 0040](../../docs/adr/0040-defer-youtube-data-api-pending-compliance.md)),
  and FreshRSS stays in core rather than behind a connector boundary until a
  second real consumer exists
  ([ADR 0042](../../docs/adr/0042-keep-freshrss-in-core.md)).
- Mastodon and YouTube resolution return a plain feed URL, so ingestion stays
  service-agnostic.

## Known gaps

Integrations are deliberately partial: no YouTube Data API metadata, no Reddit
feed authentication, and no FreshRSS API client — FreshRSS is reachable only
through the starred-import path. Each is a tracked issue, not an oversight.
