# Tags Primer - Understanding RSS Dashboard Tagging

This guide explains how tags work in RSS Dashboard, including three auto-tagging features, and single-target card-based and reader toolbar tags.

## Auto Tagging

RSS Dashboard supports three automatic tagging layers:

1. **Feed-type defaults** from Settings > Tags > Auto Tagging
2. **Folder auto-tags** inherited from the feed's folder path (right click context menu on the sidebar folder)
3. **Per-feed custom auto-tags** from the add/edit 'Feed options' dropdown menu

Article-specific tags that already exist on an article are preserved as the most specific layer.

## Tag Precedence

When tags are resolved for an article, RSS Dashboard applies them from least specific to most specific:

```text
Feed-type defaults
  -> Folder auto-tags
  -> Per-feed custom auto-tags
  -> Article-specific tags
```

Tags are deduplicated by name using case-insensitive matching. When the same tag name appears at multiple levels, the most specific level wins, including its color.

## Feed-Type Defaults

Feed-type defaults are configured in Settings -> Tags -> Auto tagging. These defaults apply based on the feed or item media type, such as video, podcast, RSS article, Twitter/X, Mastodon, Smallweb, etc.

Example: if the default RSS tag is `RSS`, RSS feed items receive that tag unless a more specific folder, feed, or article tag with the same name overrides it.

## Folder Auto-Tags

Folders can have automatic tags that apply to every feed in that folder and its descendant folders.

To set folder auto-tags:

1. Right-click a folder in the sidebar.
2. Select "Auto tag feeds in folder..."
3. Select one or more tags, or clear the selection to remove the folder rule.
4. Choose whether to backfill existing articles.
5. Save the rule.

Folder auto-tags always cascade for future refreshes. The rule is stored only on the folder where you configure it; child folders inherit parent tags dynamically.

### Cascading Example

```text
Technology/                 auto-tags: Tech
  Web Development/          auto-tags: Web
    React/                  auto-tags: React
```

A feed in `Technology/Web Development/React` receives `Tech`, `Web`, and `React`, plus any media defaults and per-feed custom tags.

Child folder tags combine with parent folder tags. If a child folder defines a tag with the same name as a parent tag, the child folder's tag wins.

## Updating Existing Articles

Saving folder auto-tags always affects future parsing and refreshes. Existing articles are changed only when you choose an update option and confirm the prompt.

**Existing articles** options:

- **Don't update** — save the folder rule for future refreshes only.
- **Sync folder auto-tags** — add newly selected folder tags where missing, and remove tag names you deselected from this folder's rule. Other tags (manual tags, per-feed tags, parent folder tags not removed here) are left unchanged.
- **Remove all tags** — strip every tag from existing articles in the selected scope, including manual tags and tags from other rules.

Use **Include subfolders** to control whether descendant-folder articles are included in the update.

## Per-Feed Custom Tags

Individual feeds can have custom auto-tags in the Edit Feed modal. These apply after feed-type defaults and folder auto-tags.

Example: a YouTube feed in `Entertainment/Gaming` might receive `Video` from media defaults, `Entertainment` from its folder, and `Important` from the feed's custom auto-tags.

## Troubleshooting

If expected tags do not appear:

1. Confirm the tag exists in Settings -> Tags.
2. Confirm the feed is in the expected folder path.
3. Refresh the feed after changing auto-tag rules.
4. For existing articles, use the folder or feed backfill option.

Duplicate tag names should not appear. If they do, check for inconsistent capitalization and recreate the affected tag definitions.
