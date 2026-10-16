# Slice 4 drafts (#826)

Status: **draft, local only. Nothing here is posted.** Based on
`slice-4-audit.md`. Labels: FAIL = cited WCAG 2.2 criterion, GAP = ARIA
Authoring Practices or project expectation (see the ADR 0016 amendment).

## Draft: umbrella checklist replacement

Replace the line `- [ ] **Slice 4** — menus, dialogs, landmarks (criteria not yet split)` with:

```md
- [ ] **Slice 4** — menus, dialogs, landmarks. Criteria split after an audit
      (`docs/planning/826-agent-testability-quick-wins/slice-4-audit.md`).
      Already shipped without a Slice 4 ticket: article header selects
      (#850, #891), Filter menu Esc and focus return (#895), Reader tag menu
      (#892, #906), click-only `role=button` controls (#848, #858), #696,
      card titles as headings (#720).
  - [ ] Discover filter checkboxes: associate their labels (reading path)
  - [ ] Sidebar rows: role, name and current state (reading path)
  - [ ] Discover card titles as headings (reading path)
  - [ ] Dialogs: role, name, focus containment and focus return for plugin modals
  - [ ] Reading-path landmarks: card footers, `main`/`navigation`, Reader body, sidebar Tab stop
  - [ ] Filter menu trigger state
```

Tick the Slice 4 box only after the child tickets are filed. The remaining
`div role=button` controls (audit V-003, M-011) go to #502, not to Slice 4.

## Draft: replacement for AC-014

Ordered with the reading path first.

| ID      | Criterion                                                                                                                                                                                                                     | Basis                                   | Check                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| AC-014a | Every Discover filter checkbox has an accessible name from its visible label.                                                                                                                                                 | FAIL, 4.1.2 / 1.3.1 (audit V-001)       | jsdom name assertion; AX-tree capture                                |
| AC-014b | Sidebar feed and folder rows expose a role and name, and the active row exposes `aria-current` (or the selected state of the chosen pattern). The `Shift+S`, arrow-key and Shift+F10 paths keep working.                      | FAIL, 4.1.2 (audit L-004, L-005)        | jsdom assertions; fixture-vault keyboard walk                        |
| AC-014c | Discover card titles are exposed as headings at one consistent level.                                                                                                                                                         | FAIL, 1.3.1 (audit V-002)               | jsdom role assertion; AX-tree capture                                |
| AC-014d | Every plugin modal exposes `role="dialog"`, `aria-modal="true"` and an accessible name from its visible heading.                                                                                                              | FAIL, 4.1.2 (audit D-001, D-002)        | jsdom role + name assertion through the shared seam; AX-tree capture |
| AC-014e | While a plugin modal is open, Tab and Shift+Tab stay inside it.                                                                                                                                                               | FAIL, 2.4.11 (audit D-007)              | Real-key Tab walk in the fixture vault; jsdom where feasible         |
| AC-014f | Closing a plugin modal returns focus to its opener when the opener is still connected. Initial focus stays inside the modal.                                                                                                  | GAP (audit D-005)                       | jsdom focus test; keyboard walk                                      |
| AC-014g | Card footers are not exposed as `contentinfo` landmarks. The dashboard has one `main` and a named sidebar `navigation`; the Reader body sits in a landmark; sidebar rows get one Tab stop. Cards do not get `role="article"`. | GAP (audit L-002, L-001, R-004, L-005b) | AX-tree capture before and after                                     |
| AC-014h | The Filter menu's triggers expose `aria-haspopup` and `aria-expanded`, and Esc returns focus to whichever trigger opened it.                                                                                                  | GAP (audit M-001, M-002)                | jsdom assertions; keyboard walk                                      |

Premise correction to record in the spec: the outline assumed Obsidian's `Modal`
supplies the dialog role and focus trap. On Obsidian 1.14.4 it supplies neither,
and gives no accessible name (audit D-001, D-002, D-007). Initial focus and Esc
work (D-003, D-004).

## Draft: ticket list

1. Discover filter checkbox labels (AC-014a).
2. Sidebar rows: role, name and current state (AC-014b).
3. Discover card headings (AC-014c).
4. Dialogs: one shared helper for role, `aria-modal`, name, focus containment
   and focus return (AC-014d, AC-014e, AC-014f). A modal that fails for another
   reason gets its own ticket.
5. Reading-path landmarks (AC-014g).
6. Filter menu trigger state (AC-014h).
7. Follow-up audit for the UNVERIFIED rows: mobile, popout, light theme, screen
   reader, Settings tabs, the article tag menu (M-012).
