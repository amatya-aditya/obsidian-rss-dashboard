# Security & Privacy Policy

## Overview

RSS Dashboard is an Obsidian plugin that requires access to certain sensitive Obsidian APIs and user system resources to provide core features. This document explains the security model, why these permissions are necessary, and how we protect user data.

**Current Status**: All features have been audited and permissions are justified by core functionality.

---

## Vault Access

### Vault Read (`vault.read`, `vault.cachedRead`)

**Purpose**: Reading individual vault files from the user's Obsidian vault.

**Used By**:

- **Save Article Feature**: Reads user's vault structure to determine save locations, validate folder permissions, and check for existing article files
- **Shard Storage Model**: Reads modular JSON configuration files that store per-feed metadata and settings

**Data Protection**:

- ✅ Vault read access is **read-only** — no modifications occur without explicit user action
- ✅ Only accesses files necessary for plugin operation (article destinations, configuration files)
- ✅ Users can configure which folders the plugin can access via plugin settings
- ✅ No data is transmitted outside the local vault

---

### Vault Write (`vault.modify`, `vault.create`)

**Purpose**: Creating and modifying files in the user's Obsidian vault.

**Used By**:

- **Save Article Feature**: Persists full articles to the vault in user-configured locations. Users can:
  - Choose where saved articles are stored (folder, filename patterns)
  - Control article metadata (date formatting, tags, properties)
  - Enable/disable the feature entirely
- **Shard Storage Model**: Saves modular JSON configuration files for each feed. This system:
  - Stores feed subscriptions, filter settings, and display preferences
  - Organizes data into individual per-feed files for better version control and conflict resolution
  - Only writes to plugin-managed configuration folders (not user content)
  - Replaces the previous monolithic `data.json` approach with a more granular storage model

**Data Protection**:

- ✅ Writes are limited to:
  - User-approved article save locations
  - Plugin configuration directories (`.obsidian/plugins/obsidian-rss-dashboard/`)
- ✅ Users retain full control over saved article content and metadata
- ✅ All data remains in the local vault; no cloud transmission
- ✅ Changes are tracked by Obsidian's file system and version control (git/sync integrations)

---

## Clipboard Access

**Purpose**: Reading and writing the system clipboard.

**Used By**:

- Exporting feed list (OPML format) to clipboard for sharing
- Importing feeds via clipboard paste
- Copying article URLs or content snippets for quick sharing

**Data Protection**:

- ✅ Clipboard access is **user-initiated** — the plugin only reads/writes when users explicitly click export/import buttons
- ✅ No automatic or background clipboard monitoring
- ✅ Users can clear clipboard contents after use via system controls
- ⚠️ Note: Clipboard contents may contain sensitive information if users copy from outside Obsidian

---

## External Domain Requests

**Current Count**: 184 unique external domains

**Why External Requests Are Needed**:
RSS feeds are hosted on external servers — the plugin must fetch feed content to provide the core RSS reading functionality.

### Feed Sources Include:

- Major news outlets (BBC, Reuters, NPR, etc.)
- Technology blogs and publications
- Newsletter platforms (Substack, Medium, etc.)
- YouTube feeds
- Academic publishing sites
- Personal blogs and niche RSS publishers

### Data Sent to External Domains:

- Feed subscription URLs (required to fetch content)
- Minimal HTTP metadata (User-Agent header, standard HTTP headers)
- **No user credentials** are transmitted
- **No vault content** is sent to external servers

### Request Logging:

- ✅ All feed requests go through standard HTTP/HTTPS protocols
- ✅ RSS Dashboard respects the RSS feed protocol specifications
- ✅ Feed requests can be monitored in browser network tabs when using Developer Tools

### User Control:

- Users choose which feeds to subscribe to
- Users can block/unsubscribe from any feed at any time
- Users can configure request timeouts and retry limits in plugin settings
- Feeds can be tested before adding to verify content is appropriate

---

## Network Security

**HTTPS Support**: ✅ All feed requests support HTTPS encryption

- Feeds are fetched over secure connections when available
- Feed URLs are validated before making requests

**Feed Validation**:

- Feeds are parsed according to RSS/Atom specifications
- Invalid or malformed feeds are handled gracefully
- Large feeds are truncated to prevent memory issues

