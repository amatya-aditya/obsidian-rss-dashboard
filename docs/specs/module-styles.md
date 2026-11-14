---
id: module-styles
type: submodule-design
status: draft
title: Package — styles
parent: architecture
---

# Package — styles

## Responsibility

Own the plugin's stylesheet: one file per surface, imported in cascade order by
`src/styles/index.css` and compiled by esbuild into the released `styles.css`.

## Boundary

CSS only, consuming Obsidian's CSS variables and the plugin's own class root.
The rules themselves — surfaces, controls, colours, typography, breakpoints —
are in [the UI design spec](../development/design-spec.md); this module owns
how they are packaged and scoped.

## Invariants

- **One entry point.** `index.css` holds the `@import` list; its order is the
  cascade and is changed only with an intended, reviewed cascade change.
- **Everything is scoped under an `rss-` class.** Unscoped selectors collide
  with Obsidian's vault-wide classes and break other plugins' UI; enforced by
  `check:css-scope`.
- **No `!important`, ever.** A conflict is resolved with a scoped selector
  built from an existing plugin root, component, and state.
- **`reduced-motion.css` imports last** so its same-specificity rules win.
- **Breakpoint values are mirrored in two places.** The JS constants live in
  `platform-utils.ts`; each CSS media query repeats the number (about 60 of
  them). Nothing links the two, so a change to a breakpoint constant has to be
  swept through the stylesheets by hand.
