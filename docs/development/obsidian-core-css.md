# Reading Obsidian's own CSS

When a plugin rule depends on Obsidian's styling — a token's value, a
breakpoint, which class the app puts on `body` — read the app's stylesheet
instead of guessing from a screenshot. This is how the mobile settings bug in
#1819 was traced: `--settings-background` collapses onto
`--background-secondary` on a phone, so a group card painted with the latter is
invisible against the page.

## Extract `app.css`

`app.css` ships inside the app archive, not on disk. Obsidian runs the archive
in the user-data directory, which is one version newer than the installer:

```powershell
# Which build is actually running (the installer's ProductVersion never changes)
Get-Content "$env:LOCALAPPDATA\Temp\<profile>\obsidian.log" | Select-String "Loaded"

# The archive itself: `<profile>\obsidian-<version>.asar`
npx --yes @electron/asar extract-file "<profile>\obsidian-1.15.1.asar" app.css
```

Without a disposable profile, the same file is
`%APPDATA%\obsidian\obsidian-<version>.asar`. Extract next to a scratch file and
grep it; do not commit it.

## Tokens worth knowing

Settings surfaces are built from a small token set, and **mobile redefines
several of them**, so a color that reads well on desktop can vanish on a phone:

| Token                                                | Desktop                    | `.is-mobile`                                                                |
| ---------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| `--settings-background` (the page behind settings)   | `--modal-background`       | `--background-secondary`                                                    |
| `--setting-items-background` (a settings row's fill) | `--background-primary-alt` | `color-mix(in srgb, #1e1e1e 96%, white 4%)` (`--color-secondary-2` in dark) |
| `--setting-items-radius`                             | `--radius-l`               | a touch radius (rows read as pills)                                         |
| `--setting-group-max-width`                          | `700px`                    | `100%` (`.is-phone`)                                                        |

The `#1819` lesson: a surface fill must not come from the same token as its
parent page on the platform it renders on. Prefer the token the app itself uses
for that surface (`--setting-items-background`), and check both blocks.

## Reading the rules

```sh
# Every settings-surface token definition, with the block it sits in
grep -n "setting-items-background\|settings-background" app.css

# Which container the app queries, and at what width
grep -n "@container" app.css

# The mobile overrides, both themes
grep -n "^\.is-mobile\b\|^\.is-phone\b" app.css
```

Two traps when reading the output:

- A token usually appears three or more times: `:root`, `.is-mobile`, and a
  theme-scoped `.is-mobile.theme-dark`/`.is-light`. Take the value from the block
  that matches the device you care about, not the first hit.
- `.vertical-tab-content` is itself a container (`container-type: inline-size`),
  so core's `@container (max-width: 400px)` rules measure the pane _including_
  its 32px side padding. A plugin container on the same pane is 64px narrower —
  the reason the reviewed settings rows break at `400px` of pane, not `400px` of
  container.

## Where this is already written down

- [UI design spec](./design-spec.md) — the plugin rule that came out of it
  (**Settings Rows and Inputs**).
- [Fixture vault](./fixture-vault.md) — emulating a phone over CDP, and
  `scripts/check-settings-layout.mjs --mobile` for the automated version.
