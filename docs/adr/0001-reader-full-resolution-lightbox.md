# ADR 0001: Full-resolution reader lightbox

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-04

## Context and problem

In the article reader, users had no way to view unconstrained full-size images without first saving the article as a Markdown note. Images in the reader are sized to fit the reading column, so detail such as text inside a comic or diagram could be unreadable. The workarounds were to save the article or open it in an external browser, both of which interrupt reading.

We needed to decide how the reader should let someone inspect an image at full resolution without leaving the article.

## Decision

The reader provides its own full-window image lightbox. Clicking or tapping a reader image opens it in an overlay that shows the unconstrained full-size image rather than a downscaled thumbnail or cached asset.

The lightbox shows an instant low-resolution preview and then upgrades progressively to the full-resolution source, so opening an image never feels blocked on the download.

## Consequences

- Reader images gain click/tap listeners that intercept image clicks. Access to an image's external hyperlink is preserved through an action pill inside the lightbox.
- Math/LaTeX formulas, UI icons, and avatars must be carefully filtered out to avoid unintended activations.

## Considered options

### Obsidian `Modal` subclass

Rejected. A standard modal window has a title header and frame borders. These frames feel heavy and obstruct inspection of wide-aspect or tall photos.

### Direct external browser navigation

Rejected. Opening image URLs directly in the default OS browser breaks reading continuity and requires leaving Obsidian.

### Custom full-window lightbox overlay

Chosen, for zero-friction inspection, gesture support (pinch/zoom/pan/swipe-down dismiss), and popout-window compatibility.

## Implementation notes

- The lightbox is mounted to the owning document's body rather than the global document, so it opens in the correct window when the reader is popped out.
- Tiered resolution is used to extract the unconstrained full-size image source.

## Related

- [GitHub Issue #202](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/202) — request to enlarge reader images without saving the article first
- [ADR 0009 — Curated What's New release notes](0009-curated-whats-new-release-notes.md) — reuses this lightbox for release-note images
