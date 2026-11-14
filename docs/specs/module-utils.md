---
id: module-utils
type: submodule-design
status: draft
title: Package — utils
parent: architecture
---

# Package — utils

## Responsibility

The shared floor every other package stands on. It is large because it holds
several distinct clusters rather than one:

- **Settings plumbing** — load, normalize, migrate, and record the settings
  object. Real coupling: `main.ts`, the settings tab, and the feed parser all
  go through it.
- **Reader and article content** — fetching, cleaning, and rendering article
  HTML and Markdown, metadata precedence, ad containers, duplicate intros.
  The tightest cluster: the reader, the saver, and cover-image code share it.
- **Fetching and network** — fetch helpers, the fetch-target guard, proxy
  handling and ranking, concurrency limits, request headers.
- **URL, image, and identity** — URL normalization, image URL resolution,
  favicon, and domain icon helpers.
- **Tags** — tag utilities, colours and palettes, resolution, folder-tag sync.
- **Navigation, layout, and DOM** — platform and breakpoint values, popover
  positioning, focus and roving-tabindex helpers, swipe gestures, motion
  preference, live regions and landmarks, the accessible modal base.
- **Media** — chapter extraction, podcast destinations, video detection.
- **Storage and vault plumbing, and small app helpers** — vault file access,
  plugin-local storage, file replacement, export helpers, debug logging.

## Boundary

May import `src/types/` and Obsidian's API. It must not import a view, a
component, or `main.ts`.

That floor is not airtight today. These upward edges exist and are the
recorded debt of this area: `domain-icon-helpers` → `services/feed-parser`,
`services/mastodon-service`, and `settings/settings-ui-compat`; `proxy-check` →
`services/feed-timeout`; `reader-article-render` → `services/media-service` and
`services/feed-parser`; `settings-normalization` →
`services/feed-parser/feed-retention`; and `tag-utils` →
`modals/edit-tag-modal` at runtime. Removing one is welcome; adding one is a new
exception.

## Invariants

- **Popout-safe APIs only.** `activeDocument` / `activeWindow`, `window.*`
  timers, no `globalThis` in a UI path. This cluster is where that rule lives.
- **No `innerHTML` assignment.** HTML is built node by node against an
  allow-list; reading markup is fine.
- **No Node or Electron APIs**, so everything keeps working on mobile.
- No hardcoded styling in JavaScript — geometry from state is fine, static
  presentation belongs in `src/styles/`.
- A utility is added to the cluster that needs it. A new file for one caller's
  private helper belongs in that caller.

## Known gaps

127 files make this the easiest place to leave an orphan. Prefer extending an
existing cluster over adding a file, and move a helper out when its callers
change area.
