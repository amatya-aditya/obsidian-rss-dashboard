# ADR 0013: Render Reddit Posts from RSS Content

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-24

## Context and problem

Reddit posts shown in the reader lose their formatting compared with reddit.com. Code blocks, such as config files and error logs, show up as one long run-on line with no line breaks, while other readers such as Feedly show them with the original line breaks ([GitHub Issue #363](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/363)).

The cause is upstream of the plugin. Reddit's RSS feeds replace every newline in a post with a single space before sending it. Paragraphs survive because each is its own `<p>` element, but the line breaks inside a `<pre>` code block are gone, and nothing marks where they used to be. A block like `[Security] EAP-Method=PEAP EAP-Identity=… [Settings] AutoConnect=true` can't be reliably split back into lines.

The formatted text does still exist on the post's own page on reddit.com, but Reddit only serves that page to crawlers it recognizes. On 2026-09-24, fetching `r/archlinux` and one of its posts gave:

| Request                                                                             | Result                                                                                                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Subreddit `.rss` or post `.rss`, any user agent (including Feedly's)                | The same feed. The whole document is one line with no newline characters.                                                  |
| Post page with Feedly's crawler user agent                                          | Full HTML (~575 KB). The post body is in `div[property="schema:articleBody"]`, and its `<pre>` blocks keep their newlines. |
| Post page with a browser user agent (the one the reader's full-article fetch sends) | An ~8 KB bot-challenge page with no post content.                                                                          |
| Post page with a plain `obsidian-rss-dashboard/…` user agent                        | The same ~8 KB bot-challenge page.                                                                                         |
| `.json` endpoints (`selftext_html`) on `www.reddit.com` or `old.reddit.com`         | 403, or a redirect to the login page.                                                                                      |

The reader already tries a full-article fetch when an article opens. For Reddit that fetch receives the challenge page, which has no usable content, so the reader falls back to the RSS content. This is the decision point future contributors will reach: comparing with Feedly shows that a recognized crawler's user agent unlocks the formatted page, which makes spoofing it look like an easy fix.

## User stories

The decision is intended to preserve these core user expectations:

1. As a reader of a Reddit feed, I want code blocks to be readable and clearly set apart, so that I can follow technical posts inside Obsidian.
2. As a user of a community plugin, I want the plugin to fetch content in ways the site permits, so that it keeps working and doesn't put my usage at risk.
3. As a reader who needs the exact original formatting, I want an easy way to open the post on Reddit, so that I can see it as the author wrote it.

## Decision

We will render Reddit posts from the content in Reddit's RSS feed and make that content as readable as possible in the reader, rather than trying to recover the original formatting from elsewhere.

We will not send another service's crawler user agent, or otherwise disguise the plugin's requests, to get past Reddit's bot gate.

We will not try to guess where the line breaks in collapsed code blocks belong.

Getting Reddit's original formatting through Reddit's official API is deferred. It's out of scope until there is a deliberate decision to build an authenticated Reddit integration.

## Consequences

### Benefits

- Reddit feeds keep working through the public RSS endpoints alone, with no Reddit account, app registration, or credentials.
- The plugin fetches content only in ways Reddit permits for general clients.
- Reddit gets no special-case code path in the reader. The code-block styling added for this problem applies to every feed ([GitHub Issue #365](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/365)).

### Trade-offs

- Code blocks in Reddit posts still read as run-on text. The reader styles them as a shaded monospace block that wraps within the reader width, but it can't restore their line breaks.
- For Reddit, the reader will keep looking less faithful than readers that have crawler or API access.
- The full-article fetch on open still spends one request per Reddit article on a page that comes back as the challenge page, before falling back to the feed content.

### Existing users and data

- None. No stored data changes, and there is no migration.

## Considered options

### Option A: Send a recognized crawler's user agent

Requesting the post page with Feedly's user agent returns the fully formatted body, which could be extracted from `div[property="schema:articleBody"]`. This is almost certainly how the formatting reaches readers like Feedly (they may also have API access). It would fix the symptom with a small change.

It was rejected because it means impersonating another company's crawler to get around a gate Reddit put there on purpose. It would also break without warning whenever Reddit changes which crawlers it recognizes, and it's the kind of behaviour a community plugin shouldn't ship.

### Option B: Reddit's official API (OAuth)

The API returns `selftext_html`, which keeps the original line breaks. This is the supported way to get Reddit's formatted content.

It was deferred rather than rejected. It would need each user to register a Reddit app and sign in, the plugin to store and refresh tokens, and a Reddit-specific fetch path. That's a feature in its own right, well beyond fixing the display.

### Option C: Guess where the line breaks belong

The plugin could insert line breaks before patterns such as `[Section]` headers, `key=value` pairs, or log timestamps.

It was rejected because code blocks hold arbitrary content. Any guess would be wrong often enough to corrupt code that users might copy.

### Option D: Render the RSS content, with better code-block styling (chosen)

This uses the content Reddit publishes for feed readers and makes collapsed blocks readable without changing the text. Users can open the original post through the feed's own **[link]** whenever they need the exact formatting.

## Implementation notes

- The reader's full-article fetch sends a browser user agent. Reddit answers with its challenge page, which the reader treats as having no content, so Reddit posts display the RSS content.
- If Option B is ever built, the formatted post body is available as `selftext_html` from the API. On the rendered post page it's `div[property="schema:articleBody"]` (also `#t3_<id>-post-rtjson-content`), but that page is only reachable by recognized crawlers.

## Related

- [GitHub Issue #363](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/363): the original report
- [GitHub Issue #364](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/364): spec for reader code-block styling
- [GitHub Issue #365](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/365) and [Pull Request #367](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/367): the code-block styling implementation
