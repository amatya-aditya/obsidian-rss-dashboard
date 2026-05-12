# Plan: Paywall And Restricted Article Handling

## Context

Some publishers, such as Bloomberg, allow RSS feeds to expose a headline and short excerpt while blocking the full article URL behind a paywall or access restriction. In that case RSS Dashboard can still render feed-provided content, but the current full-article fetch path may show noisy error toasts such as `request failed 403`.

Example source observed during investigation:

- `https://feeds.bloomberg.com/markets/news.rss`

## Problem Statement

When the full-article fetch is blocked, the current UX treats the failure like a generic network error even if the reader can still show a partial excerpt from the feed item.

That creates two problems:

1. The toast is misleading because the plugin still has some usable content.
2. The failure path is noisy and technical for expected publisher restrictions.

## Goals

1. Detect paywall/access-restricted article fetch failures more gracefully.
2. Continue showing available feed excerpt content when full article retrieval fails.
3. Replace technical toasts with a calmer user-facing message.
4. Keep diagnostics in logs without surfacing every retry detail to the user.

## Non-Goals

1. Do not attempt to bypass paywalls.
2. Do not scrape around subscriber walls or challenge systems.
3. Do not change feed parsing or metadata storage behavior in this work.

## Proposed UX

When a full-article request fails due to `403`, `401`, challenge pages, or common paywall markers:

1. Keep the currently available feed excerpt visible in the reader.
2. Show a single notice such as:
   - `Full article is restricted. Showing available feed excerpt.`
3. Avoid noisy intermediate notices like:
   - `Calling proxy...`
   - `Proxy fetch succeeded...`
   - `Network error: request failed 403`

For non-restricted failures, keep a normal network/system error notice.

## Proposed Technical Approach

Primary touchpoint:

- [src/utils/fetch-helpers.ts](c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/utils/fetch-helpers.ts)

Suggested changes:

1. Add restricted-content error classification for messages containing:
   - `403`
   - `401`
   - `forbidden`
   - `access denied`
   - `paywall`
   - `subscription required`
   - `subscribe to continue`
2. Extend blocked-response heuristics for HTML challenge/paywall pages where useful.
3. Reduce or remove user-facing retry/proxy progress notices.
4. Show one final restricted-content notice when:
   - direct fetch fails due to access restriction, and
   - proxy fallback is unavailable or also restricted.
5. Keep console warnings/errors for debugging.

## Validation Plan

1. Reproduce with Bloomberg feed items.
2. Confirm reader still shows feed excerpt without technical error toast spam.
3. Confirm restricted-content notice appears once.
4. Confirm genuine network failures still show a normal error notice.
5. Add targeted unit tests in:
   - [test_files/unit/services/fetch-helpers.test.ts](c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/services/fetch-helpers.test.ts)

## Open Questions

1. Should restricted-content notices be suppressed entirely if feed excerpt is already visible?
2. Should proxy fallback still run silently for restricted publishers, or stop earlier once the error is clearly a paywall?
3. Should the reader show a small inline banner instead of a toast?
