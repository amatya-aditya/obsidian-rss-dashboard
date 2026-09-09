# FreshRSS-compatible subscription export contract

Last updated: 2026-09-08  
Related issue: #223 (child of #221)

## Decision

The v1 recovery/transition artifact is a standard OPML 2.0 subscription
export. It carries subscriptions and a one-level FreshRSS category placement;
it does not claim to export article content, read state, starred state, or
labels. Those article properties remain portable during normal FreshRSS use
through the planned Google Reader API write-back.

The FreshRSS-specific `frss:*` extension namespace is not needed for this
contract. Do not export RSS Dashboard-only settings, credentials, tags, or
article history in OPML.

## Minimum compatible shape

FreshRSS parses OPML using a non-strict OPML parser, then treats each outline
with `xmlUrl` as a subscription. `text` is used as the feed name (with `title`
as a fallback); absent or unrecognised `type` defaults to a normal RSS feed.
FreshRSS's own text-file conversion emits the same minimum feed shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>RSS Dashboard subscriptions</title>
    <dateCreated>Tue, 08 Sep 2026 00:00:00 GMT</dateCreated>
  </head>
  <body>
    <outline text="Technology">
      <outline text="Example feed" title="Example feed" type="rss"
               xmlUrl="https://example.test/feed.xml"/>
    </outline>
  </body>
</opml>
```

Use UTF-8, XML-escape every attribute value, preserve the exact feed URL in
`xmlUrl`, and use `type="rss"` for clarity. `htmlUrl` and `description` are
optional and may be added only when RSS Dashboard has a reliable value.

Sources:

- FreshRSS's [OPML developer documentation](https://freshrss.github.io/FreshRSS/en/developers/OPML.html)
  confirms standard OPML feed-list import/export and reserves `frss:*` only
  for FreshRSS-specific extensions.
- FreshRSS's
  [import controller](https://github.com/FreshRSS/FreshRSS/blob/edge/app/Controllers/importExportController.php)
  dispatches `.opml` and `.xml` files to the OPML import service and its
  `txtToOpml()` function emits a minimal `type="rss"`, `text`, `xmlUrl`
  outline.
- The [OPML import service](https://github.com/FreshRSS/FreshRSS/blob/edge/app/Services/ImportService.php)
  reads `xmlUrl`, uses `text` then `title` for the subscription name, and
  defaults an unrecognised type to an RSS feed.

## Category rule

FreshRSS categories are flat. A parent `<outline>` supplies a single category
name for its direct feed outlines. Its importer recursively visits nested
outlines, but creates/assigns categories by the immediate outline name, not by
a hierarchy path. It has no category-parent model in the import contract.

The FreshRSS export implementation likewise emits category outlines containing
feed outlines, rather than nesting category paths. The v1 dashboard export
therefore must flatten every dashboard folder path to one stable display name
before rendering the OPML. The recommended mapping is:

```text
Dashboard folder: Work / Research / AI
FreshRSS category: Work / Research / AI
```

` / ` is a presentation delimiter, not a reconstructed FreshRSS hierarchy.
Choose and document an escaping rule before implementation if folder names may
themselves contain that exact delimiter. Feeds without a dashboard folder must
be direct children of `<body>` so FreshRSS puts them in its default category.

Sources:

- The [FreshRSS OPML exporter](https://github.com/FreshRSS/FreshRSS/blob/edge/app/views/helpers/export/opml.phtml)
  constructs each category as an outline whose children are feed outlines.
- The import service's
  [`loadFromOutline()` implementation](https://github.com/FreshRSS/FreshRSS/blob/edge/app/Services/ImportService.php)
  propagates only the immediate parent category name and creates categories
  from `text`/`title`.

## Existing RSS Dashboard behavior and required change

`OpmlManager.generateOpml()` already produces a valid OPML 2.0 document with
escaped `text`, `title`, `type="rss"`, and `xmlUrl` attributes. It represents
dashboard folders as nested outlines and also writes a `category` attribute on
each feed.

FreshRSS accepts that output, but nested dashboard folders do **not** preserve
their full hierarchy on import: a leaf folder becomes a flat FreshRSS category
named only after that leaf. The `category` attribute does not repair this for a
feed inside a parent outline because FreshRSS gives the surrounding outline
precedence. A FreshRSS-specific export profile (or an intentional adaptation
of the current generator) is required to flatten folders as described above.

This is a subscription-only contract. OPML cannot carry the dashboard's
article-level read/starred/label history. FreshRSS's documented Import/Export
UI distinguishes feed-list export from labelled and favourite article export;
the latter are archive formats, outside this v1 recovery promise.

Sources:

- Local implementation: `src/services/opml-manager.ts`,
  `OpmlManager.generateOpml()`.
- FreshRSS [subscription documentation](https://github.com/FreshRSS/FreshRSS/blob/edge/docs/en/users/04_Subscriptions.md)
  describes separate export choices for feed lists, labelled articles, and
  favourite articles.

## Docker manual round-trip acceptance procedure

This is an explicit local smoke test, not an ordinary unit or CI test.

1. Start a disposable FreshRSS instance with the official Docker-supported
   development environment. FreshRSS documents `git clone`, `make start`,
   SQLite setup, and `http://localhost:8080`; use a different host port when
   another local instance occupies 8080. Create a dedicated test user.
2. In FreshRSS, create two baseline subscriptions: one in a category and one
   uncategorized. In RSS Dashboard, import/synchronise those subscriptions.
3. In RSS Dashboard, add one new direct feed and two feeds in distinct nested
   folder paths. Give one feed a title containing `&`, `<`, and `"` to exercise
   XML escaping. Export the FreshRSS portability OPML artifact.
4. Inspect the artifact before import: it parses as XML; every subscription
   has `xmlUrl`; all foldered subscriptions are under exactly one flat category
   outline; no `frss:*`, credentials, article bodies, or article state are
   present.
5. In FreshRSS, open **Subscriptions management → Import / export**, choose
   the exported OPML file, and import it. Refresh subscriptions after the
   import completes.
6. Verify that every dashboard subscription appears once, has the expected
   title and feed URL, and belongs either to the mapped flat category or the
   default category. Confirm the special-character title survives. The
   original baseline subscriptions must remain present.
7. Export FreshRSS's feed list and compare URL sets with the dashboard
   artifact. The URL sets must match for the scope selected in step 3. Record
   the FreshRSS version/image tag, Docker command, generated OPML, and any
   limitation observed.

FreshRSS documents Docker as its easiest supported development setup and its
user guide documents OPML/archive selection in the Import/Export screen:
[Docker environment guide](https://freshrss.github.io/FreshRSS/en/developers/02_First_steps.html),
[subscription import/export guide](https://github.com/FreshRSS/FreshRSS/blob/edge/docs/en/users/04_Subscriptions.md).

## TDD acceptance tests to add with implementation

- The FreshRSS export profile emits an XML-valid OPML 2.0 document with a
  `body` and escaped subscription attributes.
- A direct feed is emitted directly under `body`; a nested dashboard folder is
  emitted beneath one flat category outline using the documented mapping.
- Every selected subscription appears once with its original `xmlUrl`.
- The FreshRSS profile excludes `frss:*` extensions, credentials, feed items,
  read/starred state, and tags.
- An OPML fixture matching the profile remains parseable by the dashboard's
  existing importer, while the manual Docker procedure remains the evidence
  that FreshRSS accepts it.
