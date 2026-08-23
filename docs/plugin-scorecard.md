# Plugin Scorecard for RSS Dashboard

https://community.obsidian.md/plugins/rss-dashboard

This document tracks compliance status against the Obsidian Community Plugin audit scorecard.

## Current Public Snapshot

Checked August 10, 2026. The public listing reports RSS Dashboard version
2.5.0 with **Health: Excellent** and **Review: Caution**. The unauthenticated
public view does not identify a specific current finding behind the caution
rating, so this document does not infer one. Recheck the listing during release,
compliance, security, platform, storage, and audit-remediation work.

Current CSS policy requires zero `!important` declarations in `src/styles/`.
`npm run check:important` enforces this without comment-based exceptions.

## Post-2.5.0 / pre-2.6.0 remediation status

Remediation is in progress on the path to 2.6.0. The unedited
[post-2.5.0 community scorecard capture](development/post-2.5.0-plugin-scorecard.md)
is retained as evidence of the 2.5.0 release scan. Its paths and line numbers
describe that released artifact; they must not be rewritten as if they were a
fresh scan.

The captured report lists 51 automated findings and the public review remains
**Caution** until a future release and community rescan say otherwise. In the
current source, Bead `obsidian-rss-dashboard-1tr` has removed the 29 reported
test-only explicit-`any` occurrences from `test_files/stubs/obsidian.ts` and
`test_files/types.d.ts` using typed mock contracts. This is a source-state
correction, not a claim that the public scorecard has been updated.

### Current assessment and recommended order

| Priority                              | Captured finding                                                           | Current disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Follow-up scope and validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0                                    | Missing contributing guide                                                 | Remediated in the current source: the root guide is now tracked as`CONTRIBUTING.md`(previous: CONTRIBUTING.MD), the conventional case likely required by a case-sensitive scorecard check. The captured 2.5.0 listing remains historical evidence until a new release is scanned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Documentation/repository-metadata remediation complete locally. Verify repository links and the published 2.6.0 listing/community rescan. No runtime risk.                                                                                                                                                                                                                                                                                                                                                          |
| P1                                    | Clipboard access disclosure                                                | Genuine, intentional runtime capability. Current code has no programmatic clipboard read; native paste remains user-mediated. Writes support three settings-export copy buttons, article/feed URL context-menu actions, copying a local-storage address, Reader copy with LaTeX source preservation, and a YouTube embed`clipboard-write` permission. The [clipboard removal assessment](development/clipboard-removal-assessment.md) itemizes each path and its removal impact. Complete removal is feasible without breaking feed management, fetching, file-based import, or download exports, but would remove these sharing/convenience workflows and degrade Reader math copying. It is therefore not a proportionate response to a disclosure finding. | Retain the capability and make the disclosure unambiguous. Verify the scorecard's supported repository or listing disclosure channel, then submit the exact user-initiated/write-only scope and sensitive-clipboard caveat. Separately assess whether the YouTube iframe permission is needed. Validate settings exports, URL copying, local-storage-address copying, Reader math copy, YouTube playback, and community rescan. Privacy-review risk; no core-feature regression expected from disclosure-only work. |
| P1                                    | Unnecessary assertion in`src/utils/settings-loader.ts`                     | Current at`src/utils/settings-loader.ts:315` (the captured location remains accurate). It is a production lint-quality issue with narrow migration-path scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Small TypeScript cleanup plus focused settings-loader migration tests, ESLint for the file, type-check, platform check, and build. Low behavioral risk.                                                                                                                                                                                                                                                                                                                                                             |
| P1                                    | Three unused destructured values in`src/services/import-export-service.ts` | Current at lines 34-36. This is production lint hygiene, not runtime failure; the exclusion of feeds, folders, and available tags from user-settings export remains intentional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Small TypeScript cleanup preserving the serialized payload, with a regression assertion for excluded fields, ESLint for the file, type-check, platform check, and build. Low data-export compatibility risk.                                                                                                                                                                                                                                                                                                        |
| P2                                    | 12`css-scrollbar` compatibility warnings                                   | Genuine scanner-policy/compatibility findings. The captured source positions drifted: current authored rules are guarded progressive enhancements in`src/styles/modals.css` and `src/styles/sidebar.css`; the six `styles.css:1` references are minified release-bundle offsets. Unsupported engines degrade to ordinary scrollbars, but the scanner still flags the feature.                                                                                                                                                                                                                                                                                                                                                                                 | CSS/product compatibility decision. Inventory every flagged declaration, retain or replace only if equivalent cross-version behavior is acceptable; do not suppress the rule. Validate`npm run check:important`, build, manual desktop/mobile sidebar and modal scrolling on the supported Obsidian floor, then community rescan. Medium UX risk.                                                                                                                                                                   |
| P3                                    | Five global`document` uses in `test_files/unit/test-dom-polyfills.ts`      | Current and confined to jsdom test polyfills (lines 23, 317, 340, 361, and 379). They do not ship in the plugin runtime and test ESLint deliberately exempts the production popout rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Test-only policy cleanup if scorecard scanning tests is to be optimized. Refactor fallbacks to the owning/active document, retain polyfill behavior, and run the focused polyfill consumers plus the full unit suite. Low runtime risk; moderate test-harness regression risk.                                                                                                                                                                                                                                      |
| Done locally; awaiting release/rescan | 29 explicit-`any` warnings in test stubs                                   | Stale: no explicit`any` remains in the two cited current files. The captured count and locations belong to the 2.5.0 artifact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Bead`obsidian-rss-dashboard-1tr` is complete. Preserve its validation record; verify again in the next release build and community rescan.                                                                                                                                                                                                                                                                                                                                                                          |

