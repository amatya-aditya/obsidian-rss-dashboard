# RSS Dashboard fixture vault

This vault is the shared starting point for manually testing the RSS Dashboard
plugin. Every maintainer opens the same seeded feeds, articles, tags, and
settings, so a bug found here can be reproduced by anyone.

- Manual testing happens only in this vault, never in a personal vault.
- This is a disposable working copy. Reset it at any time with
  `npm run fixture:vault` from the repository root.
- Nothing you change here is committed. The pristine template lives in
  `test_files/fixture-vault/` in the repository.

## What is inside

- Eleven feeds covering RSS, Atom, JSON Feed, YouTube, podcast, Mastodon, and
  small web sources, arranged in nested folders, the root, and an empty folder.
- 153 seeded articles, including read, unread, starred, saved, tagged,
  undated, paywalled, and long articles, a podcast episode and a video with
  playback progress, and a feed with 120 articles.
- Import files for every import dialog in `import-fixtures/`.

Everything displays offline. Preview images and media need a network
connection, and a manual refresh fetches the real feeds.

The full scenario table is in `docs/development/fixture-vault.md` in the
repository.

## Other notes

- [[sample-note]] is an ordinary note for checking that the plugin leaves
  vault notes alone.
- [[fixture-guide-to-offline-reading]] is the note behind the saved article
  of the same name.
