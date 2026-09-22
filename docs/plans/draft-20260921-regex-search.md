---
status: idea
created: 2026-09-21
issue: ""
milestone: ""
owner: unassigned
workstream: search
sequence: 2
depends_on:
  - draft-20260921-search-scope-and-global-search.md
release_requirement: ""
implementation: ""
---

# Regex Search Support

## Summary

Add optional regular-expression matching to RSS Dashboard article search while preserving existing plain-text search behavior.

The initial implementation should use an explicit `/pattern/flags` syntax similar to FreshRSS rather than adding a separate regex-only search interface.

Examples:

```text
OpenAI
/^OpenAI/
/openai/i
/(OpenAI|Anthropic)/i
/^AI:.*agents$/i
```

Plain text continues to behave exactly as it does today. Queries recognized as valid regex expressions use JavaScript's native `RegExp` engine.

This plan should build on the broader article-search foundation described in `draft-20260921-search-scope-and-global-search.md`.

## FreshRSS Reference

FreshRSS supports regular expressions inside its search system by enclosing expressions in `/ /`.

Its broader query language supports regex against fields such as:

- normal text;
- title;
- author;
- URL;
- tags.

Examples of the general model include:

```text
/pattern/
intitle:/pattern/i
author:/pattern/
```

RSS Dashboard does not need to reproduce the complete FreshRSS query language in the first implementation.

The useful initial behavior is simply:

```text
plain query        → normal substring search
/pattern/flags     → regex search
```

## Goals

1. Add regex matching without breaking normal search.
2. Use syntax recognizable to users already familiar with regex or FreshRSS.
3. Support regex in both page-level and global-search modes.
4. Handle malformed expressions clearly and safely.
5. Keep regex parsing and matching outside rendering components.
6. Create an architecture that could later support field-specific search syntax.

## Non-Goals

The first version should not attempt to implement FreshRSS's complete query parser.

Out of scope initially:

- `AND` / `OR` query grammar;
- parentheses/grouping at the query-language level;
- negated search clauses;
- date operators;
- saved searches;
- `title:`, `author:`, `url:`, etc.;
- SQL/database regex;
- a custom regular-expression engine.

Regex grouping and alternation _inside the regular expression itself_ remain supported naturally:

```text
/(OpenAI|Anthropic)/
```

## Query Detection

A query should be treated as regex only when it matches the expected delimiter syntax.

Examples:

```text
/foo/
```

```text
/foo/i
```

```text
/^foo.*bar$/im
```

Normal searches containing `/` should not accidentally become regex searches unless they form a complete valid regex expression.

Examples that should remain plain text or show explicit invalid-regex feedback depending on final parsing rules:

```text
https://example.com
foo/bar
/report
```

## Supported Flags

Recommended initial flags:

- `i` — case-insensitive
- `m` — multiline
- `s` — dot matches newline
- `u` — Unicode-aware behavior where supported

Do not initially expose:

- `g`
- `y`

Both introduce stateful `RegExp.test()` behavior through `lastIndex`, which can produce surprising results when the same expression is reused across multiple articles.

If `g` or `y` are entered, either reject them with a clear message or sanitize them before constructing the matcher. Explicit rejection is preferable because silently altering a user's expression may hide mistakes.

## Proposed Architecture

### [NEW/MODIFY] Shared search matcher

Add regex parsing to the search module introduced by the global-search plan.

Possible API:

```ts
type ParsedArticleSearch =
  | {
      type: "text";
      query: string;
    }
  | {
      type: "regex";
      regex: RegExp;
    }
  | {
      type: "invalid-regex";
      error: string;
    };
```

Parser:

```ts
parseArticleSearch(query: string): ParsedArticleSearch
```

Matcher:

```ts
matchesArticleSearch(
  article: FeedItem,
  parsedSearch: ParsedArticleSearch,
): boolean
```

This avoids recompiling the regular expression for every article.

## Matching Semantics

### Plain Text

Preserve current behavior:

- case-insensitive;
- substring matching;
- title search in the first version.

Conceptually:

```ts
title.toLowerCase().includes(query.toLowerCase());
```

### Regex

Regex must run against the **original title string**, not a lowercased version.

Case sensitivity is controlled by the expression itself.

Example:

```text
/OpenAI/
```

matches `OpenAI` but not `openai`.

```text
/OpenAI/i
```

matches both.

## Search Scope Interaction

Regex should work identically in both search modes.

### Page Search

With **Search all articles** disabled:

