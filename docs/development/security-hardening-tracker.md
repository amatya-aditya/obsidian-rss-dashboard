# Security hardening tracker

This document is the human-readable index for the security-hardening epic
`obsidian-rss-dashboard-dsm`. The maintainer implementation baseline is
[GitHub issue #181](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/181).
Beads is the authoritative task tracker; use the linked Bead for status,
discussion, and completion evidence.

Implementation status: `dsm.1` through `dsm.4` are implemented on the issue
#181 branch. An isolated clean-worktree validation passed the full lint,
platform, type-check, build, both audits, and 191-file/1,714-test unit suite.

Existing disclosure guidance lives in [SECURITY.md](../SECURITY.md).

## Maintainer-owned repository changes

| Bead | Change | Completion evidence |
| --- | --- | --- |
| `obsidian-rss-dashboard-dsm.1` | Move test-only `jsdom` to `devDependencies` and remediate current audit findings without force-upgrades. | Both local audits report zero vulnerabilities; full lint/platform/type-check/build and unit suite pass. |
| `obsidian-rss-dashboard-dsm.2` | Add high/critical npm-audit gates to pull-request and release workflows. | Both workflows explicitly run production-only and full-graph audits at `--audit-level=high`. |
| `obsidian-rss-dashboard-dsm.3` | Use least-privilege token permissions and prevent install lifecycle scripts in test CI. | Test workflow has `contents: read` and `npm ci --ignore-scripts`; isolated clean-install test/build validation passes. |
| `obsidian-rss-dashboard-dsm.4` | Add weekly npm and GitHub Actions Dependabot version updates. | Valid weekly npm and GitHub Actions configuration with bounded PR limits and grouped minor/patch updates. |
| `obsidian-rss-dashboard-dsm.5` | Cover every release asset with provenance and add an attested SBOM. | Release assets, SBOM, and documented consumer verification command. |

## Repository-owner follow-up

| Bead | Required repository setting | Completion evidence |
| --- | --- | --- |
| `obsidian-rss-dashboard-dsm.6` | Enable CodeQL default setup for JavaScript/TypeScript. | Code scanning results in GitHub's Security tab and an alert-triage owner. |
| `obsidian-rss-dashboard-dsm.7` | Enable Dependabot alerts and security updates. | Both settings enabled and notifications/triage owner recorded. |
| `obsidian-rss-dashboard-dsm.8` | Enable secret scanning and push protection. | Alerts and push protection enabled; bypasses have a review process. |
| `obsidian-rss-dashboard-dsm.9` | Protect `main` and `develop`, require CI/review, and restrict release-tag creation. | Branch/ruleset and tag-protection configuration recorded. |
| `obsidian-rss-dashboard-dsm.10` | Set default workflow-token permissions to read-only and require full commit-SHA action pins. | Repository Actions settings enabled after workflows are migrated. |

## Recommended sequence

1. Complete dependency remediation (`dsm.1`) before introducing blocking audit
   gates (`dsm.2`).
2. Complete CI installation/permission hardening (`dsm.3`) and Dependabot
   configuration (`dsm.4`).
3. Ask a repository owner to complete the settings tasks (`dsm.6` through
   `dsm.10`), starting with CodeQL, Dependabot security updates, and secret
   protection.
4. Complete release provenance/SBOM work (`dsm.5`) after the workflow action
   pinning policy is ready to enforce.
