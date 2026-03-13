# Feed Validation in RSS Dashboard

New feeds are validated through a multi-layered process that ensures technical compatibility and discoverability.

## 1. Direct Feed Entry Validation

When you add a feed URL manually in the **Add Feed** modal:

*   **Platform Resolution**: The plugin first checks if the URL is from a supported platform that isn't a direct RSS feed:
    *   **YouTube**: Automatically converts channel or video URLs to their respective RSS feed URLs.
    *   **Apple Podcasts**: Resolves podcast page URLs to their backend RSS feeds via the iTunes lookup API.
    *   **X (Twitter)**: Automatically redirects `x.com` and `twitter.com` user profile URLs to `nitter.net/username/rss` feeds.
*   **Content Validation**: The system fetches the URL content and performs a "smoke test":
    *   It checks the first 2048 characters for common feed signatures: `<rss`, `<feed`, `<rdf:rdf`, or specific XML namespaces (`http://purl.org/rss/1.0/`).
    *   It verifies that the feed actually contains "items" or "entries" (otherwise it shows a warning about an empty feed).
*   **Discovery Logic**: If a regular website URL is provided (e.g., `https://example.com`), the plugin attempts to:
    1.  Look for `<link type="application/rss+xml" ...>` tags in the HTML.
    2.  Search for common feed paths (e.g., `/feed`, `/rss.xml`, `/atom.xml`).
    3.  Follow specialized rules for WordPress, FeedBurner, and arXiv.

## 2. OPML Import Validation

For bulk imports via OPML files:

*   **Structure Validation**: Uses a `DOMParser` to ensure the file is valid XML.
*   **OPML Compliance**: Specifically looks for the `<opml>` root element and a `<body>` section.
*   **Feed Extraction**: Validates that the file contains at least one valid `<outline type="rss" ...>` or similar entry before allowing the import.

## 3. Robust Fetching (Bypassing Restrictions)

To ensure feeds load even when servers have strict cross-origin (CORS) policies:

*   **Proxy Fallback**: If a direct fetch fails, the plugin tries several CORS proxies in sequence (AllOrigins, CodeTabs, Cloudflare-protected proxies, etc.).
*   **JSON-to-XML Conversion**: If a site only provides a JSON response, the plugin uses `rss2json` to fetch and reconstruct a valid RSS XML structure for internal processing.

## 4. Technical Implementation

The following files manage the feed validation and redirection logic:

### Core Services
*   [media-service.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/media-service.ts): Contains platform-specific detection and URL transformation logic (e.g., `isYouTubeFeed`, `isXUrl`, `getNitterRssFeed`).
*   [feed-parser.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/feed-parser.ts): Handles low-level XML parsing, signature detection (`isValidFeed`), and proxy fallbacks for fetching.
*   [opml-manager.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/opml-manager.ts): Logic for parsing and merging OPML files.

### UI Components
*   [feed-manager-modal.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/modals/feed-manager-modal.ts): Implements the `AddFeedModal` and `EditFeedModal` which orchestrate the resolution process and display status updates (including the "X > nitter conversion" notice).
*   [import-opml-modal.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/modals/import-opml-modal.ts): Manages the file selection and preliminary validation of OPML files.
*   [feed-preview-modal.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/modals/feed-preview-modal.ts): Provides a visual preview of feed content before finalizing additions.

### Verification
*   [x-nitter-redirection.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/x-nitter-redirection.test.ts): Unit tests for the X/Twitter to Nitter transformation logic.

## 5. Implementation Notes

### URL Reassignment in Modals
When implementing platform resolution (YouTube, Podcasts, X/Nitter) within the `AddFeedModal` or `EditFeedModal`, it is critical to reassign both the local `feedUrl` (used for the immediate preview fetch) and the shared `url` variable. 

Failure to reassign the `url` variable will cause the "Save" button to use the original user-pasted URL instead of the resolved RSS/Nitter URL, likely leading to parse errors during background refreshes.

### Nitter Format
We use the `https://nitter.net/username/rss` format for redirection. While some instances may vary, this is the standard for RSS-compatible Nitter instances.