```text
/^AI:/i
```

matches titles on the current rendered page only.

### Global Search

With **Search all articles** enabled:

```text
/^AI:/i
```

runs against all eligible articles in the current dashboard context before pagination.

This separation lets regex describe **how to match**, while the search-scope setting determines **which articles are searched**.

## Invalid Regex UX

Malformed expressions should never throw into the UI or silently hide every article.

Example:

```text
/[openai/
```

Recommended behavior:

- retain the user's text;
- mark the search field as invalid;
- display a small message or tooltip such as:

> Invalid regular expression: Unterminated character class

- do not apply the invalid search.

Alternative behavior is to treat malformed regex as plain text, but this is less transparent because users may believe their regex is working.

Explicit validation is preferred.

## Discoverability

Regex should remain an advanced feature without cluttering the normal search interface.

Recommended addition:

> Regular expressions supported with `/pattern/i`

Possible placement:

- search-input tooltip;
- small help icon;
- search help popover;
- documentation.

Do not require a separate "Regex mode" toggle in the initial version. The syntax itself already provides an explicit mode switch.

## Escaping

The parser must correctly handle escaped delimiters.

Example:

```text
/https?:\/\/example\.com/i
```

The parser cannot simply use the first and last slash without accounting for escaped `/` characters.

Tests should include:

```text
/foo\/bar/
```

and similar cases.

## Performance & Safety

JavaScript regex runs locally and avoids the database-specific complexity used by FreshRSS.

However, user-authored regex can still be expensive.

Initial safeguards should include:

- compile the regex only once per query;
- avoid `g` and `y`;
- do not execute regex against unnecessary HTML or DOM structures;
- run against normalized article data;
- test behavior on large article collections.

### Catastrophic Backtracking

Some JavaScript regular expressions can exhibit catastrophic backtracking.

Example classes of problematic patterns can consume significant CPU when applied to large strings.

For title-only matching the practical risk is reduced because titles are short.

If regex is later extended to full article content, reassess:

- maximum searchable content length;
- query execution limits;
- safer-regex validation;
- worker-based execution;
- alternative regex engines.

This concern should not block title regex support but should be documented before full-content regex is added.

## Verification Plan

### Automated Tests

Add cases for:

- normal text search remains case-insensitive;
- `/OpenAI/` is case-sensitive;
- `/OpenAI/i` is case-insensitive;
- anchors such as `/^OpenAI/`;
- end anchors such as `/AI$/`;
- alternation such as `/(OpenAI|Anthropic)/`;
- character classes;
- quantifiers;
- escaped slash `/foo\/bar/`;
- multiline flag;
- Unicode titles;
- malformed regex;
- unsupported flags;
- slash-containing normal text;
- page search + regex;
- global search + regex;
- list/card/feed view consistency;
- MathJax/title metadata behavior remains correct.

### Manual Verification

1. Search for normal text and confirm no behavior regression.
2. Search `/OpenAI/`.
3. Compare results with `/OpenAI/i`.
4. Test anchored queries.
5. Test alternation.
6. Enter malformed regex and confirm the UI remains stable.
7. Test regex with **Search all articles** disabled.
8. Enable **Search all articles** and verify matches from later pages appear.
9. Test a feed with hundreds or thousands of articles for responsiveness.
10. Verify mobile and desktop search controls behave consistently.

## Future: Field-Specific Search

After regex and global search are stable, consider a separate structured-search plan.

Potential syntax:

```text
title:/AI.*agent/i
author:/karpathy/i
url:/arxiv\.org/i
feed:/Nature/i
content:/transformer/i
```

This would require a real query parser rather than continuing to add special cases to the regex parser.

A possible long-term progression is:

```text
Phase 1: plain text + regex
Phase 2: field selectors
Phase 3: negation and boolean operators
Phase 4: saved searches / smart views
```

Each phase should be independently useful and should not require RSS Dashboard to duplicate FreshRSS's entire query language.

## Open Questions

### Search Fields

Should regex initially remain title-only?

Recommendation: **yes**.

This preserves the current search contract and keeps regex execution inexpensive. Broader searchable fields should be addressed as a separate feature.

### FreshRSS Syntax Compatibility

Should future structured search intentionally mirror FreshRSS syntax?

This could improve familiarity and interoperability for FreshRSS users, but RSS Dashboard should only adopt syntax where its own data model and UX support the same semantics.

Compatibility should therefore be treated as a design reference rather than a strict requirement.
