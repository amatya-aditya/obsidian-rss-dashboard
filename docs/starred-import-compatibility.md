# Starred Import: Google Reader-Compatible `starred.json` Compatibility

This document is the durable reference for what **Import starred articles**
actually accepts, what "Google Reader-compatible" means and doesn't mean
here, which exporters are actually tested, and the policy for confirming a
new one. See [ADR 0003](adr/0003-generalize-starred-import-to-google-reader-compatible-naming.md)
for why the feature's product copy is generic rather than naming a specific
service.

## "Google Reader-compatible" is a lineage, not a standard

There is no published, versioned specification for the `starred.json` shape
this importer reads. "Google Reader-compatible" describes a lineage: the
original Google Reader API's "Read later"/starred-items JSON shape, which
outlived the product itself because several successor RSS readers —
Inoreader among them — implemented compatible read/write APIs and export
formats against it, either for migration purposes or because they adopted
the same API surface for their own sync protocol. FreshRSS is one such
successor: it implements a Google Reader-compatible API primarily for
third-party client compatibility, and its own starred-item export follows
the same item shape with a handful of documented differences (see
[Parser contract](#parser-contract) below).

Because no governing body maintains or versions this shape, "compatible"
here always means **compatible with the specific exports this project has
actually parsed and tested**, not compliance with a specification that could
be checked independently. Treat every compatibility claim in this document
as scoped to what's stated — never as a blanket guarantee for a service or
version not listed.

## Parser contract

The parser (`src/services/starred-import-mapper.ts`) is a pure
function/class with no network or Obsidian API dependency, so it can be
tested directly against fixture data. It makes the following decisions for
every item in a parsed `starred.json` export:

### Source-URL resolution order

A portable source URL is required to either match the item to a feed the
user already subscribes to, or to create a new feed record for it. It is
resolved in this order (`resolveSourceUrl`):

1. **`origin.streamId`, with any `feed/` prefix stripped, when the result is
   itself an HTTP(S) URL.** This is the only path for the historical
   Inoreader-shaped export, where `streamId` already *is* the feed URL
   (e.g. `feed/https://example.com/feed.xml`).
2. **`origin.htmlUrl`, when it is an HTTP(S) URL**, used only when step 1
   doesn't yield a usable URL. This is the fallback that makes an
   instance-local, non-URL stream ID — such as FreshRSS's numeric
   `feed/6` — still resolvable: it isn't itself a URL, so RSS Dashboard
   never persists a bare number (or any other non-HTTP(S) value) as a
   `Feed.url`. `origin.htmlUrl` is the article's site, not its feed, but
   it's the best portable identifier available to key a new local feed
   record on.
3. **Neither resolves.** The item is classified `no_source_feed` in the
   `unimportable` list, with its id/title, rather than producing a
   candidate with an invalid feed URL.

### Content-field fallback

Article HTML is read in this order (`pickContent`):

1. `summary.content` — the field the historical Inoreader-shaped export
   uses.
2. `content.content` — the field FreshRSS uses instead, checked only when
   `summary.content` is absent.
3. Empty string, if neither is present (the pre-existing behavior for an
   export item with no body at all).

### Label vs. state vs. tag rules

Every `categories[]` entry on an item is classified by shape, not by which
service produced it:

- **`.../label/X`** — a user-created label. Decoded (URL-decoded, tolerating
  invalid percent-encoding by falling back to the raw text) and turned into
  a `Tag` on the imported article, reusing an existing tag's color on a
  case-insensitive name match and otherwise assigned the plugin's default
  tag color. This is the *only* category shape that produces a tag.
- **`.../state/com.google/starred`** — every item in a `starred.json`
  export is, by definition, in the starred collection; every imported item
  is set `starred: true` unconditionally, regardless of whether this
  specific category string is present.
- **`.../state/com.google/read`** — sets the imported article's `read`
  flag. Does not produce a tag.
- **`.../state/com.google/reading-list`** — recognized and ignored
  entirely. Does not produce a tag and does not affect `starred`/`read`.
- **Any other category** — including unqualified, non-namespaced values
  such as a bare `Product` (observed in real FreshRSS exports) or a
  service-specific namespace RSS Dashboard doesn't recognize — is ignored.
  It does not become a tag, and it does not fail the import. This is
  deliberate: a category not selected by the label/state rules above should
  never surface as data that looks like a user-created label, and an
  exporter emitting fields this parser doesn't know about should degrade to
  "ignored," not "import fails."

## Historical lineage

- **Google Reader** (shut down 2013) — originated the "Read later" starred-
  items JSON shape this parser reads, as part of its public Reader API.
  RSS Dashboard has no way to obtain a live Google Reader export (the
  service no longer exists) and does not claim any live compatibility with
  it. It's referenced here only as the historical origin of the data shape,
  and because "Google Takeout"-style archives from the Reader era are the
  format's namesake.
- **Inoreader** — the first exporter this importer was built and tested
  against ([GH Issue #234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234)).
  Ships `origin.streamId` as an already-usable feed URL and article HTML in
  `summary.content`.
- **FreshRSS** — a self-hosted RSS reader that implements a Google Reader-
  compatible API (for third-party client compatibility) and produces a
  `starred.json`-shaped export via that API. Verified per
  [GH Issue #330](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/330)
  / [GH Issue #337](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/337)
  to differ from Inoreader's shape in exactly the ways the parser contract
  above accounts for: an instance-local numeric `origin.streamId` (e.g.
  `feed/6`) instead of a URL, and article HTML in `content.content`.

## Confirmed compatibility (narrow, per-service)

Only the following claims are made. Do not extend, generalize, or
paraphrase these into a broader claim ("supports FreshRSS," "supports all
Google Reader-compatible services") anywhere in product copy, release
notes, or future documentation — every rewording that drops the caveats
below overstates what has actually been verified.

- **Inoreader** — tested against the original sanitized `starred.json`
  fixture (`test_files/fixtures/starred/starred.json`) and the regression
  test suite in `test_files/unit/services/starred-import-mapper.test.ts`
  and `test_files/unit/modals/import-starred-modal.test.ts`. This is the
  longest-standing and most thoroughly covered path.
- **FreshRSS** — tested against the specific export shape FreshRSS's
  Google Reader-compatible API produces (instance-local numeric stream ID,
  `content.content`, read state, an explicit `/label/` category, and a
  bare unqualified category), captured in a sanitized one-item fixture
  (`test_files/fixtures/starred/starred-freshrss.json`) plus a manual
  import verification. This is **not** the same depth of coverage as
  Inoreader — it covers the one exported shape that was actually observed
  and fixture-captured, not every FreshRSS configuration or version.
- **Google Reader Takeout** — historical format reference only. No current
  export is obtainable (the service is shut down) and no compatibility
  testing has been or can be performed against it. It is documented here
  solely as the origin of the data shape, not as a supported import source.
- **Other Google Reader-compatible services** (e.g. other self-hosted
  readers implementing the same API family) — **potentially compatible,
  not verified.** The parser's tolerant field-resolution rules above may
  happen to handle another service's export correctly, but no fixture,
  automated test, or manual import has confirmed this for any service not
  listed above. Do not state or imply support for a specific unlisted
  service without first following the fixture policy below.

## Fixture policy for confirming a new exporter

A single successful manual import against a new service is evidence worth
capturing, but it is not blanket compatibility, and it is not sufficient on
its own for this document to add a new confirmed-compatibility entry.
Before claiming a new service as confirmed-compatible:

1. **Capture a sanitized fixture.** Export a real `starred.json` from the
   service, strip or replace any personal/account-identifying data (URLs,
   titles, author names, etc. should be replaced with placeholder values
   that preserve the *shape* — see `starred-freshrss.json` for the pattern),
   and add it under `test_files/fixtures/starred/`.
2. **Add mapper-level unit tests** against that fixture in
   `test_files/unit/services/starred-import-mapper.test.ts`, asserting the
   specific behavior that differs from the already-confirmed services
   (source-URL resolution, content field, label/state/tag classification,
   read/starred state) — not just that the import doesn't throw.
3. **Perform a manual import verification** against a real (non-sanitized)
   export from that service, confirming articles, tags, read state, and new
   feed creation all resolve as expected in the running plugin.
4. **Update this document** with a new confirmed-compatibility entry
   scoped exactly like the ones above: name the specific fields tested, the
   fixture added, and any differences from previously-confirmed services.
   Do not word the new entry as, or fold it into, a broader "supports
   Google Reader-compatible services" claim — each service gets its own
   narrow entry, evidenced the same way FreshRSS's is above.

A manual import succeeding without a captured fixture and without the
mapper-level tests in step 2 is not sufficient to update this document —
it establishes that a particular export happened to work once, not that a
regression in that support would be caught before shipping.

## Backward-compatibility rules

- **Existing folders, feeds, settings, and command IDs are never migrated.**
  Generalizing the product copy (see ADR 0003) changed the *default*
  new-feed folder name for future imports (`Starred imports`, previously
  `Inoreader starred imports`) but does not rename, move, or touch any
  folder, feed, or setting a user's vault already has. A vault with an
  existing "Inoreader starred imports" folder keeps that folder, under that
  name, indefinitely.
- **The original Inoreader-shaped fixture and its tests are never removed**
  when a new exporter is added — every change to the parser contract must
  keep the Inoreader path working exactly as before, verified by the
  existing fixture/test suite.
- **An exporter's unrecognized fields are ignored, not rejected.** Adding
  tolerance for a new service's quirks (as FreshRSS's numeric stream ID and
  `content.content` were added) must never turn an unrecognized field into
  an import failure for *other* services' exports — the parser degrades
  unknown categories and fields to "ignored" (see
  [Label vs. state vs. tag rules](#label-vs-state-vs-tag-rules)), and any
  future exporter support should follow that same pattern.