Clipboard decision: retain all identified clipboard behavior unchanged. The
remaining P1 work is transparent disclosure and confirmation in the next
community rescan; it does not include source, test, CSS, or iframe-permission
removal.

Dependencies: resolve the contributing-guide convention with the scorecard
maintainers before a case-only rename; confirm the supported disclosure channel
before changing security prose or metadata. Clipboard removal has no dependency
on core feed workflows, but it would require an explicit product decision to
retire the identified sharing and Reader-copy conveniences; it is not required
for disclosure remediation. The production TypeScript cleanups are independent
of each other. Treat scrollbar changes as a separately reviewed UI compatibility
workstream, not as a mechanical warning count reduction.

Proposed implementation sequence: (1) obtain community-scanner guidance for
the contributing-guide and clipboard disclosures, and verify whether the
YouTube iframe permission is needed; (2) land the two narrow production
TypeScript cleanups with focused regression coverage; (3) decide and test the
scrollbar compatibility approach; (4) optionally align test polyfills; (5) cut
the 2.6.0 candidate, rerun repository gates, and request/review the community
rescan. Do not mark the Caution rating or all captured findings resolved before
that rescan.

## Historical Compliance Score

| Version | Score | Date         | Status                                                                                                                                      |
| ------- | ----- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.2.0   | 46%   | May 15, 2026 | ✅ Remediated — 100% target verified                                                                                                        |
| 2.3.0   | 72%   | May 26, 2026 | ✅ Remediated — see[audit-remediation-2.3.0.md](archive/investigations/2026/audit-remediation-2.3.0.md)                                     |
| 2.4.0   | Risks | Jul 2, 2026  | 🔄 Remediated in 2.4.1 — pending community rescan                                                                                           |
| 2.4.1   | TBD   | Jul 2, 2026  | ✅ Local compliance gates pass — see[2.4.0 audit remediation plan](archive/investigations/2026/2.4.0-audit/2.4.0_audit_remediation_plan.md) |

---

## v2.4.1 Remediation Summary (Completed July 2026)

Addressed the 2.4.0 community audit (455 findings) on branch `release/2.4.1`:

- **CI guardrails**: Added `check:platform`, `check:important`, and extended `check:commit-message` (full-repo scan, block directives, production disable ban). Wired into `check:compliance`, pre-commit, commit-msg, and GitHub Actions.
- **Risks**: Removed all production `eslint-disable` suppressions for banned rules; fixed test stub descriptions.
- **Platform API**: Migrated ~109 timer call sites to `window.*`, replaced `document` with `activeDocument` in production UI paths, eliminated `globalThis` usage.
- **CSS**: Resolved duplicate viewport properties via `@supports`, added missing `audit-ok` comments on remaining `!important` declarations (~69 total in `src/styles/`).
- **Strict ESLint**: Promoted `obsidianmd/ui/sentence-case` and `@typescript-eslint/no-unnecessary-type-assertion` to error; `@typescript-eslint/no-explicit-any` error in production.

