# Search the sidebar

Sidebar search filters the dashboard sidebar by **feed**, **folder**, and **tag**. It does not look inside articles; to find an article by title, use [article search](#find-an-article-by-title) instead.

## Open and clear search

On desktop:

1. Open RSS Dashboard and make sure the sidebar is visible.
2. Select **Search** (the magnifier) in the sidebar toolbar. The **Search sidebar** field opens above the feed list, and focus moves into it.
3. Type a query. Results update as you type, and the field keeps focus and your caret.

On mobile:

1. Open the sidebar drawer.
2. Tap **Search** in the sidebar toolbar. The field and its hint sit above the results in the drawer.

To clear the query, use the clear (✕) button inside the field or delete the text. The full sidebar returns, along with the Tags and folder states you had before searching.

To close search, select **Search** again. Your text is kept and filtered results come back the next time you open search.

## What a query searches

A plain query starts filtering at three characters. A query with a qualifier starts at one character. Matching is case-insensitive.

| Query         | What it searches                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Saved`       | Feed titles and the folder paths they live in, folder names and paths, and tag names. All matching kinds show together. |
| `feed:News`   | Feed titles and their folder paths. Shows matching feeds and the folders needed to reach them.                          |
| `folder:Tech` | Folder names and paths. Shows matching folders and the eligible feeds inside them.                                      |
| `tag:#Saved`  | Tag names and feeds with at least one article tagged with a matching tag.                                               |
| `tag:Saved`   | The same as `tag:#Saved`. The leading `#` is optional and both forms are equivalent.                                    |

Use one qualifier at the start of the query. These aliases work too: `feeds:`, `folders:`, `path:`, and `tags:`. A second qualifier is treated as search text, and an unknown prefix such as `title:` is plain text.

- **Feeds and folders** use case-insensitive substring matching. Every whitespace-separated word must appear in that entity's name and path. For example, `daily news` matches a feed titled "Daily technology news" and a feed titled "Daily cooking" inside a `News` folder.
- **Tags** use a case-insensitive literal prefix. `Sav` matches `Saved`, but `ave` and `Save*` do not. There are no wildcards, typo correction, or nested-tag rules. A bare `#Saved` without the `tag:` qualifier is plain search text, so it does not match the tag.
- A blank field, a bare qualifier such as `feed:`, and `tag:#` leave the sidebar unchanged and show no result message.

## Results and announcements

- The **Tags** section appears while a query matches tags, even if you normally keep it collapsed. During filtering it shows only the matching tag rows. When filtering stops (clearing, closing search, or shortening the query below its minimum length), the section returns to your previous collapsed or expanded state.
- Folders open temporarily so their matching feeds are reachable. They return to their previous state when filtering stops.
- A tag row can match even when the tag has no articles. A feed can match because one of its articles carries a matching tag, even if that tag has no row in the Tags section.
- If **Settings → Sidebar → Hide empty feeds/no unread articles** is on, matching feeds with no unread articles stay hidden. The sidebar reports how many matching feeds are hidden. When every match is hidden, it explains that instead of showing **No matches found.**
- One polite status message announces the settled result: the number of matching tag rows, directly matched folders, and feeds shown, plus any feeds hidden by the unread setting. Ancestor folders shown only to reach a result are not counted.
- Focus stays in the search field as results change. If you have moved focus to a row that survives the update, it stays there; if the row disappears, focus returns to the search field.
- A true miss shows **0 results** and **No matches found.**

## Examples

- `Saved` — shows a feed named "Saved ideas", a folder named `Saved archive`, and every feed whose articles carry a tag starting with "Saved".
- `tag:#Sav` — shows tags `Saved` and `Saved/later`, plus the feeds that use them.
- `feed:Tech` — shows a feed whose title contains "Tech" and a feed titled "Weekly roundup" that lives under `News/Tech`, together with its ancestor folders.
- `folder:News` — shows the `News` folder and all eligible feeds beneath it, opening collapsed folders as needed.
- `ave` — a true miss even when a `Saved` tag exists, because tag matching only checks the start of the name.

## Find an article by title

Sidebar search covers feeds, folders, and tags only, so an article title or body is never a sidebar match.

To search articles, open the dashboard's **Menu** (☰) button above the article list and type in **Search articles...**. You can also run **Focus article search** from the command palette. Article search covers the article view you are in; it is separate from sidebar search.
