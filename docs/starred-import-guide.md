# Import Starred Articles Guide

This guide explains the **Import starred articles** feature: what it brings
in from an Inoreader `starred.json` export, the two Options toggles that
control optional side effects, how full article content gets fetched, and how
tagging works during the import preview.

## What it does

Point RSS Dashboard at an Inoreader `starred.json` export and it builds a
preview of every starred article inside it. From that preview you can:

- See which articles belong to feeds you already follow, and which belong to
  feeds that don't exist yet (grouped as **new feed** rows).
- See a count of entries the importer couldn't turn into an article at all
  (missing a source feed or a link), each with its title and the specific
  reason, under **Unable to import (N)**.
- Review and edit each article's tags before anything is imported.
- See exactly which new tags are about to be added to your tag palette, under
  **New tags (N)**, before you commit.

Selecting **Import** creates any missing feed subscriptions, adds the
selected articles (each starting `starred`), and applies whatever tags the
preview showed for them. Re-running the import against the same or an updated
export is safe — an article already imported is matched by its identity and
updated in place rather than duplicated.

## The Options panel

The Options panel sits above the article preview and holds two toggles. Each
toggle's description text dims while it's off, as a quick visual cue for
what's currently active.

### New-feed metadata refresh (off by default)

When a starred article belongs to a feed you don't already follow, RSS
Dashboard needs to create that feed subscription so the article has somewhere
to live — that part always happens, regardless of this toggle.

What the toggle controls is a separate, optional step: a **live fetch** of
that new feed's real title, site URL, icon, and current items, run once per
new feed in the background.

- **Off** (default): the new feed is created using only the title and site
  URL already present in your export. No network request happens for it
  during import. It picks up its real metadata and current items the next
  time it refreshes normally (on schedule, or when you refresh it manually).
- **On**: the new feed gets that live fetch immediately, exactly as if you'd
  added it by hand.

It defaults off so that importing a large starred library — which can
introduce many feeds you've never subscribed to before — doesn't also
silently pull in hundreds of each new feed's current articles that you never
asked for.

### Import labels as tags (on by default)

Inoreader labels on a starred article become tags on the imported article,
reusing a matching tag's color if your palette already has one with that
name.

- **On** (default): matches the tagging behavior that's always shipped with
  this feature — labels map to tags, and any tag name that doesn't already
  exist in your palette gets added to it.
- **Off**: imported articles carry no tags derived from labels, and nothing
  new is added to your tag palette from the bulk mapping.

Turning this off does not affect tags you add by hand to individual articles
in the preview (see [Per-article tags](#per-article-tags) below) — those
still go through the same **New tags (N)** confirmation either way.

## New tags (N)

Before you import, an inline **New tags (N)** section lists every tag name
that isn't already in your tag palette but would be added if you imported
right now — whether it came from the bulk label mapping above or from editing
an individual article's tags by hand. It updates live as you select or
deselect articles, or add or remove ad hoc tags. This is the only place new
tags get added to your palette during this flow: there's exactly one point
where you confirm what's about to change, not a separate popup for each
source.

## Per-article tags

Each article row in the preview shows its current tags as chips (the same
chip style used on dashboard article cards), with a "+N" indicator if there
are more than fit on the row. Click a chip to open the same tag-editing
control used elsewhere in the app — add an existing tag, remove one, or type
a brand-new tag name to create it on the fly (handy for marking where an
article came from, e.g. tagging everything from this import `inoreader`).

Edits here apply directly to that article's pending import — there's no
separate sync step, and no separate confirmation beyond the **New tags (N)**
section above.

Older versions of this preview showed a **Read**/**Unread** label on each
row; it was removed, since imported articles haven't been read yet by
definition and the label carried no other useful information. Tags now
occupy that space instead.

## Full article content: manual, not automatic

`starred.json` exports carry each article's own snapshot of its content —
sometimes a full article, sometimes just a summary. Importing an article
never triggers a network fetch by itself; it uses whatever content the export
already contains.

If you open an imported article in the reader and its content still needs
fetching, you'll see a banner:

- **"This is a cached preview from the starred.json import (\<date/time
  imported\>)."** — the content hasn't been fetched yet.
- **"The last attempt to fetch the full article failed. Showing the cached
  preview from the starred.json import (\<date/time imported\>)."** — a fetch
  was already tried and didn't succeed, so you know it's worth trying again
  rather than assuming nothing was ever attempted.

Both banners offer a **Fetch now** button next to the reader's existing
**Open in Browser** link. Clicking **Fetch now** is the only way this content
gets fetched — the reader's normal automatic fetch-on-open (which runs for
ordinary feed articles) is intentionally skipped for these cached-preview
articles, so opening one never triggers a surprise request on its own.

If the fetch succeeds, the article's content is replaced with the fetched
version and saved — but only for articles you've starred or saved, so the
plugin's storage doesn't grow from every article you've merely opened. If it
fails, the article goes back to the "last attempt failed" banner above so you
can tell it's worth another try rather than something that was never
attempted.

This behavior is specific to starred-imported articles. Articles you add
through a normal feed subscription are unaffected — the reader still fetches
their full content automatically on open, exactly as before.

## Why these decisions

- **New feeds aren't followed live by default** because importing a starred
  library often surfaces feeds you starred one article from years ago, not
  feeds you want to actively follow going forward — fetching their current
  items unconditionally would flood your dashboard with unrelated, unwanted
  articles.
- **Full-content fetching is manual and scoped to starred/saved articles**
  because importing hundreds of starred articles and eagerly fetching every
  one's full content at once means hundreds of network requests you didn't
  explicitly ask for, and persisting fetched content for every article ever
  opened (not just the ones you cared enough about to star or save) would
  grow the plugin's storage indefinitely for articles you're likely to never
  revisit.
- **Tag import and the new-feed refresh are separate toggles** because they
  are genuinely different background behaviors — one imports data you already
  had (labels), the other fetches new data from the network (a feed's live
  metadata) — and conflating them under one switch made it unclear what you
  were actually turning on or off.