**Verification**: `npm run check:compliance`, `npm run lint`, and `npm run test:unit` (1530 tests) all pass locally.

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

**Detailed remediation history**: See [test-lint backlog tracker](development/test-lint-backlog-tracker.md) (Passes 1–7)

---

## v2.3.0 Audit Findings

### Risks — 1 Risk (Must Fix)

1. **Dynamic `<script>` element creation** — Dynamically injecting script elements can load and execute arbitrary external code. CI/CD rule added to block future regressions.
2. **Direct Filesystem Access** — Uses the Node.js `fs` module to access the filesystem outside of the Obsidian vault API. Can read and write any file on the system. Must migrate to Obsidian vault API.

### Warnings — 950 Warnings

Per project policy (see `CONTRIBUTING.md`), warnings that cannot be eliminated are documented with inline `/* audit-ok: ... */` comments and approved in `CONTRIBUTING.md`.

| Category                               | Count | Files                                                       |
| -------------------------------------- | ----- | ----------------------------------------------------------- |
| `!important` declarations              | 900   | `styles.css`, `modals.css`, `sidebar.css`                   |
| `css-scrollbar` partial support        | 14    | `styles.css`, `modals.css`, `sidebar.css`                   |
| `multicolumn` partial support          | 8     | `styles.css`, `card-view.css`, `modals.css`, `settings.css` |
| Duplicate`max-height`                  | 8     | `styles.css`, `modals.css`, `reader.css`, `sidebar.css`     |
| Duplicate`height`                      | 4     | `styles.css`, `modals.css`                                  |
| Duplicate`min-height`                  | 4     | `styles.css`, `modals.css`                                  |
| `css-display-contents` partial support | 2     | `styles.css`, `controls.css`                                |
| Duplicate`padding`                     | 2     | `styles.css`, `articles.css`                                |
| Duplicate`position`                    | 2     | `styles.css`, `controls.css`                                |
| Duplicate`bottom`                      | 2     | `styles.css`, `dropdown-portal.css`                         |
| Duplicate`color`                       | 1     | `articles.css`                                              |
| Duplicate`border`                      | 1     | `articles.css`                                              |
| Duplicate`line-height`                 | 1     | `modals.css`                                                |

### Other

- Release contains extra artifact: `obsidian-rss-dashboard.zip` — only `main.js`, `manifest.json`, and `styles.css` are supported by the plugin registry.
- Clipboard access disclosure — verified current.

---

## Historical v2.3.0 Re-Audit Checklist

Remediation was tracked in [audit-remediation-2.3.0.md](archive/investigations/2026/audit-remediation-2.3.0.md).

The community audit should re-scan to verify:

1. Dynamic `<script>` injection removed and CI/CD rule enforced
2. Node.js `fs` usage removed or migrated to Obsidian vault API
3. CSS warnings either eliminated or documented under the policy in effect for that audit
4. Extra `.zip` release artifact removed from registry entry
5. Test suite remains fully compliant (130+ files, 1180+ tests, 0 lint errors)

---

## Health

- **Status**: Excellent
- **Details**: Actively maintained, highest commit velocity to date (486 commits / year). Remediation pipeline well-established.

### Hygiene

Has readme, license, description. ✅ Contributing guide exists (`CONTRIBUTING.md` in root).

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

- **[CONTRIBUTING.md](../CONTRIBUTING.md)** — Canonical source of truth for compliance declarations, audit guardrails, and zero-`!important` CSS policy
- **[Compliance patterns](development/compliance-patterns.md)** — Approved implementation patterns and anti-patterns for audit-sensitive code
- **[Test-lint backlog tracker](development/test-lint-backlog-tracker.md)** — Historical record of all compliance remediation passes
- **[2.3.0 remediation working checklist](archive/investigations/2026/audit-remediation-2.3.0.md)** — Historical audit record
- **[SECURITY.md](SECURITY.md)** — Security disclosures (vault access, clipboard, external domains)
- **[.instructions.md](../.instructions.md)** — AI-first compliance policy card for generated patches
