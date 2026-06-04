audit-remediation-2.3.0.md

# Plugin Scorecard for RSS Dashboard

https://community.obsidian.md/plugins/rss-dashboard

This document tracks compliance status against the Obsidian Community Plugin audit scorecard.

## Compliance Score

| Version | Score | Date         | Status                                                                                                   |
| ------- | ----- | ------------ | -------------------------------------------------------------------------------------------------------- |
| 2.2.0   | 46%   | May 15, 2026 | ✅ Remediated — 100% target verified                                                                     |
| 2.3.0   | 72%   | May 26, 2026 | 🔄 Remediation in progress — see [audit-remediation-2.3.0.md](../development/audit-remediation-2.3.0.md) |

---

## v2.2.0 Remediation Summary (Completed May 2026)

All audit findings from the 46% audit were addressed through seven systematic compliance passes:

- **Clipboard & Deprecated APIs**: Migrated to modern Clipboard API
- **Unsafe HTML Rendering**: Replaced all `innerHTML` assignments with `sanitizeAndAppendHtml(...)`
- **Type Safety & ESLint**: Resolved 3239+ errors across 130 test files via boundary casting and strict interfaces
- **Popout Window Compatibility**: Migrated 100+ DOM API calls to `activeWindow`/`activeDocument` contexts
- **DOM Helpers**: Replaced raw `document.createElement` calls with Obsidian framework helpers
- **Lint Disable Descriptions**: Added explicit audit guardrails with inline justifications to all 37 `eslint-disable` comments
- **Parameter Hygiene**: Removed 10+ unused parameters across core services

**Detailed remediation history**: See [docs/development/test-lint-backlog-tracker.md](../development/test-lint-backlog-tracker.md) (Passes 1–7)

---

## v2.3.0 Audit Findings

### Risks — 1 Risk (Must Fix)

1. **Dynamic `<script>` element creation** — Dynamically injecting script elements can load and execute arbitrary external code. CI/CD rule added to block future regressions.

2. **Direct Filesystem Access** — Uses the Node.js `fs` module to access the filesystem outside of the Obsidian vault API. Can read and write any file on the system. Must migrate to Obsidian vault API.

### Warnings — 950 Warnings

Per project policy (see `CONTRIBUTING.MD`), warnings that cannot be eliminated are documented with inline `/* audit-ok: ... */` comments and approved in `CONTRIBUTING.MD`.

| Category                               | Count | Files                                                       |
| -------------------------------------- | ----- | ----------------------------------------------------------- |
| `!important` declarations              | 900   | `styles.css`, `modals.css`, `sidebar.css`                   |
| `css-scrollbar` partial support        | 14    | `styles.css`, `modals.css`, `sidebar.css`                   |
| `multicolumn` partial support          | 8     | `styles.css`, `card-view.css`, `modals.css`, `settings.css` |
| Duplicate `max-height`                 | 8     | `styles.css`, `modals.css`, `reader.css`, `sidebar.css`     |
| Duplicate `height`                     | 4     | `styles.css`, `modals.css`                                  |
| Duplicate `min-height`                 | 4     | `styles.css`, `modals.css`                                  |
| `css-display-contents` partial support | 2     | `styles.css`, `controls.css`                                |
| Duplicate `padding`                    | 2     | `styles.css`, `articles.css`                                |
| Duplicate `position`                   | 2     | `styles.css`, `controls.css`                                |
| Duplicate `bottom`                     | 2     | `styles.css`, `dropdown-portal.css`                         |
| Duplicate `color`                      | 1     | `articles.css`                                              |
| Duplicate `border`                     | 1     | `articles.css`                                              |
| Duplicate `line-height`                | 1     | `modals.css`                                                |

### Other

- Release contains extra artifact: `obsidian-rss-dashboard.zip` — only `main.js`, `manifest.json`, and `styles.css` are supported by the plugin registry.
- Clipboard access disclosure — verified current.

---

## Pending Re-Audit

Active remediation tracked in [audit-remediation-2.3.0.md](../development/audit-remediation-2.3.0.md).

The community audit should re-scan to verify:

1. Dynamic `<script>` injection removed and CI/CD rule enforced
2. Node.js `fs` usage removed or migrated to Obsidian vault API
3. CSS warnings either eliminated or documented with inline `/* audit-ok */` comments per `CONTRIBUTING.MD` policy
4. Extra `.zip` release artifact removed from registry entry
5. Test suite remains fully compliant (130+ files, 1180+ tests, 0 lint errors)

---

## Health

- **Status**: Excellent
- **Details**: Actively maintained, highest commit velocity to date (486 commits / year). Remediation pipeline well-established.

### Hygiene

Has readme, license, description. ✅ Contributing guide exists (`CONTRIBUTING.MD` in root).

### Maintenance

Last commit 4 days ago. 486 commits in the past year. Last release 4 days ago.

### Responsiveness

Closed 87% of 77 issues. 3 contributors active in the past year.

### Adoption

6.7k installations, 528 stars.

---

## Disclosures

- [x] **External Domains**: Plugin may make requests to external domains for feed content. See `docs/SECURITY.md`.
- [x] **Clipboard Access**: Reads or writes the system clipboard for export features. Uses modern Clipboard API.
- [x] **Vault Read**: `vault.read`, `vault.cachedRead`. Core features: save article, shard storage model. See `docs/SECURITY.md`.
- [x] **Vault Write**: `vault.modify`, `vault.create`. Core features: save article, shard storage model. See `docs/SECURITY.md`.
- [ ] Malware scan not available.
- [ ] Vulnerable dependencies scan not available.
- [ ] Obfuscation scan not available.
- [ ] Network requests scan not available.
- [ ] Build verification not available.

---

## Documentation & Governance

- **[CONTRIBUTING.MD](../../CONTRIBUTING.MD)** — Canonical source of truth for compliance declarations, audit guardrails, and CSS warning exception policy
- **[docs/development/compliance-patterns.md](../development/compliance-patterns.md)** — Approved implementation patterns and anti-patterns for audit-sensitive code
- **[docs/development/test-lint-backlog-tracker.md](../development/test-lint-backlog-tracker.md)** — Historical record of all compliance remediation passes
- **[docs/development/audit-remediation-2.3.0.md](../development/audit-remediation-2.3.0.md)** — Active working checklist for v2.3.0 remediation
- **[docs/SECURITY.md](../SECURITY.md)** — Security disclosures (vault access, clipboard, external domains)
- **[.instructions.md](../../.instructions.md)** — AI-first compliance policy card for generated patches
