# Publisher language-signal coverage

Research record for issue [#264](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/264),
a ticket under the article-metadata wayfinder map
[#263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263).
It exists to answer one go/no-go question for
[#246](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/246): with
local text-based language detection ruled out of scope, does the set of
*declared* language signals cover enough real articles to make a `{{language}}`
template variable worth shipping?

Sample collected 2026-09-15.

## Executive summary

**Ship it.** `<html lang>` alone is declared on **96% of article pages** in the
sample, feed-level `<language>` / `xml:lang` lifts the union to **98%**, and the
signals never disagreed about what language the article actually was.

The driving number is **96%**, and the reason it drives the recommendation is
that it costs nothing: it is a single attribute read, and Readability already
hands it to us as `article.lang` on a field the plugin currently throws away.

Three numbers qualify it:

| Condition | Coverage |
| --- | --- |
| Full-page fetch succeeded (`<html lang>`, plus feed fallback) | 98% |
| Full-page fetch succeeded (`<html lang>` alone) | 96% |
| **No page fetch — feed-level signals only** | **57%** |

The 57% is the number to worry about, not the 96%. Full-article fetch is opt-in
in this plugin; for an item whose page was never fetched, `{{language}}` is
blank 43% of the time. That is a scoping constraint on #246, not a reason to
kill it.

Two other findings matter more than the headline coverage:

- **`og:locale` and JSON-LD `inLanguage` added exactly zero incremental
  coverage.** Every page that declared either also declared `<html lang>`
  (0/100 pages had one without the other). They are refinement signals, not
  coverage signals. Parsing them buys precision on ~15 pages in 100 and buys no
  new articles at all.
- **Signals never disagreed about the language.** Across the 69 pages carrying
  two or more signals, base-language disagreement was **0%**. Exact-string
  disagreement was 70%, but every single instance was casing, underscore-vs-
  hyphen, or region precision (`en` vs `en-US`). Not one was a genuine conflict
  about what language the article was in.

## Method and sample

Feeds and pages were fetched directly over HTTPS with a desktop browser
`User-Agent`, and the raw XML/HTML was inspected. Everything below is from
observation of those bytes. Spec claims are cited separately and flagged as
specs.

**Feeds**: 58 attempted, **53 usable** (42 RSS 2.0, 11 Atom). Five dropped on
fetch (three 404s from dead feed URLs, two timeouts). The list deliberately
spreads across:

- Big news orgs: BBC (News / Arabic / Hindi), Guardian, NYTimes, NPR, Al Jazeera
- Non-English Latin-script: Le Monde, Der Spiegel, El País, G1 Globo, Corriere,
  NU.nl, Heise, Clarín
- Non-Latin script: NHK (ja), Meduza (ru), Hankyoreh (ko), Liberty Times
  (zh-TW), NYTimes Chinese (zh), BBC Arabic (ar), BBC Hindi (hi)
- Platform-hosted: WordPress (TechCrunch, Smashing, WordPress.org, Mozilla
  Hacks, Stack Overflow Blog), Ghost (404 Media, Platformer), Substack (ACX,
  Noahpinion, One Useful Thing), Blogger, Tumblr, Medium-adjacent (dev.to)
- Independent blogs: Simon Willison, Daring Fireball, Julia Evans, Drew DeVault,
  Xe Iaso, Overreacted, Kottke, Nicolas Hoizey, Go Blog, Python Insider
- Feed types an RSS reader actually ingests but a "publisher" survey would miss:
  YouTube channel Atom, Reddit Atom, GitHub releases Atom, Mastodon RSS, a
  podcast feed, arXiv, Hacker News, Slashdot

**Pages**: two article URLs per feed, **106 attempted, 100 usable**. The six
failures were hard blocks, not network noise: NYTimes 403 ×2, El País 403 ×2,
Le Monde 402 ×2 (paywall).

### Limits of the sample

- 53 feeds and 100 pages is enough to see shape, not enough for a second decimal
  place. Treat 96% as "almost all", not as 96.0%.
- It is a *curated* sample. Real subscription lists contain more dead, ancient
  and hand-rolled feeds than this, so the junk rate here is probably a floor.
- It skews English and Western. Ten languages and six scripts are represented,
  but only one feed each for Korean, Japanese, Hindi, Arabic and Russian.
- Two pages are not really articles. NU.nl returned a DPG Media consent gate
  (which still declared `lang='nl'`) and Reddit returned a bot interstitial
  (`lang="en"`). Both are counted as covered, which is mildly generous — though
  the same thing would happen in production, and the declared value was still
  right.
- Two pages per publisher cannot detect a publisher that declares language on
  some articles and not others. It did catch one intra-publisher
  inconsistency (Corriere: `it` on one article, `it-IT` on the other).

## Coverage per signal

### Page level (n = 100)

| Signal | Pages | Coverage |
| --- | --- | --- |
| `<html lang>` | 96 | **96%** |
| Readability `article.lang` | 96 | **96%** (identical by construction — see below) |
| `og:locale` | 32 | 32% |
| JSON-LD `inLanguage` | 21 | 21% |
| `<meta http-equiv="content-language">` | 0 | 0% |
| `<meta name="language">` / `DC.language` | 0 | 0% |
| **Any page signal** | 96 | **96%** |
| **Union incl. feed-level** | 98 | **98%** |

Signals present per page: 4 pages had none, 58 had exactly one, 23 had two, 15
had three.

The four pages with no page-level signal were Drew DeVault ×2 (bare `<html>`,
but the feed declares `en-US`) and Tumblr ×2. Tumblr's real `<html>` tag — the
one outside the IE conditional comments — carries no `lang`, and the Tumblr
feed declares nothing either, so those two pages are the only articles in the
sample with **no language signal anywhere**.

JSON-LD is worth one more number: 63 of 100 pages carried at least one
`application/ld+json` block, but only 21 of those 63 included `inLanguage`. So
even on pages that do structured data, two thirds omit the language.

### Feed level (n = 53)

| Signal | Feeds | Coverage |
| --- | --- | --- |
| Any feed-level language | 30 | **57%** |
| RSS `<channel><language>` | 25 | 60% of the 42 RSS feeds |
| Atom root `xml:lang` | 3 | 27% of the 11 Atom feeds |
| `<dc:language>` | 3 | 6% |
| Item- / entry-level `xml:lang` | **0** | **0%** |

Two notes with implementation consequences:

- **Atom feeds are the weak tier.** Only 3 of 11 (The Verge, Simon Willison,
  GitHub releases) set a root `xml:lang`. Daring Fireball, Julia Evans, Kottke,
  Heise, Go Blog, Nicolas Hoizey, YouTube and Reddit all ship Atom with nothing.
- **`dc:language` is not decorative.** For Hankyoreh and Slashdot it was the
  *only* feed-level signal. A parser that reads `<language>` and not
  `<dc:language>` loses those two outright.

Feed-level coverage by publisher type shows where the gap is:

| Type | Declared |
| --- | --- |
| WordPress | 5/5 |
| tech-media | 2/2 |
| news (non-English, Latin) | 6/8 |
| news (non-Latin) | 4/5 |
| news (major English) | 4/5 |
| indie blogs | 3/7 |
| **Substack** | **0/3** |
| **Ghost** | **0/2** |
| **BBC (all editions)** | **0/2** |
| aggregators (HN, Reddit) | 0/2 |
| YouTube / Mastodon / Tumblr | 0/3 |

WordPress is the reason RSS coverage is as high as 60% — it emits `<language>`
by default. Substack and Ghost both emit none, and between them they are a large
share of what modern independent publishing actually runs on.

### Readability's `lang` is not an independent signal

From the vendored source, `@mozilla/readability` 0.6.0
(`node_modules/@mozilla/readability/Readability.js`):

```js
while (node) {
  if (node.tagName === "HTML") {
    this._articleLang = node.getAttribute("lang");
  }
```

and `parse()` returns `lang: this._articleLang` (line 2771). So
`article.lang` is **the raw `<html lang>` attribute string, verbatim** — no
canonicalization, no validation, `null` when absent. Its coverage is by
definition identical to `<html lang>`, which the measurements confirm.

Two consequences:

1. There is no reason to parse `<html lang>` *and* consume Readability's `lang`.
   They are the same value.
2. `_articleLang` is assigned inside `_grabArticle()`, and `parse()` returns
   `null` when `_grabArticle()` fails. **On a page Readability cannot extract,
   the language is lost even though the attribute was right there.** Since the
   map already fixes the pipeline order as `fetch -> extract head metadata ->
   Readability.parse() -> resolve`, read `documentElement.lang` in the
   head-metadata step and treat Readability's `lang` as redundant.

Readability also parses JSON-LD (`_getJSONLD`) but never reads `inLanguage`
from it — confirmed by grep against the same file. Any JSON-LD language support
is our own code regardless.

## How often the signals disagree

Of 100 pages, **69 carried two or more signals** (counting `<html lang>`,
`og:locale`, JSON-LD `inLanguage`, and the feed-level tag).

| Comparison | Disagreement |
| --- | --- |
| Exact string, as declared | 48/69 = **70%** |
| After normalizing case and `_`→`-` | 38/69 = **55%** |
| After also mapping language names to codes | 36/69 = **52%** |
| **Base language (first subtag)** | **0/69 = 0%** |

Zero base-language disagreement is the finding. Every conflict was one of:

- **Precision**: `html=en` vs `feed=en-US` (Ars Technica, GitHub, Stack Overflow
  Blog, Darknet Diaries, arXiv, Slashdot), `html=nl` vs `feed=nl-nl` (NU.nl),
  `html=it` vs `feed=it-IT` (Corriere), `html=ja` vs `og=ja_JP` (NHK),
  `html=ko` vs `ld=ko-KR` (Hankyoreh), `html=ru` vs `og=ru_RU` / `ld=ru-RU`
  (Meduza), `html=de` vs `og=de_DE` (Heise), `html=es` vs `og=es_LA` (Clarín).
- **Region**: one real one. Simon Willison's page says `en-gb`, his feed says
  `en-us`. Same language, contradictory region, and neither is wrong enough to
  matter.
- **Script precision**: Liberty Times declares `html=zh-TW` and
  `ld=zh-Hant-TW`. The JSON-LD is strictly more informative.
- **Notation**: 23 of the 32 `og:locale` values use underscores.

The only cases that *looked* like base-language disagreement were BBC Arabic and
BBC Hindi, where JSON-LD says `"inLanguage": "Arabic"` / `"Hindi"` — English
language names, not codes — plus Hacker News' object-valued `inLanguage`.
Mapping those names to `ar` / `hi` and reading `alternateName` out of the object
collapses base-language disagreement to zero. They are value-quality problems,
not conflicts.

**Implication for the resolver**: a precedence order is nearly unnecessary for
correctness and matters only for precision. Since the signals never contradict
each other on meaning, picking the *most specific* well-formed value would be as
defensible as picking the highest-priority source — and simpler to explain.

## How often a declared value is junk

Across all 180 declared tags (page + feed, all signals):

| Defect | Count | Rate |
| --- | --- | --- |
| Wrong language for the page (e.g. `en` on a non-English page) | **0/96** | **0%** |
| Empty string `lang=""` | 0 | 0% |
| `und` | 0 | 0% |
| `null` / empty `inLanguage` | 0 | 0% |
| Not a well-formed BCP 47 tag as written | 28/180 | 16% |
| Well-formed but non-canonical casing | 13/180 | 7% |

**The plausibility result is the reassuring one.** Every page was checked by
comparing its declared base language against the dominant Unicode script of its
visible text. Zero of 96 declarations were implausible — no Arabic page claiming
`en`, no Japanese page claiming `en`. The classic "everyone copy-pastes an
English template" failure did not appear once, including on the non-Latin
publishers where it would have been most visible.

The 16% "malformed" figure is mostly not a publisher error:

- **23 of the 28 are `og:locale` underscore forms** — 23 of the 32 `og:locale`
  values in the sample (`en_GB`, `pt_BR`, `ja_JP`, `ru_RU`, `it_IT`, `de_DE`,
  `en_US`, `es_LA`). These are *correct per the Open
  Graph protocol*, which specifies "Of the format `language_TERRITORY`"
  ([ogp.me](https://ogp.me/)). They are simply not BCP 47 tags. Any consumer
  must translate `_` to `-`; this is a normalization requirement, not junk.
- **4 are the BBC JSON-LD language names** (`"Arabic"`, `"Hindi"`).
  schema.org's `inLanguage` says to "use one of the language codes from the IETF
  BCP 47 standard" ([schema.org/inLanguage](https://schema.org/inLanguage)), so
  these are genuinely out of spec.
- **1 is an object-valued `inLanguage`**: Hacker News' linked page carried
  `{"@type": "Language", "alternateName": "en-US"}`. schema.org permits `Text`
  *or* `Language` as the range, so this is valid and a string-only extractor
  would silently drop it.

Two subtler defects worth naming:

- **Clarín declares `og:locale=es_LA`.** That normalizes to a well-formed
  `es-LA`, and `LA` is a real ISO 3166-1 alpha-2 code — for **Laos**. The
  publisher means "Latin America". Syntactic validation will pass this; it is
  semantically wrong, and truncating to `es` is the only safe reading.
- **Quote style varies.** NU.nl serves `<html lang='nl'>` with single quotes.
  A regex-based extractor that only matches double quotes loses it. Reading
  `documentElement.lang` off a parsed DOM avoids the whole class of problem,
  which the map's pre-parse head-extraction step already sets up.

Non-canonical casing (7%) is concentrated in feeds: `en-gb` (Guardian, twice —
both `<language>` and `<dc:language>`), `en-us` (NYTimes, Simon Willison's Atom
`xml:lang`, Blogger, Darknet Diaries, arXiv, Slashdot `dc:language`), `nl-nl`
(NU.nl). Two pages too: Simon Willison `en-gb`, Blogger `en-us`. Everything
normalizes cleanly with the standard rule (lowercase primary, Title-case script,
UPPERCASE region).

### One junk source is inside this repo

`src/services/feed-parser/feed-fetch.ts:45` — the RSS2JSON proxy path
synthesizes an RSS document and writes:

```ts
<language>${feed.language || "en"}</language>
```

Nothing reads `<language>` today, so this is currently inert. But if #246 adds a
feed-level language parser, **every feed fetched through the RSS2JSON proxy will
report `en`**, fabricated, regardless of its actual language. That is the single
highest-risk junk source found in this investigation, and it is ours. The
fallback should be dropped or the fabricated value marked, before any resolver
starts reading that element.

## Are regional variants worth preserving?

**Yes — preserve them; do not truncate to the base language.**

**81 of 180 declared tags (45%) carry a region or script subtag** (58 written
with a hyphen, plus the 23 underscore-form `og:locale` values). That is not a
rounding error, and the variants are not confined to English.

Twelve base languages appeared across the signals. Ten of them appeared in more
than one form:

| Base | Forms observed |
| --- | --- |
| `en` | `en`, `en-GB`, `en-US` |
| `zh` | `zh`, `zh-TW`, `zh-Hant-TW` |
| `de` | `de`, `de-DE` |
| `es` | `es`, `es-LA` |
| `it` | `it`, `it-IT` |
| `ja` | `ja`, `ja-JP` |
| `ko` | `ko`, `ko-KR` |
| `nl` | `nl`, `nl-NL` |
| `ru` | `ru`, `ru-RU` |
| `hi` | `hi`, `hi-IN` |
| `pt` | `pt-BR` only — never bare |
| `ar`, `fr` | bare only |

Most of these regions are cosmetic — `it-IT`, `ja-JP`, `ru-RU`, `nl-NL` and
`de-DE` carry no information the base language lacks. But some carry real
information, and truncation destroys it:

- **`zh-TW` / `zh-Hant-TW` vs `zh-CN`** is traditional vs simplified script.
  Truncating Liberty Times to `zh` throws away the only thing a reader of a
  multilingual library would want to filter on.
- **`pt-BR` vs `pt-PT`** — G1 Globo declares `pt-BR` in both its feed and its
  `<html lang>`, consistently. Brazilian and European Portuguese are
  meaningfully different targets.
- **`en-GB` vs `en-US`** is the cosmetic case, and it is also the noisiest: 19
  of 100 pages had a page tag and feed tag that shared a base but differed in
  precision, and most of those were English.

The recommendation is therefore: **store the tag as declared (normalized to
canonical BCP 47 casing), never truncate.** Truncation is a lossy transform that
buys consistency the user did not ask for. If #246 later wants a base-language
facet for grouping, deriving `zh` from a stored `zh-Hant-TW` is trivial;
recovering `zh-Hant-TW` from a stored `zh` is impossible.

One caveat on precision: in 15 of the 32 pages where `og:locale` co-occurs with
`<html lang>`, `og:locale` is strictly more specific (`html=en`, `og=en_US`).
If the resolver prefers the more specific value it will inherit whatever the
publisher's marketing metadata says, including Clarín's `es-LA`. Preferring
`<html lang>` and accepting its lower precision is the more conservative
default, and is also the cheaper one.

## Recommendation on #246

**Ship it, on declared signals alone.** The evidence supports the feature at
roughly the strength the issue hoped for:

- **96%** of fetched article pages declare `<html lang>`.
- **98%** union with feed-level signals.
- **0%** base-language disagreement between signals.
- **0%** implausible declarations.
- **2 pages in 100** had no signal anywhere.

The original fear in #264 — "it ships a variable that is usually blank" — is not
borne out. `{{language}}` will be populated on nearly every saved article whose
page was fetched.

### Scope the implementation to match the evidence

The evidence argues for a *smaller* implementation than #246 sketched:

1. **`<html lang>` is the feature.** Read `documentElement.lang` in the
   pre-`parse()` head-metadata step (which the map already mandates), normalize
   it, done. That is 96 of the 98 points of coverage.
2. **Feed-level `<language>` / `xml:lang` / `dc:language` is the fallback
   tier** — and it is the *only* tier when the user has full-article fetch off,
   where it carries the whole feature at 57%. Parse all three elements, not just
   `<language>`.
3. **`og:locale` and JSON-LD `inLanguage` are optional and can be deferred.**
   They add **zero** coverage. They only add precision, on ~15 pages in 100, and
   they bring the two worst value-quality problems in the sample with them
   (English language names, and `es-LA`). If the metadata extractor is parsing
   `og:*` and JSON-LD anyway for other variables, adding language is nearly
   free — but do not build either *for* language.
4. **Normalization is mandatory, and is where the real work is.** `_` → `-`;
   lowercase primary subtag, Title-case script subtag, UPPERCASE region subtag;
   reject the empty string (per the WHATWG HTML standard, `lang=""` explicitly
   means "the primary language is unknown", so it must not be stored as a
   value); reject `und`; reject non-tag values such as `"Arabic"` unless a name
   map is added deliberately.
5. **Fix `rss2JsonToRss`'s `|| "en"` before reading feed `<language>`.**

### What the map should treat as newly specifiable

- The map's open question "where feed-level `<language>` / `xml:lang` parsing
  sits relative to the page-metadata extractor" now has evidence behind it:
  they are **different tiers with different availability**, not the same
  concern. The page tier only exists when a page fetch happened; the feed tier
  is the sole source otherwise. They belong in one resolver with an explicit
  tier order, but the parsers belong in different places.
- **`languageSource` provenance is worth more here than elsewhere.** The 57%/96%
  split means the same feed item can have a language of very different
  confidence depending on whether its page was fetched. That is exactly the kind
  of thing provenance is for.
- **Aggregator feeds break the feed tier's premise.** Hacker News, Reddit and
  similar feeds link to third-party pages that can be in any language, so a
  feed-level tag would be wrong by construction. Neither of the two aggregator
  feeds sampled declared one, so nothing is broken today — but it is an argument
  for keeping the feed tier strictly last, and for provenance.
- **Readability's `lang` should not be plumbed through as a distinct field.** It
  is `<html lang>` verbatim, and it is `null` whenever `parse()` fails. Reading
  the attribute directly is strictly better.

## Specs referenced

Cited as specifications, distinct from the observations above.

- **BCP 47 / RFC 5646** — the language-tag syntax everything below defers to.
- **WHATWG HTML Standard**, the `lang` attribute: "Its value must be a valid
  BCP 47 language tag, or the empty string. Setting the attribute to the empty
  string indicates that the primary language is unknown."
  <https://html.spec.whatwg.org/multipage/dom.html>
- **RSS 2.0 specification**, `<language>`: "The language the channel is written
  in. This allows aggregators to group all Italian language sites, for example,
  on a single page." Allowable values are the Netscape list or W3C values; the
  spec's own example is `en-us`. <https://www.rssboard.org/rss-specification>
- **RFC 4287 (Atom)**, §2: "Any element defined by this specification MAY have
  an `xml:lang` attribute, whose content indicates the natural language for the
  element and its descendents." The schema types it as `atomLanguageTag`, and
  it is part of `atomCommonAttributes`, so it may appear on `feed` *or* on any
  `entry`. No sampled feed used the per-entry form.
  <https://www.rfc-editor.org/rfc/rfc4287.txt>
- **Open Graph protocol**, `og:locale`: "The locale these tags are marked up in.
  Of the format `language_TERRITORY`. Default is `en_US`." <https://ogp.me/>
  Note the default — a publisher emitting `en_US` may be emitting a library
  default rather than a claim.
- **schema.org `inLanguage`**: "The language of the content or performance or
  used in an action. Please use one of the language codes from the IETF BCP 47
  standard." Range is `Text` or `Language`.
  <https://schema.org/inLanguage>
- **`@mozilla/readability` 0.6.0** source, as vendored in this repo:
  `Readability.js` lines 1061 and 2771.

## Reproducing

The sampling scripts were throwaway and are not committed. To rebuild the
dataset: fetch each feed URL with a desktop `User-Agent`, extract the
channel/feed-level language elements and the first two item/entry links, fetch
those pages, and read `<html lang>`, `og:locale` and every `inLanguage` in every
`application/ld+json` block. The per-page plausibility check compares the
declared base language against the dominant Unicode script range of the page's
visible text, which is sufficient to catch the `en`-on-Arabic failure mode
without doing real language detection.
