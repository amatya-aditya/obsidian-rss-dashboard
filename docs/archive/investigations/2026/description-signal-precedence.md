# Description-signal precedence, measured against real publishers

Date: 2026-09-15

Resolves research ticket
[#265](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/265) under
wayfinder map [#263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263),
confirming (and partly correcting) the precedence proposed in
[#247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247).

## Question

Which page-level description signal is most reliably the publisher's actual
description of an article, and in what precedence order should they be tried?

#247 proposed, explicitly flagged as unconfirmed:

```text
meta[name="description"] -> og:description -> twitter:description
  -> JSON-LD description -> Readability excerpt -> RSS item description
```

## Recommended precedence (evidence-backed)

**Description tier** — publisher-authored prose only:

```text
1. meta[name="description"]
2. og:description
3. twitter:description        (defensive only; never adds information)
4. RSS/Atom item description  (only when short and not a prefix of the body)
```

**Excerpt tier** — derived text, a separate field, never labelled "description":

```text
1. Readability excerpt (only when it did NOT come from the page meta tags)
2. RSS/Atom item description
3. truncated article text
```

Two changes from #247's proposal:

- **Drop JSON-LD from the description path.** It was never the only signal on
  any page in the sample, duplicated the meta tags 28/31 times, and on the
  3 pages where it differed it was *worse* twice (raw HTML, double-escaped
  entities) and better once.
- **Move the Readability excerpt out of the description hierarchy entirely.**
  It is not an independent signal: Readability derives it from the very meta
  tags above it in the list, so putting it below them can only ever return a
  value they already returned. It is only independent when it falls back to the
  first paragraph — which is an excerpt by definition.

Also required, and not in #247: a **degenerate-description guard** (see
[Failure modes](#failure-modes-that-actually-occur)).

## Method and sample

- 55 article URLs were taken from the first item(s) of 50 live feeds spanning
  major news, tech press, independent blogs, Substack, Ghost, WordPress, Medium,
  dev.to, corporate engineering blogs, science magazines, and link aggregators
  (Hacker News, Lobsters, Slashdot).
- Each article page was fetched once with a desktop Chrome user agent, no
  JavaScript execution — the same conditions as the plugin's
  `fetchFullArticleContentWithOutcome`.
- Each page was parsed with `jsdom` and run through `@mozilla/readability`
  0.6.0, the exact version this repo ships, so `excerpt` numbers are the real
  library's behaviour and not a reconstruction.
- Every candidate signal was compared against the article's opening text as
  Readability extracts it, and against the RSS item's own `description` /
  `content:encoded`.

**Final sample: 47 article pages.** Excluded: 6 pages where the fetch did not
return the article (`nytimes.com` ×2 and `politico.com` returned HTTP 403,
`news.sky.com` an Akamai denial, `nature.com` a JS gate, `xeiaso.net` an Anubis
interstitial), and 1 Hacker News link that pointed at a project homepage rather
than an article.

**Limits, stated honestly.** One snapshot on one day; English-language pages
only; no JavaScript execution; a single article from most sites, so
site-specific quirks can be over- or under-weighted; the sample leans toward
technology publishers because that is what the plugin's users read. The 6
excluded bot-walled pages are themselves a finding: for paywalled majors the
plugin will often have no page metadata to resolve at all, and the RSS item is
all there is.

## Presence rates (n = 47)

| Signal | Present | Usable* |
| --- | --- | --- |
| `meta[name="description"]` | 42 (89%) | 40 (85%) |
| `og:description` | 42 (89%) | 41 (87%) |
| `twitter:description` | 31 (66%) | 30 (64%) |
| JSON-LD `description` on an Article-ish node | 31 (66%) | 30 (64%) |
| Readability `excerpt` | 47 (100%) | 45 (96%) |
| RSS item `description` | 45 (96%) | 42 (89%) |

\* "Usable" excludes placeholders shorter than 25 normalized characters and
values identical to the article title.

**43 of 47 pages (91%) carry a usable page-level description.** The 4 that do
not: `eli.thegreenplace.net`, `bcantrill.dtrace.org` and `research.google` have
no description meta tag at all, and one Substack post
(`astralcodexten.com`) ships the literal placeholder `"..."` in every slot.
`research.google` is the interesting case — it is client-rendered, so a static
fetch sees an empty head. That whole class of site is invisible to this pipeline.

## How often the signals disagree

| Pair | Identical, where both present |
| --- | --- |
| `meta` vs `og` | 35/40 (88%) |
| `og` vs `twitter` | 31/31 (**100%**) |
| `meta` vs JSON-LD | 28/31 (90%) |
| `meta` vs Readability `excerpt` | 38/42 (90%) |
| `meta` vs RSS item description | 23/40 (57%) |

One-sided presence is rare and symmetric: `meta` without `og` twice
(`jvns.ca`, `stackoverflow.blog`), `og` without `meta` twice
(`simonwillison.net`, `wordpress.org/news`). `twitter:description` never
appeared without `og:description`, and JSON-LD never appeared without both.

The five `meta` / `og` disagreements, in full — this is the entire evidence base
for choosing between them:

| Page | `meta` | `og` | Better |
| --- | --- | --- | --- |
| theverge.com (Steam Deck) | "Valve designer Pierre-Loup Griffais told IGN that RAM isn't impacting Steam Deck 2 plans…" (136 ch) | "Don't expect a Steam Deck sequel soon." (38 ch) | `meta` |
| theverge.com (AI slowdown) | plain description (108 ch) | social teaser (94 ch) | `meta`, marginally |
| dev.to ×2 | og's text **plus** `"… Tagged with react, usereducer, sessionstorage, webdev."` | clean | `og` |
| medium.com | title concatenated in front of the body text | body sentence only | `og` |

So `meta` wins twice, `og` wins three times, and both are publisher-authored in
all five. **There is no empirical basis for reordering these two.** Keeping
#247's `meta` -> `og` is fine — `meta[name=description]` is the HTML
description slot, `og:description` is defined by OGP as the *social card*
description, and the sample shows The Verge using exactly that distinction — but
the choice is close to arbitrary and should not be defended as measured.

`twitter:description` earns its place in the list only as insurance. It agreed
with `og:description` on **all 31** pages where both existed and never appeared
alone. Keeping it costs one `querySelector` and returns nothing.

## The crux: authored description vs truncated first paragraph

Of the 43 pages with a usable page description:

| Relationship to the article's opening | Pages | Share |
| --- | --- | --- |
| Distinct prose, not present in the body | 23 | 53% |
| Verbatim, appears at the very start of the body | 4 | 9% |
| Verbatim, appears elsewhere near the top of the body | 8 | 19% |
| Truncated with an ellipsis and continues into the body | 3 | 7% |
| Similar wording, not verbatim | 5 | 12% |

Reading all 43 pages individually and judging provenance rather than trusting
the automated buckets, **8 of 43 (19%) are a machine truncation of the article
body** and **35 of 43 (81%) are publisher-authored prose**:

| Page | Why it is a machine excerpt |
| --- | --- |
| `jeffgeerling.com` | the post's first three sentences verbatim, cut at a sentence boundary (Drupal trimmed body) |
| `simonwillison.net` | ellipsis cut of the post body |
| `wordpress.org/news` | ellipsis cut (WordPress default, no manual excerpt set) |
| `slashdot.org` | ellipsis cut of the story text |
| `dev.to` ×2 | ellipsis cut of the first line, with a tag suffix appended |
| `medium.com` | title plus the opening lines, ellipsis-terminated |
| `npr.org` | a hard prefix of the story's opening paragraph |

Every one of those eight is a CMS or platform default: Drupal, WordPress,
Slashdot, dev.to, Medium, a link blog, and NPR's lead-graf-as-dek. **None of the
12 major news organisations, none of the Ghost sites, and none of the Substack
posts in the sample produced a machine excerpt** — they all ship a hand-written
standfirst.

That is the answer to the central question. The worry behind #247 — that
`meta`/`og` are machine excerpts wearing a description's name — is **real but
minority, and concentrated in self-hosted-CMS blogs**. It is the plugin's own
`summary` field that is the machine excerpt in the general case, not the
publisher's metadata.

Note also that a trailing ellipsis is **not** a reliable marker of truncation.
Six descriptions ended in one; one (`hacks.mozilla.org`:
`"…Here's how we're shipping it safely…"`) is a stylistic flourish in an
authored line, and another (`france24.com`) is a truncation of the publisher's
*own longer description*, not of the body.

For contrast, using the plugin's current rule: **21 of 47 feed items (45%) ship
`content` / `content:encoded`**, which `extractSummary(item.content ||
item.description || "")` prefers
(`src/services/feed-parser/feed-parser-class.ts:630` and `:717`, definition at
`:452`). For those items, today's `summary` is *by construction* the first 220
characters of the article body. That is the bug, stated numerically.

## `og:description` as SEO boilerplate

**Zero cases in this sample.** No page carried a generic
"Read the latest news and analysis on…" description, and across the 8 sites
sampled twice (Guardian, BBC, NPR, The Verge, Ars Technica, TechCrunch, dev.to,
The Register) the `og:description` was **article-specific on every pair** —
never a site-level constant.

The one site-level constant observed, `"Xe Iaso's personal website."`, came from
a bot-challenge interstitial rather than the article, and sits in the excluded
set. That is worth remembering as a *shape*: when a fetch is intercepted, the
description you get back is the site's default, and it will look plausible.
A description that is identical across two items of the same feed is a decent
signal that the fetch was intercepted.

## Failure modes that actually occur

The realistic risks are not boilerplate. From 47 pages:

| Failure | Count | Example |
| --- | --- | --- |
| Placeholder text | 1 | Substack ships `"..."` in `meta`, `og`, `twitter`, JSON-LD **and** the RSS item |
| Description equals the title | 1 | `jvns.ca` |
| SEO tag suffix appended | 2 | dev.to appends `"… Tagged with react, usereducer, …"` to `meta` only |
| Title prepended to the text | 1 | Medium, in `meta` only |
| No description anywhere | 3 | including one client-rendered page |

A resolver therefore needs a cheap **degenerate guard** before accepting a
candidate: reject values under roughly 40 characters, values equal to the
article title after normalization, and values that are pure punctuation. On this
sample that guard fires on 2 of 43 pages and, in both, correctly falls through
to the excerpt tier. This is a new sub-decision the map does not currently have.

## How often the description restates the opening (sizes #269)

This is the number [#269](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/269)
depends on, so it is stated precisely.

Of the 43 pages with a usable page description, **15 (35%) share text verbatim
with the article body as Readability extracts it**, and **20 (47%)** if you also
count clear rewording.

Breakdown of the 15 verbatim cases by *form*:

- **Exact, at the head of the body: 4** (9% of 43) — Al Jazeera, Slow Boring,
  Citation Needed, Jeff Geerling.
- **Exact, appearing a little further into the extracted body: 8** (19%) —
  NPR, CNBC, Washington Post, Ars Technica, The Register ×2, CBC, dbtcharts.
  These are pages whose standfirst sits after a kicker or byline block.
- **Truncated with a trailing ellipsis: 3** (7%) — Simon Willison,
  wordpress.org/news, Slashdot.

So the dominant form is **exact restatement, not ellipsis truncation**. Only
3 of 15 duplicates carry the `…` marker that an ellipsis-based heuristic would
catch. A suppression rule built on "does it end in an ellipsis" would miss 80%
of the problem.

Breakdown of the same 15 by *cause* — this is what makes the fix tractable:

- **10 are the publisher's own dek/standfirst rendered on the page** as its own
  element, which Readability then pulls into the extracted body. The text is
  genuinely publisher-authored; it is duplicated only because the reader view
  shows both the description and the body.
- **2 are a true prefix** of a longer rendered paragraph (NPR, wordpress.org).
- **3 are not in the body at all** in element form but overlap textually
  (Jeff Geerling's Drupal auto-excerpt, Simon Willison's link-blog intro,
  Slashdot's story summary).

**Recommendation for #269:** suppress on *normalized text containment* — does
the resolved description, normalized and with a trailing ellipsis stripped,
appear inside roughly the first 1,500 characters of the resolved body? That test
catches 15/15 of the verbatim cases here at trivial cost, and it does not
mis-fire on the 23 pages whose description is genuinely distinct. Expect it to
fire on **about a third of full-fetched articles**. Do not attempt to suppress
the 5 "similar wording" cases; distinguishing them from a genuine standalone
description needs fuzzy matching, and getting it wrong deletes real content.

## Is JSON-LD worth parsing?

**No — not for the description.**

- 36 of 47 pages carried at least one `application/ld+json` block; 31 had an
  Article-ish node with a `description`.
- **28 of those 31 were byte-identical to `meta`/`og`.**
- It was **never** the only page-level signal — 0 of 47 pages had a JSON-LD
  description without a `meta` or `og` description.
- On the 3 pages where it differed it was *worse* twice and better once:
  - `npr.org` — JSON-LD carries raw markup:
    `"<em>The Pitt</em> and <em>Widow's Bay</em> took home the top prizes…"`.
    Consuming this would put literal `<em>` tags into a frontmatter field.
  - `cbc.ca` — double-escaped entities: `"Catherine O&apos;Hara"`.
  - `france24.com` — the one genuine win: `meta` was truncated at 208 characters
    with an ellipsis, JSON-LD carried the full 285-character sentence.

Cost side: median 1.8 KB and mean 2.4 KB of JSON per page to parse, on mobile,
plus the schema-walking code to find the right node in a `@graph`. One better
value in 47 pages does not pay for that, and two of the three differences would
require *additional* sanitizing code to be safe to use.

Two secondary observations worth recording, since they bear on how much
Readability can be trusted here:

- Readability 0.6.0's JSON-LD acceptance gate is strict — `@context` must match
  `^https?://schema.org/?$` exactly, and the node's `@type` must match its
  article-type list (`Readability.js`, `_getJSONLD`). It accepted a block on
  34 of 47 pages, and rejected Quanta's and Mozilla Hacks' outright.
- When it *does* accept one, `jsonld.excerpt` takes precedence over every meta
  tag, so Readability's `excerpt` on `npr.org` is the version with the raw
  `<em>` tags in it. Anything consuming `article.excerpt` inherits that.

## Is the Readability excerpt an independent signal?

**No.** This is a source-level fact, not an inference. In
`node_modules/@mozilla/readability/Readability.js`, `_getArticleMetadata`
assigns:

```js
metadata.excerpt =
  jsonld.excerpt || values["dc:description"] || values["dcterm:description"] ||
  values["og:description"] || values["weibo:article:description"] ||
  values["weibo:webpage:description"] || values.description ||
  values["twitter:description"];
```

and only if that is empty does `parse()` fall back to
`paragraphs[0].textContent` (the "use the article's first paragraph as the
excerpt" branch).

So Readability's `excerpt` **is** the page description, resolved with its own
precedence — one that notably puts JSON-LD and Dublin Core *above*
`og:description`, and `og:description` *above* `meta[name=description]`, the
reverse of #247's order for that pair.

The measurement matches the source: the excerpt was identical to the best page
meta signal on **40 of 47** pages. It differed on 7 — 3 because there was no
page metadata and it fell back to the first paragraph
(`eli.thegreenplace.net`, `bcantrill.dtrace.org`, `research.google`), and 4
because its internal order picked a different tag than ours would
(`npr.org`, `france24.com`, dev.to ×2).

**Consequence for the pipeline:** placing "Readability excerpt" below the meta
tags in a *description* hierarchy is dead code — by the time you reach it, it
can only hold a value you already rejected or already took. It belongs at the
top of the **excerpt** tier instead, and the resolver should know *which* branch
produced it. The cheap way to know: if `article.excerpt` equals any of the page
meta values we already read, it is a description, not an excerpt; otherwise it
is the first paragraph.

## The RSS item description is two different things

Comparing the RSS item's own `description` against the resolved page
description, over the 43 pages:

- **22 identical** — the feed ships exactly the publisher description.
- **12 substantially longer** — the feed ships the article body or a long
  excerpt (Guardian, The Verge ×2, CSS-Tricks, Mozilla Hacks, GitHub Blog,
  dev.to ×2, Slashdot, …). Hacker News and Lobsters items are worse still:
  their `description` is `"Article URL: … Comments URL: … Points: 48"`, which is
  neither.
- 7 other/shorter, 2 empty.

So the RSS item description cannot be assigned to one tier. It should be a
**description** candidate only when it is short and is not a prefix of the
body, and otherwise fall to the **excerpt** tier. Note also that 2 of the 47
pages had an RSS description but no usable page description at all, and 6 pages
could not be fetched — for those the feed is the only source.

## What this means for the code as it stands

- `extractSummary(item.content || item.description || "")`
  (`feed-parser-class.ts:630`, `:717`) preferring `content` means `summary` is
  the first 220 characters of the article body for 45% of items sampled. The
  field is an excerpt today; #247's split is the right shape.
- The two feed-parser call sites and the 220-character truncation move wholesale
  into the excerpt tier. The description tier is new and is fed by the page
  fetch, which means it only exists for items the user actually opens or saves —
  worth stating in the ADR, because dashboard previews for unfetched items will
  keep showing the excerpt.
- 6 of 55 fetches were bot-walled. The resolver must treat "fetched the page,
  found no description" and "could not fetch the page" as the same outcome for
  precedence purposes, and must not cache an interstitial's metadata as the
  article's.

## Newly specifiable for map #263

1. The description hierarchy is settled: `meta[name=description]` ->
   `og:description` -> `twitter:description` -> guarded RSS item description.
   JSON-LD is out of the description path. Readability `excerpt` moves to the
   excerpt tier.
2. A degenerate-value guard (equals title / under ~40 chars / punctuation-only)
   is a required part of the resolver, not an optional polish.
3. #269's suppression test should be normalized containment of the description
   in the head of the resolved body, expected to fire on ~35% of full-fetched
   articles, and should not attempt fuzzy matches.
4. `descriptionSource` provenance has low entropy — `meta` and `og` agree 88% of
   the time and disagree only in ways a reader would not care about. If
   provenance is persisted at all, the distinction worth recording is
   *description vs excerpt*, not *which meta tag*.
5. Client-rendered pages (`research.google` here) yield no head metadata to a
   static fetch. This is a known, accepted gap; it is not worth a headless
   renderer.

## Reproducing

The collection and analysis scripts were throwaway and are not committed. To
redo the measurement: fetch the first item of each feed, fetch that article URL
with a desktop UA, parse with `jsdom`, read `meta[name=description]`,
`meta[property=og:description]`, `meta[name=twitter:description]` and any
`application/ld+json` Article node, run `@mozilla/readability` on a fresh DOM,
and compare each value against the normalized head of `article.textContent`.
Note that `jsdom` throws on some modern CSS custom-property syntax
(`wired.com` here) — strip `<style>` blocks and retry.
