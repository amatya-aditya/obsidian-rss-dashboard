# Stylesheet index

`index.css` is the entry point and defines stylesheet import order. This index
describes the primary owner and scope of each stylesheet; selectors may still
be shared when their scope is explicit.

## Dashboard shell and content

| Stylesheet | Owner and scope |
| --- | --- |
| `index.css` | Stylesheet entry point; imports the style files in cascade order. |
| `layout.css` | Dashboard shell, navigation layout, and top-level view structure. |
| `sidebar.css` | Dashboard sidebar, feed and folder rows, and sidebar toolbar. |
| `articles.css` | Shared article row presentation and article-level actions. |
| `article-empty-state.css` | Empty and loading states for article views. |
| `card-view.css` | Article card layout. |
| `list-view.css` | Article list layout. |
| `feed-view.css` | Feed-specific view presentation. |

## Controls and navigation

| Stylesheet | Owner and scope |
| --- | --- |
| `controls.css` | Shared dashboard controls. |
| `controls-dropdown.css` | Dashboard control dropdowns. |
| `controls-filter-bar.css` | Dashboard filter bar. |
| `filter-menu.css` | Filter menu and its options. |
| `dropdown-portal.css` | Dropdown content rendered through a portal. |
| `pagination.css` | Article pagination controls. |

## Modals and dialogs

| Stylesheet | Owner and scope |
| --- | --- |
| `modals.css` | Shared modal shell, generic modal controls, confirmations, and responsive behavior applying across modal types. |
| `add-feed-modal.css` | Add Feed dialog-specific content and actions. |
| `edit-feed-modal.css` | Edit Feed dialog-specific content and actions. |
| `feed-manager-modal.css` | Manage Feeds dialog content and actions. |
| `feed-preview-modal.css` | Feed preview dialog. |
| `import-opml-modal.css` | OPML import and overwrite dialogs. |
| `import-starred-modal.css` | Starred-article import dialog. |
| `folder-selector-popup.css` | Folder selector popup. |

## Discover and Reader

| Stylesheet | Owner and scope |
| --- | --- |
| `discover.css` | Discover view cards and content. |
| `discover-sidebar.css` | Discover sidebar structure. |
| `discover-sidebar-filters.css` | Discover sidebar filters. |
| `discover-sidebar-nav.css` | Discover sidebar navigation. |
| `kagi-smallweb.css` | Kagi Small Web view. |
| `reader.css` | Reader content, toolbar, and article presentation. |
| `reader-lightbox.css` | Reader image lightbox. |

## Media

| Stylesheet | Owner and scope |
| --- | --- |
| `video.css` | Video embeds and playback presentation. |
| `podcast-player.css` | Podcast player and episode list. |
| `podcast-themes.css` | Podcast theme variants. |

## Settings

| Stylesheet | Owner and scope |
| --- | --- |
| `settings.css` | Shared settings tab and settings control presentation. |
| `settings-about-support.css` | About and support settings content. |
| `settings-keyword-filters.css` | Keyword-filter settings. |
| `settings-icon-proxy.css` | Icon proxy settings. |

## Keeping this index current

- Add an entry when adding a stylesheet; remove or update it when deleting or
  changing a stylesheet's primary owner or scope.
- Keep each scope description short and aligned with the selectors and
  components that actually use the stylesheet.
- Preserve the import order in `index.css` unless a cascade change is intended
  and reviewed.
