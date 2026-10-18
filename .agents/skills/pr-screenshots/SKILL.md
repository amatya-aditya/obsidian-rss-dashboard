---
name: pr-screenshots
description: "Attach before/after screenshots to a GitHub pull request as a Case | Before | After table, then publish them with gh --attach. Use when a PR needs visual evidence in its description."
---

# Before/after screenshots in a PR body

Turns local before/after captures into one `Case | Before | After` table in a
pull request description. The images are uploaded to GitHub with `gh --attach`,
never committed.

Usually reached from the `pr` skill, which reuses captures already taken by
`test-drive-and-fix`. It also runs standalone to capture and publish.

## Approval first

This skill mutates GitHub. Never create a PR or edit a body without explicit
approval for that exact action. Draft it, name the action ("edit the body of PR
#1234"), show it, and wait. Approval is per action.

## 1. Reuse captures first

After `@test-drive-and-fix` the captures already exist. Look in
`<repo>/.agent/test-evidence/<branch>/` for pairs named
`<NN>-<slug>-before.png` and `<NN>-<slug>-after.png` — the same `NN` and `slug`
on each side. Use the slug as the case label.

**Reuse is the default.** If no pair exists, do not capture here; the `pr` skill
writes `No screenshots: <reason>.` instead. Capturing is a deliberate standalone
run, below.

## 2. Capture (only when you have none)

- **Same viewport and state** for before and after. GitHub vertically centres a
  shorter image in a table cell; unequal heights misalign the tops.
- Name the viewport in the case label: `390×844` (phone), `1440×900` (desktop).
- Save under a folder with **no whitespace** inside the repo, e.g. `captures/`.
  Do not commit them — `--attach` uploads them.
- **No image processing.** Don't crop, resize, or pad. Desktop shots are wide
  and the table halves them; phone shots are narrow and render tall, which is
  fine.

Obsidian plugin: capture over CDP with `scripts/obsidian-cdp.mjs` and the
fixture vault (`docs/development/fixture-vault.md`). Phone viewport =
`Emulation.setDeviceMetricsOverride`; desktop = the normal window.

## 3. Shape

The first column is the description and the bare minimum: the screen and state.

```
| Case | Before | After |
|:--|:--|:--|
| Reader format sheet · 390×844 · light | ![Before — …](ref) | ![After — …](ref) |
```

- One row per comparison, one table per body.
- `alt` is generated from the case label; keep the label descriptive.
- Put the table in the before/after section of the pull request's body. When the
  repository has its own template (the `pr` skill picks it), that is usually
  `## Before / After`; otherwise use `## Evidence`. **Use real Markdown headings
  for the evidence sub-sections** (`### Automated`, `### Real render`,
  `## Manual test checklist`). A plain line ending in `:` does not render as a
  heading.

## 4. Format

Run from the directory that holds the images — the script and `gh` must share it:

```sh
node .agents/skills/pr-screenshots/scripts/format.mjs \
  --case "Reader format sheet · 390×844 · light" \
  --before captures/reader-light-before.png \
  --after  captures/reader-light-after.png \
  --case "Reader format sheet · 390×844 · dark" \
  --before captures/reader-dark-before.png \
  --after  captures/reader-dark-after.png
```

Options:

- `--before-label` / `--after-label` — column headers, e.g. the build SHAs.
- `--body-file <file>` — replace the `<!-- pr-screenshots:start/end -->` block
  in place, idempotently. With no marker present the block is appended, so
  insert the marker pair where you want it first.
- `--attach-list` — print the files to pass to `--attach`.

## 5. Publish

```sh
gh pr view 1234 --json body --jq .body > body.md
node .agents/skills/pr-screenshots/scripts/format.mjs --body-file body.md <cases…> > body-next.md

args=()
while IFS= read -r f; do args+=(--attach "$f"); done < <(
  node .agents/skills/pr-screenshots/scripts/format.mjs --attach-list <cases…>
)
gh pr edit 1234 --body-file body-next.md "${args[@]}"
```

PowerShell builds the attach arguments like this:

```powershell
$files = node .agents/skills/pr-screenshots/scripts/format.mjs --attach-list <cases…>
$args = @('pr','edit','1234','--body-file','body-next.md')
foreach ($f in $files) { $args += '--attach', $f }
gh @args
```

Open a PR the same way: `gh pr create … --body-file body.md --attach …`.

## 6. Windows / UTF-8 trap

Windows PowerShell decodes `gh`'s UTF-8 stdout as ANSI, so `gh … | Set-Content`
**corrupts** non-ASCII (`—` becomes `ΓÇö`, `→` becomes `ΓåÆ`). Fetch and write
the body through Node instead:

```sh
node -e "const{execSync}=require('child_process');require('fs').writeFileSync('body.md',execSync('gh pr view 1234 --json body --jq .body',{encoding:'utf-8'}),'utf-8')"
```

Shell `>` redirection also re-encodes Node's stdout, so write files from Node,
not through `>`. After publishing, assert the body still contains `—` and `→`.

## 7. Re-editing an existing PR

Uploaded images live at `https://github.com/user-attachments/assets/…`. When you
only change the surrounding prose, **reuse those URLs** rather than
re-uploading. Re-running the formatter with the same local files and `--attach`
is idempotent.

## 8. Verify

- The block holds one row per case, and no local reference remains — every
  image points at a `user-attachments` URL.
- The images render and the table reads top to bottom.

## Script

`scripts/format.mjs` is the only script (dependency-free Node). It renders the
table, prints the attach list, and replaces the marked block. Images only:
`gh --attach` does not rewrite `<video src>`, so recordings are out of scope.
Its arguments are not a public API.
