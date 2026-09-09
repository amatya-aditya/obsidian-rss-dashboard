---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 9
depends_on: []
release_requirement: ""
implementation: ""
---

# 09: Export FreshRSS subscription OPML

**What to build:** Add a dedicated FreshRSS subscription export that produces
an artifact FreshRSS can import, preserves as much category placement as its
flat model permits, warns about deterministic duplicate collapse, and never
pretends to archive article state.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The export is a separate FreshRSS profile and does not change the generic
      RSS Dashboard OPML export.
- [ ] The artifact is valid UTF-8 OPML 2.0 and each feed outline contains
      `text`, `title`, `type="rss"`, and the exact `xmlUrl`.
- [ ] `htmlUrl` or description appears only when RSS Dashboard already has a
      reliable value.
- [ ] Uncategorized feeds are emitted directly under the OPML body.
- [ ] Nested local folder paths become one flat FreshRSS category by escaping
      `%` as `%25` and `/` as `%2F` inside each segment, then joining segments
      with `/`.
- [ ] Identical feed URLs collapse deterministically; the first feed in stable
      dashboard order supplies metadata and every collapse is reported as a
      warning.
- [ ] XML metacharacters in titles, URLs, descriptions, and categories are
      escaped without changing the underlying values after parsing.
- [ ] The artifact contains no credentials, sessions, tokens, settings,
      sidecar data, article bodies, read/starred state, dashboard tags,
      FreshRSS labels, saved-note state, or `frss:*` extensions.
- [ ] UI copy consistently calls the artifact a FreshRSS subscription export
      and states that it is not an article-state backup.
- [ ] Unit tests cover XML validity, optional fields, escaping, flat projection,
      uncategorized feeds, stable ordering, duplicate warnings, empty input, and
      excluded data.
- [ ] Existing generic OPML tests continue to pass unchanged.
- [ ] Focused tests, lint, platform checks, type checking, the complete build,
      and final generated-artifact inspection pass.
