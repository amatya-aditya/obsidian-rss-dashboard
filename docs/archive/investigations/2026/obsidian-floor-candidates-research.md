# Obsidian floor candidates for 3.0: research (2026-10-13)

Answers the questions in
[#1073](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1073)
(child of the 3.0 Wayfinder map
[#1071](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1071)).
Facts only. Choosing the floor is
[#1075](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1075)'s
job.

Legend: **[V]** verified against the primary source linked; **[I]** inference
or assumption; **[U]** could not be verified from a primary source.

Sources used throughout:

- Changelog index: <https://obsidian.md/changelog/> (pages 1 to 4).
- `obsidian` npm package `obsidian.d.ts`, version 1.13.1 (the version this
  repository pins in `package.json`), read from `node_modules/obsidian`.
  `npm view obsidian time` lists 1.11.0, 1.11.4, 1.12.0, 1.12.2, 1.12.3,
  1.13.0, 1.13.1 and 1.14.4 (published 2026-10-08) as the 1.11+ releases.
- `eslint-plugin-obsidianmd` 0.4.2 (installed), source
  `dist/lib/rules/noUnsupportedApi.js` and `dist/lib/rules/settingsTab/*`.
  Upstream: <https://github.com/obsidianmd/eslint-plugin>.

## 1. Release timeline (candidate floors)

All dates are the Obsidian changelog dates. Desktop and mobile entries carry
the same date for every public release below. [V]

| Version          | Early access (Catalyst) | Public desktop                 | Public mobile        | Entry                                                                                                                                    |
| ---------------- | ----------------------- | ------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1.11.0           | 2025-12-10              | (not public; rolled into 1.11) |                      | [desktop](https://obsidian.md/changelog/2025-12-10-desktop-v1.11.0/)                                                                     |
| 1.11.4 ("1.11")  | 2026-01-07              | 2026-01-12                     | 2026-01-12           | [desktop](https://obsidian.md/changelog/2026-01-12-desktop-v1.11.4/), [mobile](https://obsidian.md/changelog/2026-01-12-mobile-v1.11.4/) |
| 1.11.5           | 2026-01-15              | 2026-01-20                     | 2026-01-20           | [desktop](https://obsidian.md/changelog/2026-01-20-desktop-v1.11.5/), [mobile](https://obsidian.md/changelog/2026-01-20-mobile-v1.11.5/) |
| 1.11.7           | 2026-01-28              | 2026-02-05                     | 2026-02-05           | [desktop](https://obsidian.md/changelog/2026-02-05-desktop-v1.11.7/)                                                                     |
| 1.12.0 / 1.12.1  | 2026-02-10              |                                |                      | [desktop](https://obsidian.md/changelog/2026-02-10-desktop-v1.12.0/)                                                                     |
| 1.12.4 ("1.12")  | 2026-02-24              | 2026-02-27                     | 2026-02-27           | [desktop](https://obsidian.md/changelog/2026-02-27-desktop-v1.12.4/), [mobile](https://obsidian.md/changelog/2026-02-27-mobile-v1.12.4/) |
| 1.12.7           | 1.12.6 on 2026-03-18    | 2026-03-23                     | 2026-03-23           | [desktop](https://obsidian.md/changelog/2026-03-23-desktop-v1.12.7/)                                                                     |
| 1.13.0           | 2026-05-28              |                                |                      | [desktop](https://obsidian.md/changelog/2026-05-28-desktop-v1.13.0/)                                                                     |
| 1.13.4 ("1.13")  | 2026-07-27              | 2026-07-30                     | 2026-07-30           | [desktop](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/), [mobile](https://obsidian.md/changelog/2026-07-30-mobile-v1.13.4/) |
| 1.13.6 to 1.13.8 | 2026-08-07 onward       | 1.13.7 on 2026-08-12           | 1.13.8 on 2026-08-20 | changelog page 1                                                                                                                         |
| 1.14.4 ("1.14")  | 2026-09-02 (1.14.0)     | 2026-10-05                     | 2026-10-05           | [desktop](https://obsidian.md/changelog/2026-10-05-desktop-v1.14.4/)                                                                     |

Notes:

- The first public build of each minor is the ".4" patch (1.11.4, 1.12.4,
  1.13.4, 1.14.4). `x.y.0` to `x.y.3` were Catalyst-only. A floor of `1.13.0`
  therefore admits no public build that a floor of `1.13.4` excludes. [V from
  the table; I for the implication]
- Mobile date = the date Obsidian published the mobile changelog entry. App
  Store and Play Store availability dates are not published by Obsidian. [U]
- 1.13 mobile raised the iOS minimum from 14.5 to 15 ("should not affect any
  supported devices"). [V, 1.13 mobile entry]
- Desktop installer (Electron) bumps that need a manual reinstall: 1.11.4
  (Electron 39.2.6), 1.12 (39.7.0), 1.12.7 (39.8.3, needed for the new CLI
  binary), 1.13 (43.1.1), 1.14 (43.7.5). The app itself updates without the
  installer, so the installer version and the app version can diverge. [V for
  the bumps; I for the divergence, which is how `requireApiVersion` and
  installer checks differ]

## 2. SecretStorage

### Version [V]

- 1.11.0 (Catalyst, 2025-12-10) added a user-facing "Keychain" settings
  section, with "Plugin API is coming soon".
- 1.11.4 exposed the plugin API: "Exposed new SecretStorage and a
  complementary SecretComponent for plugins to integrate with the secret
  storage." First public on 2026-01-12 (desktop and mobile).
- `obsidian.d.ts`: `App.secretStorage` `@since 1.11.4`; class `SecretStorage`
  `@since 1.11.4`; class `SecretComponent` `@since 1.11.1`, with its
  `setValue`/`onChange` `@since 1.11.4`.

So the API floor is **1.11.4**, not 1.11.5.

### API surface [V, `obsidian.d.ts` 1.13.1]

```ts
class App {
  secretStorage: SecretStorage;
} // @since 1.11.4

class SecretStorage extends Events {
  // @since 1.11.4
  setSecret(id: string, secret: string): void; // throws if ID is invalid
  getSecret(id: string): string | null; // null if not found
  listSecrets(): string[]; // all secret IDs
}

class SecretComponent extends BaseComponent {
  // @since 1.11.1
  constructor(app: App, containerEl: HTMLElement);
  setValue(value: string): this; // @since 1.11.4
  onChange(cb: (value: string) => unknown): this; // @since 1.11.4
}
```

- IDs: "Lowercase alphanumeric ID with optional dashes"; `setSecret` throws
  on an invalid ID. [V, JSDoc]
- All three methods are synchronous. [V]
- `SecretStorage extends Events`, but `obsidian.d.ts` documents no event names
  for it. [V absence; any events are U]
- No `deleteSecret`/`removeSecret` method exists in the typings. Users delete
  entries in Settings → Keychain. [V absence; UI deletion is I]

### How entries are listed and selected [V]

The developer guide
<https://docs.obsidian.md/plugins/guides/secret-storage>:

- Plugin settings store only the secret's **name**, never its value.
- `SecretComponent` is added through `Setting#addComponent(el => new
SecretComponent(this.app, el))`, with `.setValue(name)` and
  `.onChange(name => save)`. Its UI lets the user pick an existing secret or
  create a new one.
- The plugin reads the value with `app.secretStorage.getSecret(name)` where
  needed.
- `listSecrets()` returns every ID in the store, not only ones this plugin
  created. The store is shared across plugins by design ("a new opt-in way for
  plugins to save keys that might be shared across multiple plugins", 1.11.4
  changelog). [V]

### When an entry is missing [V]

`getSecret` returns `null` when no entry has that ID (JSDoc), and the guide
says to null-check the result. Nothing else happens: no event or error. A
stored name that no longer exists (renamed, deleted, or a different device)
looks the same as a never-set secret. [V for null; I for "looks the same"]

### Desktop vs. mobile, storage, encryption

- Both platforms got the API in 1.11.4; the mobile 1.11.5 entry fixes the
  Keychain settings layout and disables auto-capitalisation of the "secret ID"
  field, which confirms the UI exists on mobile. [V, 1.11.5 mobile entry]
- The developer guide says SecretStorage is kept "in local storage" and keyed
  to the specific vault. [V, guide]
- 1.11.5 desktop: "Secret Storage is now encrypted while on disk. This relies
  on encryption provided by your operating system." Linux needs kwallet,
  kwallet5, kwallet6 or gnome-libsecret. [V]
- 1.12 desktop: "Keychain: Added handling for when encryption is unavailable
  on some Linux machines." [V]
- How mobile secrets are protected at rest (iOS Keychain / Android Keystore or
  not) is not stated in any changelog or doc. [U]
- The desktop mechanism is Electron `safeStorage` according to third-party
  write-ups; Obsidian's own text says only "encryption provided by your
  operating system". [U]

### Sync between devices [I, strong]

No official page states it outright, but:

- The developer guide places the store in local storage keyed to the vault,
  not in the vault folder, so file-based sync (Obsidian Sync, Syncthing,
  iCloud, Git) has nothing to copy. [V for location; I for the consequence]
- The help site has no Keychain page (`https://obsidian.md/help/keychain`
  returns "File keychain.md does not exist", 2026-10-13). [V]
- Third-party plugin docs and a developer on the forum describe Keychain
  entries as device-local and note that moving settings into Keychain breaks
  multi-device setups that relied on synced `data.json`
  (<https://forum.obsidian.md/t/what-is-obsidian-keychain-and-how-to-use-it/112408>,
  not staff). [secondary]

Consequence for us [I]: a user who syncs a vault must create the same secret
ID on every device. The synced plugin setting holds only the ID, so on a device
without that entry `getSecret` returns `null`.

### How `feat/fresh-rss` used it [V, `origin/feat/fresh-rss`]

- `manifest.json` `minAppVersion` is `1.11.4` on that branch.
- `main.ts` declares a local structural type
  (`FreshRssSecretStorage = { getSecret; listSecrets }`) and casts
  `this.app` to read `app.secretStorage`, then duck-types both methods
  (`getFreshRssSecretStorage`, around `main.ts:3231`). It never calls
  `setSecret`.
- Capability gate: `requireApiVersion("1.11.4")` plus a working
  `listSecrets()` call; otherwise the status is `capability-unavailable`
  ("FreshRSS requires Obsidian 1.11.4 or newer with usable SecretStorage.").
- Selection UI: a plain `addDropdown` filled from `listSecrets()`, not
  `SecretComponent` (`src/settings/tabs/freshrss-settings-tab.ts:207-220`).
  Users must create the entry in Settings → Keychain first.
- The setting stores only the reference (`freshRss.credentialReference`,
  "A user-managed Obsidian SecretStorage ID, never the secret's value").
- The secret's value is a JSON credential bundle `{ username, apiPassword }`
  parsed by `parseCredentialBundle`
  (`src/services/freshrss-connection-service.ts`).
- Missing entry: `getSecret` → `null` → status `credentials-unconfigured` or
  the Notice "Select a FreshRSS credential bundle before syncing."; a throw →
  `capability-unavailable` or "SecretStorage could not be read."; bad JSON →
  "the stored credential bundle is invalid."

At a floor of 1.11.4 or higher, the cast and the `requireApiVersion("1.11.4")`
gate become unnecessary and `SecretComponent` becomes usable without a gate.
[I]

## 3. What 1.11.5 "encryption" adds [V]

From the 1.11.5 desktop entry, the only encryption item is: Secret Storage is
now encrypted on disk with OS-provided encryption (Linux needs kwallet or
gnome-libsecret). The 1.11.5 Catalyst entry calls it "encrypted at rest".

- No new plugin API: `obsidian.d.ts` has **no** `@since 1.11.5` tag. The
  API is identical to 1.11.4. [V]
- Its other developer note renames `--blur-translucency-s/-m` to
  `--blur-opacity-s/-m`. [V] This repository does not use those variables. [V,
  repository grep outside `node_modules` and `docs`: no matches; the same
  holds for `--callout-color`]
- It is not general vault or data encryption, and not something a plugin can
  call. The "cookie encryption" in 1.11.4 is a separate installer feature for
  Web viewer. [V]

So 1.11.5 matters only as "secrets are encrypted at rest on desktop for users
on 1.11.5+". A plugin on a 1.11.4 floor gets the same API; users on 1.11.4
keep secrets unencrypted on disk until they update. [I]

## 4. 1.12.x and 1.13.x: dates and APIs

Dates are in §1. New API by `@since` tag in `obsidian.d.ts` 1.13.1 [V]:

### 1.12.x

- `Plugin.registerCliHandler(command, description, flags, handler)` and the
  `CliData`, `CliFlag`, `CliFlags`, `CliHandler` types — `@since 1.12.2`.
  Lets a plugin add commands to the Obsidian CLI (introduced in 1.12). The
  changelog does not mention the plugin hook; only the typings do. [V]
- `Vault.appendBinary`, `DataAdapter.appendBinary` (and both adapters) —
  `@since 1.12.3`; changelog: "Added `appendBinary` method to the vault and
  adapter API." [V]
- Breaking (Bases only): `BaseOption#shouldHide` no longer receives the
  config argument (1.12.0). We do not register Bases views. [V changelog; I for
  us]

### 1.13.x

- **Declarative settings**: `PluginSettingTab.getSettingDefinitions()`,
  `getControlValue`, `setControlValue`, `SettingTab.update()`,
  `refreshDomState()`, `settingItems`, the `SettingDefinition*` and
  `Setting*Control` types (toggle, dropdown, text, textarea, number, slider,
  color, file, folder), `SettingPage`, `Plugin.settings` — all `@since 1.13.0`.
  [V]
  - Guide: <https://docs.obsidian.md/plugins/guides/migrate-declarative-settings>
    — "requires Obsidian 1.13.0". On 1.13+, Obsidian calls
    `getSettingDefinitions()` and **skips `display()`**; on older versions
    `display()` runs. Dual support means keeping both in sync; once older
    users are gone, delete `display()` and raise `minAppVersion`. For
    `control` definitions Obsidian reads `plugin.settings[key]`, writes back
    and calls `saveData()`; `render` definitions do not auto-save.
    `getSettingDefinitions()` runs once at registration for search indexing
    and on every `update()`, so it must do no I/O. [V]
  - Search: 1.13 public: core settings are searchable; "Community plugins
    don't appear in search until they migrate to the new Settings API." [V]
  - 1.13.1 additions: `Setting.addDisplayValue`, `DisplayValueComponent`,
    `SettingDefinitionGroup.search`, `SettingDefinitionPage.displayValue` /
    `status`, `SettingSliderControl.displayFormat` (`@since 1.13.1`). [V]
  - `SettingDefinitionBase#disabled` was added in 1.13.5/1.13.6 (Catalyst
    1.13.5 desktop; public 1.13.6), so it is absent from the 1.13.1 typings we
    pin. [V changelog]
  - 1.14 adds an optional `id` on `SettingDefinitionItem` for stable
    references when settings are renamed. [V, 1.14 desktop entry; not in our
    pinned typings]
- `ButtonComponent.setDestructive/removeDestructive`,
  `SliderComponent.setDisplayFormat` — `@since 1.13.0`. These are exactly
  what `src/settings/settings-ui-compat.ts` gates. [V]
- `Setting.setErrorMessage`, `Setting.errorEl` — `@since 1.13.0`. [V]
- `ConfirmationModal` and `ConfirmationButton` — `@since 1.13.0`; changelog
  "New `ConfirmationModal` component". We have about ten bespoke confirm
  modals in `src/` (`ConfirmActionModal`, `ConfirmDeleteModal`,
  `FactoryResetConfirmModal`, ...). [V]
- Theme breaking change: `--callout-color` now takes any CSS colour instead of
  an RGB triplet (1.13.0). [V]

### `obsidianmd` lint rules keyed to 1.13.0 [V, plugin source]

`DECLARATIVE_MIN_VERSION = "1.13.0"` in
`dist/lib/rules/settingsTab/shared.js` drives:

- `settings-tab/require-display` (warn): fires below 1.13.0 if a
  `PluginSettingTab` has no `display()`.
- `settings-tab/prefer-update-over-display` (warn): fires at 1.13.0+ on
  `this.display()` refresh calls.
- `settings-tab/no-deprecated-display` (warn): fires at 1.13.0+ when a tab
  has both `getSettingDefinitions()` and `display()`.
- `settings-tab/prefer-setting-definitions` (warn): independent of the floor;
  `eslint.config.mjs` turns it off for `src/settings/settings-tab.ts`.

## 5. Adoption signals and `minAppVersion` guidance

- Obsidian publishes no per-version active-user data. [V absence, searched
  2026-10-13]
- The community stats site
  <https://www.moritzjung.dev/obsidian-stats/releasestats/downloads> counts
  desktop installer downloads from GitHub releases. It excludes mobile, insider
  builds and the `.asar.gz` in-app updates, so it measures fresh installs and
  reinstalls, not who runs what. [V]
- Desktop app updates arrive in-app automatically by default; mobile updates
  through the stores. So most active users likely sit on the latest public
  build within weeks. [I; not documented by Obsidian]
- Guidance:
  - Submission requirements: `minAppVersion` "should be set to the minimum
    required version of the Obsidian app that your plugin is compatible with"
    and "If you don't know what an appropriate version number is, use the
    latest stable build number."
    <https://docs.obsidian.md/community-directory/submission-requirements-for-plugins>
    [V]
  - Manifest reference only says "The minimum required Obsidian version."
    <https://docs.obsidian.md/Reference/Manifest> [V]
- What older users see: Obsidian looks up `versions.json` in the plugin repo
  and installs the newest plugin version whose mapped `minAppVersion` their app
  satisfies; they keep getting that older release.
  <https://docs.obsidian.md/Reference/Versions> [V]. What the plugin browser
  shows such a user (a message, a disabled button) is not documented. [U]

## 6. Our code at each floor

Branch base: `origin/dev` at `d7b7e05a`, `minAppVersion` 1.8.7,
`MINIMUM_SUPPORTED_APP_VERSION = "1.8.7"` in
`scripts/check-release-compatibility.mjs`.

### `requireApiVersion` call sites [V]

| Call site                                                            | Gate                                                                    | Dead at                                                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/views/dashboard-view.ts:4093` (`getPodcastPlayingReaderLeaves`) | `requireApiVersion("1.7.2")` around `leaf.loadIfDeferred()`             | Already dead at the current 1.8.7 floor                                                                           |
| `src/views/reader-view.ts:1492` (`syncDashboardSelectionFromPlayer`) | `requireApiVersion("1.7.2")` around `leaf.loadIfDeferred()`             | Already dead at 1.8.7                                                                                             |
| `src/settings/settings-ui-compat.ts:3,38`                            | `MODERN_SETTINGS_API_VERSION = "1.13.0"` via injectable `hasApiVersion` | Dead at 1.13.0 (file comment says so); the legacy `mod-warning` class and hand-built slider value span go with it |

At 1.11.4, 1.11.5 or 1.12.x, only the two 1.7.2 gates are dead, and they are
dead today. The `settings-ui-compat.ts` gate uses structural interfaces
(`SettingsButtonControl`, `SettingsSliderControl`), so `no-unsupported-api`
does not see the `setDestructive`/`setDisplayFormat` calls it guards. [V]

### Other version-dependent code [V/I]

- `src/utils/modal-close-button.ts` matches both `.modal-header-button`
  (1.13.7, 1.14.4) and `.modal-close-button` (1.8.7). The version that renamed
  the button is not known, so no floor is proven to retire the second
  selector. [U]
- `src/settings/settings-tab.ts` keeps the imperative `display()` tab;
  `eslint.config.mjs` disables `@typescript-eslint/no-deprecated` and
  `prefer-setting-definitions` there "for Obsidian 1.8.7 through 1.12.x".
  Those overrides become removable only after a 1.13.0 floor **and** a
  migration to `getSettingDefinitions()`. [V]

### Lint at each floor [V, local run, `manifest.json` restored afterwards]

`npm run lint` (`--max-warnings=0`) with `minAppVersion` set temporarily to
each value, on 2026-10-13. `manifest.json` was restored byte-for-byte
(SHA-256 unchanged) and never committed.

| `minAppVersion` | Result   | Findings                                                                                                                                      |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.8.7 (current) | pass     | none                                                                                                                                          |
| 1.11.4          | pass     | none                                                                                                                                          |
| 1.11.5          | pass     | none                                                                                                                                          |
| 1.12.4          | pass     | none                                                                                                                                          |
| 1.13.0          | **fail** | 4 warnings, `obsidianmd/settings-tab/prefer-update-over-display`, `src/settings/settings-tab.ts:62,68,88,98` (`this.display()` refresh calls) |
| 1.13.4          | **fail** | same 4 warnings                                                                                                                               |

- `obsidianmd/no-unsupported-api` reports nothing at any floor, because the
  code already passes it at 1.8.7. Raising the floor only removes
  restrictions; it cannot add `no-unsupported-api` findings. "Which
  restrictions lift" is therefore the set of `@since` tags newly allowed, not
  a list of current violations.
- `@since` tags in `obsidian.d.ts` 1.13.1 above 1.8.7, by version: 1.10.0
  (171), 1.10.2 (18), 1.11.0 (10), 1.11.1 (1), 1.11.4 (7), 1.12.2 (9), 1.12.3
  (4), 1.13.0 (124), 1.13.1 (11). None fall in 1.8.8 to 1.9.x. Cumulative
  tagged declarations (classes, interfaces, members) that become usable without a gate: **207** at 1.11.4 or 1.11.5
  (1.11.5 adds none), **220** at 1.12.3+ (CLI handler, `appendBinary`),
  **344** at 1.13.0 (settings API, `ConfirmationModal`, `setDestructive`,
  `setDisplayFormat`, `setErrorMessage`), **355** at 1.13.1+. Lists in §4.
- A 1.13.0+ floor turns on the version-keyed settings-tab rules (§4): the four
  `prefer-update-over-display` warnings must be resolved for `npm run lint`
  to pass. Whether `this.update()` is a safe swap for an imperative tab that
  has no `getSettingDefinitions()` was not tested. [U] `require-display` stops applying at the same point.

How the rule works (`noUnsupportedApi.js`): it builds a map from
`obsidian.d.ts` `@since` tags (class, interface, member, function, type),
and reports any `MemberExpression`, `new`, `extends` or bare call whose
`@since` is greater than `minAppVersion`, unless it sits inside an
`if`/ternary/`&&` guarded by a literal `requireApiVersion("x.y.z")` with
`x.y.z >= @since`. Computed or structurally typed access (like the
`settings-ui-compat.ts` interfaces or the fresh-rss `app as ...` cast) is
invisible to it. The map comes from the installed `obsidian` package (1.13.1
here), so it knows no 1.14 tags. [V]

## 7. Open questions [U]

- Whether Keychain entries are copied by Obsidian Sync or any setting sync
  (no official statement; evidence says device-local).
- Mobile at-rest protection for SecretStorage.
- SecretStorage events (the class extends `Events`, but none are typed).
- App Store / Play Store rollout dates versus the changelog date.
- Which version replaced `.modal-close-button` with `.modal-header-button`.
- What the community plugin browser shows a user below `minAppVersion`.
