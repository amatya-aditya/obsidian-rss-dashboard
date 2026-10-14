# Slice 4 audit: menus, dialogs, landmarks (#826)

Status: **draft, local only.** Read-only audit; no source changed.

## Reference and labels

The bar is WCAG 2.2 Level AA, per
[ADR 0016](../../adr/0016-wcag-22-aa-accessibility-reference.md) and its
2026-10-13 amendment. Obsidian's behavior is a floor and a pattern to reuse, not
the pass/fail bar. Reading-path surfaces are fixed first.

| Label      | Meaning                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| FAIL       | Violates a named WCAG 2.2 A/AA success criterion. The row cites the criterion and the W3C failure or technique it rests on. |
| GAP        | Falls short of an ARIA Authoring Practices pattern or an ACCESSIBILITY.md expectation, but violates no criterion.           |
| HOST       | Owned by Obsidian. Recorded as a limitation; not fixed.                                                                     |
| PASS       | Observed the expected behavior.                                                                                             |
| UNVERIFIED | Not exercised, or not checked with the evidence the finding needs.                                                          |

Criterion mappings were checked against the W3C "Understanding WCAG 2.2" pages
for 1.3.1, 2.4.1, 2.4.3, 2.4.11 and 4.1.2. "Inferred" means the page does not
name the exact pattern and the general failure or technique was applied.

## Environment and method

- Build: `dev` at `c8f980ef`, plugin 2.7.1, rebuilt with `npm run build`.
- App: Obsidian 1.14.4 desktop (Windows), fixture vault (shard-v2) reset before
  the pass, own profile and debug port, window 1500 × 950.
