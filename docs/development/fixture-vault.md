# Fixture Vault

The fixture vault is the one shared starting point for manual testing. Every
maintainer opens the same seeded feeds, articles, tags, and settings, so a bug
found in it can be reproduced by anyone from a clean reset.

**Manual testing happens only in the fixture vault, never in a personal
vault.** A personal vault holds real reading history and notes that a bug or a
storage migration can damage, and its state can't be shared or reset.

## Layout

| Path | What it is |
| --- | --- |
| `test_files/fixture-vault/` | The pristine template, tracked in git. Testing never changes it. |
| `.fixture-vault/` | The working copy you open in Obsidian. Gitignored and disposable. |
| `scripts/setup-fixture-vault.mjs` | Creates or resets a working copy and installs the current build (`npm run fixture:vault`). |
| `scripts/generate-fixture-vault.mjs` | Regenerates the template's seeded plugin data (`npm run fixture:vault:generate`). |

Inside the template:

| Path | Contents |
| --- | --- |
| `.obsidian/community-plugins.json` | Enables `rss-dashboard`. The build is copied in by the setup script. |
| `.obsidian/plugins/rss-dashboard/data.json` | The plugin's bootstrap pointer to the vault metadata folder. |
| `rss-dashboard-data/data.json` | Plugin settings, feed list, folders, and tags. |
| `rss-dashboard-data/feeds/<feedId>.json` | One Shard storage v2 article shard per feed. |
| `rss-dashboard-data/user-state.json` | Read, starred, saved, tag, and playback state, keyed `feedId:guid`. |
| `import-fixtures/` | One file for each import dialog. |
| `saved-articles/` | The note behind the seeded saved article. |
| `welcome.md`, `notes/` | Ordinary notes, so the vault looks like a real one. |

The data uses **Shard storage v2**, the current default, with the storage and
metadata folders visible (`rss-dashboard-data/`, not a dot-folder) so you can
inspect the files in a file manager or editor. The settings file stores only
values that differ from the plugin's defaults; the plugin fills in the rest and
writes a complete file on its first save.

## Set up, reset, and open

Build the plugin first, so there is a `main.js`, `manifest.json`, and
`styles.css` in the repository root:

```sh
npm run build        # or leave `npm run dev` running
npm run fixture:vault
```

The script prints the folder to open. In Obsidian, choose **Open another
vault** → **Open folder as vault** and pick that folder (by default
`.fixture-vault/` in the repository root). On first open, Obsidian asks
whether to trust the vault's plugins: choose **Trust author and enable
plugins**.

Run `npm run fixture:vault` again at any time to reset the working copy to the
template. Close the vault in Obsidian first: Obsidian keeps files open, and it
would write its workspace back into the new copy.

Options, passed after `--`:

| Command | Effect |
| --- | --- |
| `npm run fixture:vault -- <folder>` | Create or reset the vault in another folder. |
| `npm run fixture:vault -- --plugin-only` | Copy a new build into the existing vault without resetting its data. |
| `npm run fixture:vault -- --storage legacy-json` | Seed the same content in deprecated Legacy JSON storage. |
| `npm run fixture:vault -- --storage shard-v1` | Seed the same content in deprecated Shard storage v1. |
| `npm run fixture:vault -- --show-whats-new` | Leave the last shown version unset, so What's New opens on first launch. |
| `npm run fixture:vault -- --help` | Print the usage. |

The script replaces a folder only when it is empty or carries the
`.rss-dashboard-fixture-vault.json` marker it writes, and it refuses folders
that contain the repository or overlap the template. By default it records the
installed release as the last shown version, so What's New does not open over
the dashboard after every reset.

### Load a new build

1. Rebuild: `npm run build`, or let `npm run dev` rebuild on save.
2. Run `npm run fixture:vault -- --plugin-only` to copy it in, or a plain
   `npm run fixture:vault` to also reset the data.
3. In Obsidian, turn **RSS Dashboard** off and on again under **Settings** →
   **Community plugins**, or run **Reload app without saving** from the
   command palette.

### Migration testing

`--storage legacy-json` puts every feed, article, and article state into the
plugin's own `data.json`. `--storage shard-v1` keeps settings in the plugin's
`data.json` and article state inside each shard under
`rss-dashboard-data/feeds/`. Both hold the same content as the default, so
after running the storage migration the dashboard should look exactly as it
does in a Shard storage v2 vault.

## Testing a refactor

A refactor's scoped checklist compares the build before and after, so every
result must come from a known build and a clean vault.

- **Before a reset, check whether Obsidian has the vault open.** An open vault
  keeps the old build in memory, so results taken after the reset belong to
  the old code. If you reset under a running app, run
  `app.commands.executeCommandById('app:reload')` in the developer console,
  then confirm the new code is loaded (for example, that a method the change
  added or removed is present or gone on
  `app.plugins.plugins['rss-dashboard']`) before testing.
- **Drive import dialogs from the console.** Pass a `File` built from text to
  the plugin's import method, which opens the real confirmation modal without
  the native file picker:

  ```js
  const plugin = app.plugins.plugins['rss-dashboard'];
  const text = await app.vault.adapter.read('import-fixtures/rss-dashboard-feed-bundle.json');
  await plugin.importFeedBundleFromFile(new File([text], 'rss-dashboard-feed-bundle.json'));
  ```

  The other entry points are `importPortableDataBundleFromFile`,
  `importSettingsBundleFromFile`, and `importUserSettingsJsonFromFile`.
