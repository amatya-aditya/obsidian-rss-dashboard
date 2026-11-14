---
id: module-discover
type: submodule-design
status: draft
title: Package — discover data layer
parent: architecture
---

# Package — discover data layer

## Responsibility

Provide the Discover and Kagi Small Web data together with the DOM fragment
that renders a result set: `renderDiscoverFeedResults` builds the result cards,
and `smallweb-atom-feed-parser.ts` reads the Small Web Atom feed.

## Boundary

No services, no settings, no plugin or view access — a caller passes a
container element and data. It does render DOM (`setIcon`, `DOMParser`) and
uses the shared pagination helper, so "data layer" means "no plugin access",
not "no UI". Keeping it free of services is what makes it callable from any
view or test.

## Invariants

- The catalogue is static data, not a service the plugin calls at runtime.
  Adding a remote catalogue would be a new outbound request and needs the
  security disclosure updated.
- Small-web parsing tolerates the Atom shapes real blogs emit and returns the
  same result model the Discover view renders, so the two discovery surfaces
  share one presentation.
