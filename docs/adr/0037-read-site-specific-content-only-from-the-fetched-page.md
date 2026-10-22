# ADR 0037: Read Site-Specific Content Only from the Page the Fetch Already Returned

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-22

## Context and problem

The Reader's **Fetched content** version runs Mozilla Readability over the page the full-article fetch returns. That works for prose pages and fails for pages built as web apps. A GitHub issue opened from a feed item that only links to it shows empty numbered lists, oversized avatars, role-badge text such as "MemberAuthor" and "Reacted by ..." strings, because the page's DOM is an application layout, not an article ([GitHub Issue #1394](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1394)).

GitHub's issue page also carries the issue's data as JSON in the page itself, including the rendered body and comments. Reading it gives clean content with no further request. That is a site-specific code path, and [ADR 0013](0013-render-reddit-posts-from-rss-content.md) said Reddit "gets no special-case code path in the reader". Without a recorded rule, a later contributor could read that line as forbidding any site-specific extractor, or read the extractor as a precedent for fetching more from a site until it works, including by sending another crawler's user agent, which ADR 0013 rejected.

## Decision

A site-specific extractor is allowed when it follows one rule: **it reads only the page the fetch already returned.** It makes no extra request, adds no header, and does not impersonate a crawler or a user agent. When the page does not have the data it expects, it returns nothing and the Readability output is used unchanged.

This narrows ADR 0013's "no special-case code path" to Reddit. Reddit stays as decided there: its content comes from the feed, because its post page is reachable only to crawlers the plugin will not impersonate.

GitHub issue pages (`github.com/{owner}/{repo}/issues/{n}`) are the first extractor under this rule. Pull requests, discussions, releases, commits and gists are not covered and keep the Readability path.

## Consequences

### Benefits

- Issue pages read as plain text in both Readers and in a note saved as Fetched content, with no added requests, token or API quota.
- The request budget of [ADR 0022](0022-rss-first-reader-content-selection.md) and the identity rule of [ADR 0025](0025-identify-outbound-requests-as-obsidian.md) are untouched.
- The worst case equals today's output, so a change on the site's side cannot make a page worse than it is now.

### Trade-offs

- An extractor depends on a page's embedded data, which the site can change or remove without notice. The result is a return to the Readability output, not an error.
- Only what the first page response carries is shown. For an issue, that is the first page of comments; a closing line names the rest and links to the issue.
- Each extractor is code to maintain for one site. This ADR makes adding one a deliberate choice that needs the rule above, not a default.

### Existing users and data

- No stored data changes and nothing migrates. A note saved earlier is not rewritten; a save made after this change uses the cleaner content through the existing fetch path.

## Considered options

### Option A: Keep Readability only

No new code, and consistent with ADR 0013's wording. Rejected for GitHub because the output is unreadable and the issue's content is on the page already.

### Option B: Use the GitHub REST API

Documented and stable. Rejected: unauthenticated access is limited to 60 requests an hour per IP, an issue needs at least two requests, and the page already carries the data.

### Option C: Parse the rendered DOM

Covers pull requests too. Rejected for now: author and date sit under hashed class names that change. It remains the route for a pull-request follow-up.

### Option D: Read the embedded data of the fetched page (chosen)

Costs no request, needs no credentials, and fails back to today's output.

## Implementation notes

- The extractor is `extractGitHubIssueContent` in `src/utils/github-issue-page.ts`; `parseArticleContent` in `src/utils/fetch-helpers.ts` tries it first.
- The page's hero image and metadata extraction are unchanged ([ADR 0033](0033-use-the-pages-own-image-as-the-fetched-heros-source.md)).
- `ArticleSaver` is unchanged: it saves what the fetch returns ([ADR 0022](0022-rss-first-reader-content-selection.md)).

## Related

- [ADR 0013: Render Reddit Posts from RSS Content](0013-render-reddit-posts-from-rss-content.md): narrowed by this ADR
- [ADR 0022: RSS-First Reader Content Selection](0022-rss-first-reader-content-selection.md)
- [ADR 0025: Identify Outbound Requests as Obsidian, Not as a Browser](0025-identify-outbound-requests-as-obsidian.md)
- [GitHub Issue #1394](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1394): the feature
- [GitHub Issue #1500](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1500): verification and this record
