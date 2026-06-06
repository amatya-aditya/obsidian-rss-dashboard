# Tags Primer

Tags are a core organizational layer in RSS Dashboard. This guide covers how they are defined, how they are applied to articles, how they are used for filtering, and the difference between per-article tagging and automatic tagging.

## What a tag is

A tag is a named label with an associated color. Tags live in the global **Tag Palette** (also called **Available Tags**) stored in plugin settings. Any tag in that palette can be assigned to any article.

Default tags seeded on first install:

- `Important` (`#e74c3c`)
- `Read later` (`#3498db`)
- `Favorite` (`#f1c40f`)
- `Video` (`#d04747`)
- `Podcast` (`#8e44ad`)

Tags do not protect articles from retention or deletion. Only `starred` and `saved` provide that protection.

## Defining tags

Tags are defined centrally in the global Tag Palette. Edits to a tag name, color, or deletion are propagated to every article that currently carries that tag.

You can manage the palette from:

- Settings > Tags (add, edit, delete, rename, change color)
- The tag dropdown in the Reader sidebar (add new tags inline, edit existing ones)

## Choosing between manual and automatic tagging

RSS Dashboard has two kinds of tagging:

| Method                      | Where configured                        | What it affects                                                | Timing                                            |
| --------------------------- | --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Manual (per-article)        | Dashboard card dropdown, Reader toolbar | Only the article you are editing                               | Immediately when you toggle the tag               |
| Automatic (settings-driven) | Settings > Media > Default \* tags      | New articles from matching content types at parse/refresh time | Applied as articles are fetched                   |
| Automatic (per-feed)        | Add/Edit Feed modal > Custom auto-tags  | New articles from that specific feed                           | Applied as new articles are fetched for that feed |

Tip: Use manual tagging for organizational labels like "to review", "project X", or "research topic". Use automatic tagging to encode the media type or source of a feed so every article gets the right label without extra clicks.

## Manually tagging individual articles

### From the dashboard

Every article card or list item exposes a tag control. Click the tag toggle button on the card to open the tag dropdown portal, then toggle any tag from the global palette on or off. Changes save immediately to that article.

### From the reader toolbar

While reading an article, click the tag button in the reader header to open the same tag dropdown portal. You can also:

- Edit an existing tag (name or color) inline from the portal
- Delete a tag from the portal, which removes it from the article and from the global Tag Palette everywhere

Keyboard shortcut: press `t` while the dashboard or reader is focused to open the tag menu for the active article. (See [Keyboard shortcuts](keyboard-shortcuts.md) for more info)

## Filtering by tags in the dashboard

The sidebar lists every tag in your palette with a checkbox, color dot, and article count. Selecting tags narrows the article list.

Filter logic modes:

- **OR** (default): show articles matching any selected tag
- **AND**: show articles that have all selected tags
- **NOT**: show articles matching none of the selected tags

On the dashboard header filter bar you can also use the preset filters `tagged` (any tag) and `untagged` (no tags).

When the sidebar and header filters are both active, they are combined with AND logic: an article must satisfy both sets of conditions to appear.

## Automatic tagging via settings

Settings > Media configures default tags that are automatically applied when the plugin detects a media type during feed parsing:

- Default video tag
- Default Twitter/X tag
- Default Mastodon tag
- Default YouTube tag
- Default podcast tag
- Default RSS tag
- Default Smallweb tag

If a feed is detected as a podcast, every article parsed from that feed gets the configured default podcast tag. The same applies to video, YouTube, Mastodon, Twitter, Smallweb, and generic RSS feeds.

These defaults apply at parse time for all feeds of that type. To customize tags for a single feed without changing the global default, use per-feed custom auto-tags described below.

## Per-feed custom auto-tags (Add/Edit Feed modal)

When adding or editing a feed, the **Feed options** section contains a **Custom auto-tags** control. Choose any tags from the global Tag Palette and they will be applied automatically to every new article fetched from that specific feed.

This is the right place to add feed-specific organizational tags such as the newsletter name, topic area, or source category.

### Inherited auto-tags

In the Edit Feed modal, the plugin also shows **Inherited auto-tags** as read-only badges. These are the tags that come from the global media settings (for example, the default podcast tag if the feed is detected as a podcast). They are informational only; to change them, edit the media settings.

### Changing custom auto-tags on an existing feed

If you add or remove custom auto-tags on a feed that already has articles, the plugin opens a confirmation dialog with three choices:

- **Apply to existing articles**: the plugin removes the old tag names from every existing article in that feed and adds the new tag names to all of them
- **Apply to future articles only**: only articles fetched after the change get the new tags; existing articles are left alone
- **Cancel**: abort the save without changing anything

## Automatic tags based on article state

Two tags are applied automatically based on what you do to an article:

- **Saved**: added when you save an article to your vault. Enabled via `Add saved tag to saved articles` in settings.
- **Favorite**: added when you star an article; removed when you unstar it.

These are treated as canonical names. Even if you have renamed the `Favorite` tag in the palette to something else, the portal and code paths still resolve to the canonical name internally.

## Renaming, recoloring, and deleting tags

Because tags are shared across the entire plugin:

- Renaming a tag changes its label on every article that uses it.
- Changing a tag color updates the badge color everywhere that tag is rendered.
- Deleting a tag removes it from every article.

## Suggestions

- Have a new idea or suggestion for how to make tags better? Drop a feature request on our Github page or drop in Discord to share some of your ideas!
