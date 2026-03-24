# Testing Documentation

This document serves as a reference for the testing strategy, test suites, and current status of the RSS Dashboard plugin.

## 🧪 Test Status
**Last Updated:** 2026-03-13
**Total Tests:** 61
**Passing:** 61
**Failing:** 0
**Coverage Areas:** Encoding detection, Feed Parsing (RSS/Atom/JSON), URL Redirection, YouTube Integration.

## 🛠 Testing Setup
The project uses **Vitest** for unit testing with a **jsdom** environment to simulate browser APIs (DOMParser, etc.).

- **Config:** `vitest.config.mjs`
- **Commands:**
  - `npm run test:unit` - Run all unit tests
  - `npm run test:unit -- <file>` - Run specific test file

## 📚 Test Suites Reference

### 1. Feed Parser (`test_files/unit/feed-parser.test.ts`)
Comprehensive regression suite for the `CustomXMLParser` and related utilities.
- **RSS 2.0:** Validates base structure, CDATA, `content:encoded` (with robust namespaced extraction for Substack), enclosures, authors, and channel images.
- **Atom:** Validates mapping of `<feed>`, `<entry>`, `<logo>`, and author fields.
- **JSON Feed:** Validates JSON structure parsing and graceful fallback for invalid JSON.
- **Safe URL Conversion (DOM-Based):** Validates that relative URLs in `ReaderView` and `ArticleSaver` are converted to absolute URLs using `DOMParser`, avoiding the `InvalidCharacterError` caused by brittle regex replacements.
- **Substack Optimization:** Verified preference for feed content over webpage fetching for Substack subdomains.
- **Entities:** Comprehensive check of HTML entity decoding (numeric and named typography like `&mdash;`).
- **Edge Cases:** Bare ampersands, Byte Order Marks (BOM), and Sage URL transformations.

### 2. Encoding Detection (`test_files/unit/encoding-detection.test.ts`)
Verifies the `robustFetch` logic in `platform-utils.ts`.
- Checks charset extraction from `Content-Type` headers.
- Checks `TextDecoder` fallback logic for various encodings (ISO-8859-1, Windows-1252, etc.).

### 3. X/Nitter Redirection (`test_files/unit/x-nitter-redirection.test.ts`)
Ensures Nitter URLs are correctly transformed to include the `/rss` suffix for feed fetching.

### 4. YouTube Integration
- **Shorts Detection (`test_files/unit/youtube-shorts-detection.test.ts`):** Validates the regex logic for identifying and rewriting YouTube Shorts URLs.
- **Embed Config (`test_files/unit/youtube-embed-config.test.ts`):** Verifies that YouTube embed parameters (like `autoplay=1`) are correctly applied.

## 📝 Best Practices for New Tests
1. **Mocking Obsidian:** Use the stubs in `test_files/stubs/obsidian.ts` and `platform-utils.ts` (mocked in vitest config).
2. **Environment:** Always ensure `environment: 'jsdom'` is set in the config if testing DOM-reliant code.
3. **Fixtures:** Keep XML/JSON fixtures within the test file or in a dedicated `fixtures/` directory if they become too large.
