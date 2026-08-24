# Obsidian Change Gates

Apply only the gates for surfaces affected by the change. Repository lint and
compliance scripts remain mandatory where `AGENTS.md` requires them.

## Risk Classification

- **Low:** one narrow module, no persistence, security, lifecycle, shared state,
  or cross-platform behavior.
- **Medium:** a new setting, parser behavior, UI plus state, or a change spanning
  related modules.
- **High:** storage migration, deletion, synchronization, sanitization, new
  external domains or dependencies, lifecycle orchestration, shared contracts,
  release artifacts, or multiple subsystems.

Run the full unit suite for high-risk changes and broad medium-risk changes.
State the selected risk and rationale in the plan and handoff.

## Surface Matrix

| Surface | Review gates | Manual scenarios |
| --- | --- | --- |
| UI or settings | Sentence-case text; Obsidian DOM helpers; `activeDocument` or owning document; owning window or `activeWindow` for non-timer window APIs; `window.*` timer APIs; no static inline styling; accessible actions; settings headings only when needed | Desktop plus mobile emulation/device; popout when relevant; light and dark themes; keyboard and touch paths |
| Lifecycle, workspace, or views | Register events, DOM events, intervals, and disposables; release resources on unload; avoid direct `activeLeaf` assumptions and persistent custom-view references | Enable, disable, reload, reopen, and move relevant views between main and popout windows |
| Vault, storage, or sync | Prefer Vault/FileManager APIs; use `normalizePath`; make background edits atomic; preserve existing data; define migration rollback; avoid Node/Electron APIs on mobile | Existing-data upgrade, empty/new vault, reload, failure rollback, desktop/mobile, and documented sync sequence |
| Feed, network, parser, or rendering | Use approved request APIs; handle malformed, missing, and differently encoded input; sanitize untrusted HTML; review security disclosures for new domains | Representative valid feed, regression fixture, malformed response, network failure, and encoding edge case |
| CSS, theme, or responsive layout | Scope selectors under `rss-`; use Obsidian CSS variables; avoid hardcoded colors; prohibit `!important`; construct sufficient specificity from the plugin root, component, and state or element selector; preserve supported mobile CSS | Light/dark themes, desktop/mobile widths, popout, zoom or long content, and adjacent Obsidian UI |
| Commands or hotkeys | Use the appropriate callback type; do not assign default hotkeys; keep command names in sentence case | Available and unavailable command contexts; user-assigned hotkey; mobile command palette when supported |
| Dependencies, manifest, or release | Check mobile compatibility, license and security impact, manifest implications, supported artifact set, and production build output | Clean install or upgrade from the previous release; verify only `main.js`, `manifest.json`, and optional `styles.css` are required |
| Shared types, state, or orchestration | Audit all consumers, persistence compatibility, default values, and stale-reference behavior | Exercise each affected view/service and run the full unit suite when coupling is broad |

## Official Review References

- Plugin guidelines: <https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines>
- Mobile development: <https://docs.obsidian.md/Plugins/Getting+started/Mobile+development>
- Public RSS Dashboard listing: <https://community.obsidian.md/plugins/rss-dashboard>

Treat current official guidance as an external source that may change. Inspect
it live only for the conditional work identified by the skill.
