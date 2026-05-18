# Substack / RSS CDATA Entity Encoding

Last updated: 2026-05-18

## Problem

Substack and other richly-formatted RSS feeds use `content:encoded` CDATA sections containing HTML. Inside that HTML, JSON attribute values are double-quoted using `&quot;` entities to avoid breaking the XML attribute syntax:

```xml
<content:encoded><![CDATA[
  <img
    src="https://substackcdn.com/image/fetch/w_1456/https%3A%2F%2F..."
    data-attrs="{&quot;src&quot;:&quot;https://s3.amazonaws.com/...&quot;,&quot;fullscreen&quot;:null}"
  />
]]></content:encoded>
```

When the RSS XML is parsed with `DOMParser("text/xml")`, calling `.textContent` on the `content:encoded` element returns the raw CDATA text. The XML parser does **not** decode HTML entities inside CDATA — `&quot;` remains as the four-character literal string `&quot;` in the result.

## Root Cause

`getTextContent()` in `FeedParser` calls `sanitizeCDATA()`, which previously called `decodeHtmlEntities()` unconditionally on the entire HTML string. This converts `&quot;` → `"` throughout, including inside attribute values:

**Before** (valid CDATA text):

```
<img data-attrs="{&quot;src&quot;:&quot;https://s3.amazonaws.com/...&quot;}" src="..." />
```

**After** `decodeHtmlEntities()` (broken HTML):

```
<img data-attrs="{"src":"https://s3.amazonaws.com/..."}" src="..." />
```

The attribute value now contains unescaped double-quotes. When `populateArticleHtml()` later parses this string with `DOMParser("text/html")`, the HTML5 parser sees `data-attrs="{"` and terminates the attribute there, splitting the JSON into garbage attributes (`src=""`, `public=""`, etc.).

**Why `src` survives**: It appears before `data-attrs` in the markup and doesn't use `&quot;` entities, so it is parsed correctly through the entire pipeline.

## Fix

Added `isHtml: boolean = false` parameter to `sanitizeCDATA()` and `getTextContent()`. When `isHtml = true`:

- CDATA markers (`<![CDATA[` / `]]>`) are still stripped.
- `decodeHtmlEntities()` is **not called** — entities like `&quot;` are preserved as-is.
- Whitespace collapse (`/\s+/ → " "`) is also skipped (unsafe for preformatted HTML).

The downstream `DOMParser("text/html")` in `populateArticleHtml()` natively decodes HTML entities when it parses the HTML string, so no manual decoding step is needed for HTML content fields.

**Callers updated to pass `isHtml = true`:**

- `getTextContent(item, "content:encoded")` — RSS 2.0 content field
- `getTextContent(item, "encoded")` — RSS 2.0 content fallback
- `getTextContent(item, "content:encoded")` — RSS 1.0 `contentValue` field
- `getTextContent(entry, "content")` — Atom content field

**Unchanged (still decode entities):** all plain-text fields — `title`, `author`, `description`, `link`, `guid`, `category`, iTunes fields, etc.

## Cloudinary / Substack CDN URL Format

Substack images are served via Cloudinary's "fetch" delivery type through a CNAME:

```
https://substackcdn.com/image/fetch/$s_!wKWJ!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2F...
```

### `$s_!wKWJ!` is NOT a security token

| Format            | Meaning                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `$s_!wKWJ!`       | User-defined variable (`$s_`) holding a named transformation (`!wKWJ!`) |
| `/s--ABCDEFGH--/` | Cloudinary signed URL (8-char HMAC) — the actual auth format            |

Named transformations are saved presets of resize/format parameters. They are public, do not expire, and do not require authentication. The full S3 source URL is percent-encoded in the path tail after the transformation segment.

### Obsidian-clipper `!` truncation (does NOT apply here)

In markdown syntax (`![](URL)`), Obsidian's link parser truncates URLs at `!` because `!` opens image embedding syntax. This is the root cause of obsidian-clipper issues #450 and #468.

This does **not** affect our plugin's HTML `<img src>` attribute. The `src` is set via `setAttribute()` in the DOM, so the full URL (including `!`) is always preserved.

## Regression Tests

Three tests were added in `test_files/unit/services/feed-parser.test.ts` under the `"content:encoded HTML entity preservation"` describe block:

1. **Entity survival**: `item.content` contains `&quot;` (not decoded to `"` inside attribute values).
2. **Valid JSON attribute**: Re-parsing `item.content` with `DOMParser("text/html")` produces a `data-attrs` attribute whose value passes `JSON.parse()` and contains the correct `src` URL.
3. **Plain-text fields unchanged**: `title` entities (e.g. `&amp;`) are still decoded correctly.

## Debugging Live Image Failures

If images still fail to render after this fix, open **Developer Tools** in Obsidian (Ctrl+Shift+I) and check the console. `article-renderer.ts` attaches an `onerror` handler to every rendered `<img>` element that logs:

```
[RSS Dashboard] img load failed: <first 300 chars of src URL>
```

Possible remaining causes:

- Electron CSP blocking `substackcdn.com` or `s3.amazonaws.com`
- The Cloudinary named transformation `wKWJ` deleted or disabled on Substack's account
- Network-level blocking in the test environment
