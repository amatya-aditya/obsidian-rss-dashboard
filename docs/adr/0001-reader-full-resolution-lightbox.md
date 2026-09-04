# Full-Resolution Reader Lightbox

In the article reader, users previously had no way to view unconstrained full-size images without saving the article as a markdown note. We decided to implement a custom full-window Reader Lightbox mounted to the owning document body, using tiered resolution to extract the unconstrained full-size image source rather than a downscaled thumbnail or cached asset, with instant low-res preview and smooth progressive upgrade.

## Status

accepted

## Considered Options

- **Obsidian Modal Subclass**: Standard modal window with title header and frame borders. Rejected because standard modal frames feel heavy and obstruct wide-aspect or tall photo inspection.
- **Direct External Browser Navigation**: Opening image URLs directly in the default OS browser. Rejected because it breaks reading continuity and requires leaving Obsidian.
- **Custom Full-Window Lightbox Overlay**: Selected for zero-friction inspection, gesture support (pinch/zoom/pan/swipe-down dismiss), and popout window compatibility.

## Consequences

- Reader images gain click/tap listeners that intercept image clicks while preserving access to external hyperlinks via an in-lightbox action pill.
- Math/LaTeX formulas, UI icons, and avatars must be carefully filtered out to avoid unintended activations.
