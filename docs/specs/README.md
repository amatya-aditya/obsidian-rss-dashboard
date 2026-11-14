# Spec Graph

The plugin's specs state the world as it is: what the product is for, how the
code is shaped, which boundaries hold, and why the non-obvious decisions were
taken. They are the first thing to read before changing behavior, and the place
to record a decision that a change overturns.

Each file carries frontmatter with an `id`, a `type`, and a `parent`, so the
graph can be searched and walked. Bodies are prose, not inventories: a spec
says what a module is responsible for and where its boundary runs, never what
its files happen to be called.

## Start here

| Node                                                        | Type                  | What it answers                                                                    |
| :---------------------------------------------------------- | :-------------------- | :--------------------------------------------------------------------------------- |
| [Product goal and requirements](./goal-and-requirements.md) | goal-and-requirements | What the product is, who it is for, what is explicitly not a goal                  |
| [Architecture guardrails](../development/architecture.md)   | architecture-design   | The composition root, the module map, dependency direction, and the enforced gates |
| [Domain vocabulary](../../CONTEXT.md)                       | architecture-design   | What each user-facing term means, and which word not to use                        |
| [UI design spec](../development/design-spec.md)             | architecture-design   | Surfaces, controls, colours, typography, breakpoints                               |
| [Feed data lifecycle](../development/data-flow.md)          | architecture-design   | Fetch → merge → retention → persistence, and what is stored                        |
| [Decision index](../adr/README.md)                          | architecture-design   | Every recorded decision, with its status and one-line summary                      |

## Modules

The composition root and the eight service areas:

- [Composition root — main.ts](./module-composition-root.md)
- [Feed ingestion and refresh](./module-feed-ingestion.md)
- [Storage and user state](./module-storage.md)
- [Article enrichment and image caches](./module-enrichment.md)
- [Saving articles to notes](./module-saving.md)
- [Import, export, and backups](./module-portability.md)
- [External integrations](./module-integrations.md)
- [Sidebar, filtering, and search](./module-sidebar-filtering.md)
- [Shared kernel](./module-shared-kernel.md)

The presentation packages and the shared floor:

- [Views and media players](./module-views.md)
- [Components](./module-components.md)
- [Modals](./module-modals.md)
- [Settings UI](./module-settings-ui.md)
- [Discover data layer](./module-discover.md)
- [Hotkeys and palette commands](./module-hotkeys-commands.md)
- [Utils](./module-utils.md)
- [Types](./module-types.md)
- [Styles](./module-styles.md)

## Status

Every node here is `status: draft`: the graph was reverse-engineered from the
codebase and has not been reviewed yet. `docs/specs/` is the only home for
drafted specs, and adopted documents keep their existing location. Once
reviewed, a durable spec moves to `active` and stays there — it evolves with
the code and is never closed.