**No Telemetry**: ✅

- RSS Dashboard does **not** collect usage data
- No analytics or tracking of user activity
- No plugin behavior is reported to external services

**Progress Tracking**: ✅ Local Storage Only

- Reading progress, playback position, and other user state is saved to your vault's local storage only
- No data leaves your vault or device
- All progress data remains under your full control

**Future Roadmap Note**

- Analytics feature is planned for future versions as an optional, opt-in feature
- If implemented, it would track high-level insights (reading time, articles read) with explicit user consent
- Current version (v2.x) has no analytics capability whatsoever

---

## Build & Distribution

**Build Verification**: Status: Not yet available

- Future: GitHub artifact attestation will be added to release artifacts
- Allows verification that release builds match source code in this repository

**Obfuscation**: Status: Not used

- Source code is available in this public repository
- Compiled plugin code is not obfuscated — developers can inspect the build

**Dependency Security**: ✅

- Dependencies are regularly updated
- See `package.json` for complete dependency list
- Vulnerable dependencies scans are planned

---

## Malware & Vulnerability Scans

**Current Status**: Scans not yet available from Obsidian security infrastructure

**Code Safety**:

- ✅ All code is open-source and publicly available at: https://github.com/joethei/obsidian-rss-dashboard
- ✅ Code reviews are conducted before merging changes
- ✅ TypeScript provides type safety and compile-time error detection
- ✅ ESLint rules enforce security best practices

**Responsible Disclosure**:

- If you discover a security vulnerability, please report it responsibly
- See `CONTRIBUTING.MD` for security reporting guidelines

---

## Data Retention

**Plugin Data**:

- All plugin data (feeds, settings, shard storage files) is stored locally in your vault
- Data is **only** synchronized if you use Obsidian Sync or another vault sync service
- RSS Dashboard does not independently back up or transmit data

**Article Cache**:

- Articles fetched from RSS feeds are cached locally during the session
- Cache is cleared when the plugin reloads or Obsidian restarts
- Saved articles remain in your vault according to your save settings

---

## Permissions Summary Table

| Permission             | Feature                     | Risk Level | User Control             |
| ---------------------- | --------------------------- | ---------- | ------------------------ |
| Vault Read             | Save article, shard storage | Low        | Configured in settings   |
| Vault Write            | Save article, shard storage | Medium     | Configured in settings   |
| Clipboard Access       | Import/export feeds         | Low        | User-initiated only      |
| Network Requests       | Fetch RSS feeds             | Medium     | Feed subscription choice |
| External Domains (184) | RSS feed sources            | Medium     | Feed selection           |

---

## Recommendations for Users

### Best Practices:

1. **Review your feed subscriptions regularly** — unsubscribe from feeds you no longer read
2. **Use article save filters** — configure which articles are automatically saved to your vault
3. **Enable vault sync carefully** — consider the privacy implications of syncing articles to cloud services
4. **Monitor clipboard contents** — remember that clipboard data may persist outside Obsidian
5. **Keep Obsidian updated** — security updates from Obsidian core are important for your security

### Privacy Considerations:

- RSS feeds are fetched from external servers — feed publishers can see your IP address
- If you use Obsidian Sync or iCloud, your articles/feeds may be transmitted to cloud services
- Saved articles containing sensitive information should be encrypted or kept offline

---

## Future Improvements

- [ ] GitHub artifact attestation for release verification
- [ ] Automated vulnerability scanning in CI/CD pipeline
- [ ] Malware scanning integration
- [ ] Detailed request logging option (opt-in)
- [ ] Feed-level security warnings for untrusted sources

---

## Questions or Concerns?

If you have questions about this security policy or concerns about data privacy, please:

1. Open an issue on GitHub: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues
2. Review the source code: https://github.com/amatya-aditya/obsidian-rss-dashboard
3. Consult the `CONTRIBUTING.MD` file for security reporting
4. View our latest scorecard compliance on our Community page: https://community.obsidian.md/plugins/rss-dashboard

---

**Last Updated**: May 13, 2026  
**Document Version**: 1.0  
**Plugin**: RSS Dashboard for Obsidian