- **Use top-level `await` in the console.** An async IIFE prints only
  `Promise {<pending>}`.
- **Check the files on disk, not only the UI.** Open the file the refactor
  writes (for a storage change, `rss-dashboard-data/user-state.json` or a feed
  shard) in the folder you opened, and confirm it holds what the UI shows.
- **Run the ticket's extra checks.** The baseline checklist covers ordinary
  use; the ticket's **Scoped checklist** adds the edge cases the moved code
  handles. For [#467](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/467)
  those were a corrupt `user-state.json`, the orphaned file left after
  reverting to Legacy JSON, and removed versus unrecognized feed state.

## Seeded scenarios

11 feeds, 153 articles: 48 read, 9 starred, 9 tagged, 1 saved, 2 with playback
progress. The automated test in
`test_files/unit/main/fixture-vault-loading.test.ts` checks these counts.

| Scenario | Where to find it |
| --- | --- |
| RSS feed | **GitHub Blog (fixture)**, folder `News/Tech` |
| Atom feed | **RSS Dashboard releases (fixture)**, folder `News/Tech/Releases` |
| JSON Feed | **JSON Feed (fixture)**, folder `News` |
| YouTube feed | **Google for Developers (fixture)**, folder `Videos` |
| Podcast feed | **The Changelog (fixture)**, folder `Podcasts` |
| Mastodon feed | **Mastodon (fixture)**, folder `Mastodon`; posts have no title |
| Small web feed | **Kagi Small Web (fixture)**, folder `Smallweb` (the default small web folder) |
| Feed in the root | **RSS 2.0 sample (fixture, one article)** |
| Nested folders | `News` → `Tech` → `Releases`; `News` is pinned and `News/Tech` has an auto-tag |
| Empty folder | `Empty` |
| Feed with no articles | **Hacker News (fixture, no articles)** |
| Feed with one article | **RSS 2.0 sample (fixture, one article)** |
| Feed with many articles | **BBC Technology (fixture, 120 articles)**, folder `Bulk`: every third read, every 25th starred, every 40th tagged, every fourth with an image |
| Feed with a fetch error | **Unreachable feed (fixture)**: shows the error badge; its URL never resolves |
| Unread article with an image | GitHub Blog: "Unread article with a preview image" |
| Read article without an image | GitHub Blog: "Read article without a preview image" |
| Starred, several tags | GitHub Blog: "Starred article with two tags" (Important, Research) |
| Saved article | GitHub Blog: "Fixture guide to offline reading", saved to `saved-articles/` |
| Long article | GitHub Blog: "A very long article for reader layout checks": headings, figure, list, quote, code, table |
| Paywalled article | GitHub Blog: "Paywalled article showing only an excerpt" |
| Undated articles | GitHub Blog: two undated articles, one with a first-seen date and one without |
| Imported starred article | JSON Feed: "Starred article imported from starred.json" (cached preview banner) |
| Video with playback progress | Google for Developers: "Placeholder video two, half watched" |
| Podcast with playback progress | The Changelog: "Fixture episode 4", about 40% played |
| Tags | Important, Read later, Video, Podcast, Research, Reference, RSS (all used, in different colors) and Unused (defined, never applied) |

Every feed URL is a real public feed, so a manual refresh works and adds that
feed's current articles next to the seeded ones. Everything above displays
offline from the seeded data. Preview images come from Lorem Picsum and need a
network connection, as do the audio and video: the podcast audio and YouTube
video IDs are placeholders that do not play.

Retention is off for every seeded feed (**Auto delete** and **Max items** are
0), because the seeded articles are older than the default 30-day window. To
test retention, set either limit on a feed, such as the 120-article feed, and
refresh it.

Article text is generated placeholder text. Links point at `example.com`,
which is reserved for documentation, and nothing in the vault is personal data
or a credential.

## Import fixtures

| File | Import dialog | What it tests |
| --- | --- | --- |
| `feeds.opml` | Import OPML/XML | Nested folders, a feed outside any folder, and one feed the vault already follows. |
| `starred.json` | Import starred articles | A Google Reader compatible export: one article from a followed feed, one from a new feed, `Read later` and new labels, and one entry the importer rejects for having no article link. |
| `rss-dashboard-feed-bundle.json` | Import feed bundle | Two feeds in nested folders with articles and state. Replaces the vault's feeds. |
| `rss-dashboard-settings-bundle.json` | Import settings bundle | List view, oldest first, grouped by feed. Keeps the storage location. |
| `rss-dashboard-portable-bundle.json` | Import portable data bundle | One feed with four articles plus the settings above. Replaces everything. |
| `rss-dashboard-user-preferences.json` | Import user preferences | Preferences only: an Overwriting import that keeps feeds, folders, and tags. |
| `preferences-folders-and-tags-only.json` | Import user preferences | Folders and tags with no `feeds` key: a Replacing import that keeps the vault's feeds. |

`test_files/unit/services/fixture-vault-import-fixtures.test.ts` parses each
file with the plugin's own parsers and validators.

## Changing the fixture

Edit `scripts/generate-fixture-vault.mjs` for feeds, articles, settings, and
the JSON import fixtures, then run `npm run fixture:vault:generate`. Edit the
notes, `feeds.opml`, `starred.json`, and the `.obsidian` files by hand.
`test_files/unit/setup-fixture-vault.test.ts` fails if the committed files no
longer match the generator. Update the counts and the table above when the
scenarios change.