- Evidence:
  - Chromium accessibility tree (`Accessibility.queryAXTree` and
    `getPartialAXTree` over CDP) for roles, names and states.
  - Real key events (`Input.dispatchKeyEvent`: Tab, Shift+Tab, Enter, arrows,
    Esc, Shift+F10) for focus behavior.
  - DOM probes where the accessibility tree timed out (the Reader's absent
    roles, Discover's 359 cards).
  - Static reads of `src/modals/` and `src/settings/modals/`.
  - The key and accessibility-tree calls are the `@key`, `@ax` and `@axquery`
    steps that #1124 adds to `scripts/obsidian-cdp.mjs`.
- Not covered: mobile, popout window, light theme, touch, a real screen reader,
  Settings tabs (Obsidian opens them in a separate window).

### Corrections from the first pass

- **L-003 retracted.** Card titles are exposed as headings (`role=heading`,
  level 3, added by #720). The first pass read `div` tag names and missed it.
- **Modal premise.** The grill assumed Obsidian's `Modal` supplies the dialog
  role and the focus trap. It supplies neither (D-001, D-007).
- A first DOM pass left a modal open and mixed up later rows, and an Enter key
  event without text never activated buttons. Every row below comes from a
  clean rerun.

## Reading path: dashboard

| ID     | Observation                                                                                                                                                                                  | Evidence                      | Label                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| L-003  | Card titles are headings, level 3, named with the article title.                                                                                                                             | AX tree: 50 `heading` nodes   | PASS                                                            |
| L-002  | Every card's `<footer class="rss-dashboard-card-footer">` is exposed as an unnamed `contentinfo` landmark: 50 per page. Landmark navigation lists 50 identical entries and no useful ones.   | AX tree: 50 `contentinfo`     | GAP (landmark misuse; some audits cite 1.3.1)                   |
| L-005  | Sidebar feed and folder rows are `div`s with `tabindex="-1"` and no role. The accessibility tree marks them `ignored`; only their text survives. Clicking a row selects a feed.              | AX tree: role `none`, ignored | FAIL, 4.1.2 (F59: script-driven control with no role)           |
| L-005k | Keyboard operation exists: `Shift+S` focuses the sidebar, arrow keys move between rows, and Shift+F10 opens the row's context menu.                                                          | Real keys                     | PASS, 2.1.1                                                     |
| L-005b | The rows are not reachable with Tab (one Tab stop with roving focus is the APG tree/listbox pattern).                                                                                        | Real Tab walk                 | GAP                                                             |
| L-004  | The active feed or folder is marked only with an `active` class. No `aria-current` or selected state.                                                                                        | DOM and AX                    | FAIL, 4.1.2 (state not programmatically determinable, inferred) |
| L-001  | The dashboard has no `navigation`, `main` or `search` landmark. 2.4.1 concerns blocks repeated across pages; landmarks are one optional technique (ARIA11) and headings (H69) already exist. | AX tree: zero landmarks       | GAP                                                             |
| L-006  | One `status` live region (Slice 3).                                                                                                                                                          | AX tree                       | PASS                                                            |

## Reading path: Reader

| ID    | Observation                                                                                                                  | Evidence           | Label |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----- |
| R-001 | Article title is an `h1`.                                                                                                    | DOM                | PASS  |
| R-002 | Toolbar is `role=toolbar` named "Reader actions", one Tab stop (Save article `tabindex=0`, the rest `-1`), 11 named buttons. | AX tree, DOM       | PASS  |
| R-003 | The hero image has alt text from the article title.                                                                          | DOM                | PASS  |
| R-004 | No landmark wraps the article body.                                                                                          | DOM (AX timed out) | GAP   |

## Reading path: Discover

| ID    | Observation                                                                                                                                                                                                    | Evidence                       | Label                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------- |
| V-001 | Filter checkboxes have no accessible name. Each is `<input type="checkbox"><label>AI</label>`: the label sits beside the input but is not associated with it (no `for`/`id`, no wrapping). 200 unnamed inputs. | AX tree: `checkbox`, name `""` | FAIL, 4.1.2 (F68) and 1.3.1 (H44)   |
| V-002 | Card titles are `div`s; the view has no headings. Cards are ignored in the accessibility tree; each exposes only its Preview and "Add to..." buttons.                                                          | DOM, AX                        | FAIL, 1.3.1 (F2, inferred)          |
| V-003 | Three `div role=button` controls: Return to dashboard, Open Kagi Smallweb, Toggle discover filters menu (legacy pattern under #502).                                                                           | DOM                            | GAP                                 |
| V-004 | The search field's only name is its placeholder ("Search feeds...").                                                                                                                                           | AX tree                        | GAP (3.3.2 prefers a visible label) |
| V-005 | No landmarks.                                                                                                                                                                                                  | DOM                            | GAP                                 |

## Dialogs

Live checks: Add feed, Manage feeds, Add folder, Keyboard shortcuts, Import
OPML/XML, Import starred articles. Static check: every `Modal` subclass in
`src/modals/` and `src/settings/modals/` (about 24). No modal sets `role`,
`aria-modal`, `aria-labelledby` or `aria-label`, and none saves and restores
focus.

| ID    | Observation                                                                                                                                                                                                                                                                                                                                                                    | Evidence                                                         | Label                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D-001 | No `role="dialog"` or `aria-modal` on any plugin modal. Obsidian's `Modal` adds neither, and no plugin modal adds its own.                                                                                                                                                                                                                                                     | Live attributes (6), static read (all)                           | FAIL, 4.1.2 (F59, inferred)                                                       |
| D-002 | No accessible name. Headings are `setHeading()` rows or `h2`/`h3`/`h4` inside the content; `.modal-title` is empty except Refresh details (`setTitle`).                                                                                                                                                                                                                        | Live (6), static (all)                                           | FAIL, 4.1.2 (F68)                                                                 |
| D-003 | Initial focus lands inside the modal (input, first button or link).                                                                                                                                                                                                                                                                                                            | Live (6)                                                         | PASS                                                                              |
| D-004 | Esc closes the modal.                                                                                                                                                                                                                                                                                                                                                          | Real Esc (6)                                                     | PASS                                                                              |
| D-005 | Focus does not return to the opener. It lands on the workspace leaf. Command-opened modals "return" only because the leaf was the opener.                                                                                                                                                                                                                                      | Real keys (6)                                                    | GAP (2.4.3 shows return as a passing example)                                     |
| D-007 | **Focus is not contained.** After the modal's last control, Tab moves into the dashboard behind it (Navigate back, Filters, card buttons) while the modal stays open. The background is neither `inert` nor `aria-hidden`. Containment is unreliable rather than absent: in one of nine Add folder walks, focus cycled inside three times before leaking once and coming back. | Real Tab walk (6 of 6 modals; Add folder leaked in 8 of 9 walks) | FAIL, 2.4.11 (inferred: focused controls sit under the modal and its dim overlay) |
| D-008 | The same Obsidian `Modal` class has the same gaps in core Obsidian. The plugin can still fix its own instances.                                                                                                                                                                                                                                                                | Shared class                                                     | HOST baseline; fix in plugin (per the ADR amendment)                              |

## Menus and popups

| ID    | Observation                                                                                                                                                                                                                                                  | Evidence           | Label                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------- |
| M-003 | Header menu button (☰): Enter opens it, `aria-expanded` turns true, Tab moves into its controls, Esc closes it and returns focus.                                                                                                                           | Real keys          | PASS                                          |
| M-008 | Themed selects (Age, Sort, Grouping, View style, Cards per row): `role=combobox`, `aria-haspopup=listbox`. Enter opens a `listbox` with `option`s and one `aria-selected`; `aria-expanded` and `aria-activedescendant` update; Esc closes and returns focus. | Real keys          | PASS                                          |
| M-001 | Dashboard Filter menu has no role, and neither trigger sets `aria-expanded` or `aria-haspopup`.                                                                                                                                                              | DOM                | GAP (APG menu button; some audits cite 4.1.2) |
| M-002 | Filter menu closes on Esc and returns focus to `Filters`. Opened from the `Open viewing filters` icon (`div role=button`), focus lands on `Filters` instead of the icon.                                                                                     | DOM, synthetic Esc | PASS for `Filters`; GAP for the icon          |
| M-009 | Sidebar folder and feed context menus open from the keyboard (Shift+F10 on a focused row). Arrow keys select items; Esc closes and returns focus to the row.                                                                                                 | Real keys          | PASS                                          |
| M-010 | Card context menu opens with Shift+F10 on the card's button; Esc returns focus to it.                                                                                                                                                                        | Real keys          | PASS                                          |
| M-004 | Obsidian `Menu` markup: `.menu` has no role, and items are plain `div`s.                                                                                                                                                                                     | DOM                | HOST                                          |
| M-006 | Search and Tags sidebar buttons toggle `aria-pressed` false → true.                                                                                                                                                                                          | DOM                | PASS                                          |
| M-005 | Page size is a native `<select>`.                                                                                                                                                                                                                            | DOM                | PASS                                          |
| M-011 | The card tag toggle is `div role=button` with `aria-expanded` (legacy pattern under #502).                                                                                                                                                                   | DOM                | GAP                                           |
| M-012 | Article tag menu keyboard behavior (`t`). The probe could not select an article first, so the menu never opened.                                                                                                                                             | —                  | UNVERIFIED (unit tests from #906 cover it)    |

## Still unverified

- Mobile, popout, light theme, touch and a real screen reader across every row.
- Settings tabs (separate window) and the modals not opened live. Their
  semantics are covered statically by D-001, D-002, D-005, but D-003, D-004 and
  D-007 were seen live on 6 only.
- M-012 article tag menu.
- Whether a screen reader announces the 50 `contentinfo` landmarks (L-002) in
  practice.

## Order of work

1. **Reading path FAILs:** V-001 Discover checkbox labels (cheap, 200
   controls), L-005 and L-004 sidebar row role and current state, V-002
   Discover card headings.
2. **Dialog FAILs:** D-001, D-002 and D-007 through one shared fix site, with
   D-005 alongside it (the same helper can restore focus).
3. **Cheap GAPs on the reading path:** L-002 card footers, L-001 and R-004
   landmarks, L-005b sidebar Tab stop.
4. **Other GAPs:** M-001 and M-002 Filter menu state, V-003 and M-011 `div
role=button` controls (fold into #502), V-004 search label.
5. Close M-012 and the environment gaps before a ticket cites them.
