# Development Docs

Last updated: 2026-05-12

Internal developer documentation for the RSS Dashboard plugin.

## Docs Index

### Bugs

- [Why YouTube Shorts Auto-Tagging Is Fundamentally Brittle](../bugs/youtube-shorts-tagging-failure.md)
  Last updated: March 18, 2026

### Design

- [RSS Dashboard Design Spec](../design/design-spec.md)
  Last updated: 2026-03-17: Standardize icon rendering using clickable-icon pattern for Android compatibility

### Development

- [Compliance Patterns and Audit Guardrails](./compliance-patterns.md)
  Canonical implementation patterns for audit-sensitive code paths: safe HTML rendering, lint-disable rationale, boundary typing, popout-safe APIs, and DOM helper conventions.
- [Test-Lint Backlog Tracker](./test-lint-backlog-tracker.md)
  Pass-by-pass tracker for test-file ESLint debt reduction that branched from audit scorecard work after Pass 4.
- [Feed Data Lifecycle: Fetch, Merge, Retention, and Persistence](./data-flow.md)
  Full walkthrough of how a feed item moves from remote fetch through local merge (three paths), two-pass retention, disk persistence, and dashboard display — including flowcharts for each stage.
- [Defuddle evaluation (vs current article/podcast parsing)](./defuddle-evaluation.md)
  Date: 2026-03-15
- [Feed Validation in RSS Dashboard](./feed-validation.md)
  New feeds are validated through a multi-layered process that ensures technical compatibility and discoverability.
- [Obsidian Settings Reference](./obsidian-settings-reference.md)
  This file is a prompt-friendly companion to [`node_modules/obsidian/obsidian.d.ts`](../../node_modules/obsidian/obsidian.d.ts) for building settings tabs and settings-driven UI in this plugin.
- [Release Notes Workflow](./release-notes-workflow.md)
  How to collect release-note entries in PRs and compile changelog updates efficiently at Beta/Stable cut time.
- [Pull Request Template](../../.github/PULL_REQUEST_TEMPLATE.md)
  Standard PR checklist and release-notes capture fields used during development.

### Plans

- [Deprecate + Remove `src/modals/feed-manager-modal.ts`](../plans/Future/deprecate-remove-feed-manager-modal.md)
  Remove `src/modals/feed-manager-modal.ts` entirely and migrate all code, tests, and docs to import directly from `src/modals/feed-manager/*`.
- [Plan: Handle .mp4 Files as Hero Images in Feed View](../plans/Future/handle-mp4-hero-images.md)
  Some feeds (like QZ) provide `.mp4` URLs as `coverImage` values instead of `.jpg` or `.png`. The plugin needs to:
- [Media Notes Feature — Podcast & Video Player](../plans/Future/Media%20Notes%20Feature%20—%20Podcast%20&%20Video%20Player.md)
  Add an "Episode notes" / "Video notes" collapsible section to both the podcast and video players, backed by **individual vault files** for full two-way Obsidian sync.
- [Keyboard Shortcuts](../plans/keyboard-shortcuts.md)
  Settings/Preferences — `Alt + p`
- [Normalize 2.2.0 release docs and beta history](../plans/Normalize%202.2.0%20release%20docs%20and%20beta%20history.md)
  (1) make `docs/releases/2.2.0.md` the public, stable “what’s new” summary, (2) add a single `docs/releases/2.2.0-beta-series.md` that preserves the full beta-by-beta history, and (3) make `CHANGELOG.md` stable-focused…

### Releases

- [Release 2.1.0](../releases/2.1.0.md)
  **Smart Podcast Detection**: Improved auto-podcast handling prevents non-podcast feeds from being incorrectly recognized as podcasts
- [Release 2.1.1](../releases/2.1.1.md)
  This release focuses on improving code quality and ensuring full compatibility with Obsidian's plugin guidelines.
- [Release 2.1.2](../releases/2.1.2.md)
  This release addresses plugin review feedback and fixes CSS compatibility issues.
- [Release 2.1.3](../releases/2.1.3.md)
  This release fixes several issues and improves code quality.
- [Release 2.1.4](../releases/2.1.4.md)
  Fixed TypeScript type safety issues across multiple files
- [2.1.5](../releases/2.1.5.md)
  Fixed multiple TypeScript linter errors related to unnecessary `await` expressions
- [2.1.6](../releases/2.1.6.md)
  Removed `async` keyword from `onOpen` method in `dashboard-view.ts` to resolve warning about missing `await` expression.
- [2.1.7](../releases/2.1.7.md)
  Improved CSS specificity to avoid conflicts with other plugins by adding plugin-specific classes
- [2.1.8](../releases/2.1.8.md)
  Fixed folder selection not persisting after selecting from suggestions by dispatching proper DOM events
- [2.1.9](../releases/2.1.9.md)
  6 new podcast player themes: Nord, Dracula, Solarized Dark, Catppuccin Mocha, Gruvbox, Tokyo Night
- [2.2.0](../releases/2.2.0.md)
  Consolidated RSS, Podcast, and YouTube add-feed workflows into a more streamlined unified flow
