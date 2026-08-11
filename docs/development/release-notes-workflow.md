# Release Notes Workflow

This workflow records completed user-visible changes while keeping release-cut
editing efficient and accurate.

## Goal

Add completed user-visible features and fixes to `CHANGELOG.md` under
`Unreleased`, keep the PR Release Notes Candidate aligned with that entry, and
consolidate the collected entries into a wider-audience summary under
`docs/releases/` when cutting Beta/Stable releases.

## Label Taxonomy

Use a small, stable label set so filtering is fast and predictable.

### Release Labels

- release:2.3.0
- release:2.3.x
- release:next

### Type Labels

- type:feature
- type:fix
- type:refactor
- type:docs
- type:chore

### Area Labels

- area:reader
- area:feeds
- area:settings
- area:storage
- area:discover
- area:ui
- area:performance

### Changelog Labels

- changelog:yes
- changelog:no
- changelog:needs-edit

## Day-to-Day Contributor Workflow

1. Open PRs against dev.
2. Do not add a changelog entry while behavior is incomplete or speculative.
3. When a user-visible feature or fix is complete, add one concise bullet under
   `Unreleased` -> `Features` or `Fixes`.
4. When the work has a canonical GitHub issue, append its exact URL using
   `[GH Issue #N](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/N)`.
5. Copy the final changelog wording into the PR Release Notes Candidate, or use
   `N/A` for internal-only refactors, tests, documentation, and tooling.
6. Apply labels for type, area, and changelog intent.
7. Do not edit `docs/releases/` for an individual issue or feature.

## Release Branch Workflow

1. Cut release/x.y.z from dev.
2. Bump version on release branch only.
3. Tag and publish Beta from release branch.
4. Apply stabilization fixes on release branch.
5. For each release-bound PR, ensure changelog:yes or changelog:no is set.

## Compiling Changelog and Public Release Notes

1. Treat the existing `Unreleased` section as the primary release-note source.
2. Identify merged PRs between the previous tag and HEAD of the release branch.
3. Cross-check PRs labeled `changelog:yes` against `Unreleased` and add only
   genuinely missing user-visible entries.
4. Deduplicate and polish wording while preserving canonical GitHub issue URLs.
5. Move the final entries into the new version heading, grouped by type and area.
6. Create or update `docs/releases/<version>.md` as the public-facing summary.
   Consolidate related changelog bullets, lead with user impact, and omit
   implementation detail that does not help the wider audience.
7. Preserve granular issue URLs in `CHANGELOG.md`. Include issue links in the
   public release summary only when they add useful context.
8. Exclude internal-only refactors unless they have direct user impact.

## Useful Commands

List commits since previous tag:

```bash
git log --oneline 2.3.0-beta.1..HEAD
```

View changed files since previous tag:

```bash
git diff --name-only 2.3.0-beta.1..HEAD
```

## Practical Rules

- Write user-facing wording in `CHANGELOG.md` when the behavior is complete.
- Keep the PR Release Notes Candidate aligned with the changelog entry.
- Keep each PR focused so one PR maps to one release-note topic.
- Prefer short, specific bullets over long paragraphs.
- Update an existing matching bullet instead of adding a duplicate.
- Preserve the exact canonical issue URL so GitHub can create a cross-reference.
- Treat `CHANGELOG.md` as the granular record and `docs/releases/` as the
  consolidated public narrative.
- Final grouping, consolidation, and public wording polish happens at release
  cut time.

## LLM Prompt Pack for Commit and PR Drafts

Use this when implementation is complete and you want an LLM to draft commit and PR text from evidence.

### Prompt 1: Draft Commit and PR

```text
Role:
You are a release-conscious maintainer drafting git metadata for an Obsidian plugin repo.

Context rules:
- Base branch is dev.
- Do not invent behavior, files, tests, or risk claims.
- Prefer user impact first, internal refactor second.
- If uncertain, explicitly mark uncertainty.
- Keep commit subject under 72 characters.
- Use imperative mood in commit subject.
- Include release-notes candidate text suitable for changelog curation.

Repository conventions:
- PR must include: summary, testing evidence, risk/rollback, release notes candidate.
- Completed user-visible changes are recorded under CHANGELOG.md > Unreleased.
- Release-cut curation deduplicates the changelog and produces the consolidated
  public summary under docs/releases/.
- Labels expected: type, area, changelog intent.

Inputs:
- Branch name: <branch>
- Base branch: dev
- Changed files (name-status): <paste>
- Diff stat: <paste>
- Key diff hunks: <paste>
- Tests run + results: <paste>
- Known risks or edge cases: <paste or none>
- Related issues/PRs: <paste or none>

Output format:
1. Commit message
- Subject:
- Body:
	- <bullet>
	- <bullet>

2. PR title
- <title>

3. PR body
- Summary
- What changed
- User impact
- Testing
- Risk and rollback
- Release Notes Candidate
- Labels to apply (type, area, changelog)

Quality checks before final output:
- List every claim and map it to a file or test input.
- Remove any claim not supported by provided inputs.
- If no direct user impact, explicitly state: No direct user impact.
```

### Prompt 2: Critique and Tighten

```text
You are auditing the drafted commit and PR text.

Inputs:
- Original draft text: <paste draft>
- Changed files (name-status): <paste>
- Diff hunks: <paste>
- Test evidence: <paste>

Tasks:
1. Identify unsupported or speculative claims.
2. Flag missing risk notes for changed high-impact areas.
3. Flag vague wording and rewrite it concretely.
4. Return corrected final versions:
	 - Commit message
	 - PR title
	 - PR body
5. Keep release-notes candidate to 1-3 concise bullets.
```

### Fast Evidence Collection

Run these before using the prompt pack:

```bash
git status --short
git diff --name-status origin/dev...HEAD
git diff --stat origin/dev...HEAD
git diff origin/dev...HEAD
```

Also include build/test command output used to validate the changes.
