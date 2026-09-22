# [TARGET_FILE.css] — Cleanup, Standardization & Split Plan

Comprehensive plan to clean up `src/styles/[TARGET_FILE.css]` ([N] lines, ~[X] KB)
in line with the audit-remediation-2.3.0 checklist and the design-spec token/scoping
rules. Modeled after the section-comment structure of `modals.css`.

---

## 1. Recommended File Split

The current monolith mixes **[N] distinct concerns**. Splitting produces files
that mirror the existing pattern established by `add-feed-modal.css`,
`feed-manager-modal.css`, etc.

| New file                              | Lines (approx) | What it owns               |
| ------------------------------------- | -------------- | -------------------------- |
| `[TARGET_FILE.css]` _(keep, trimmed)_ | ~[N]           | [Core concern description] |
| `[SPLIT_FILE_1.css]` _(new)_          | ~[N]           | [Concern description]      |
| `[SPLIT_FILE_2.css]` _(new)_          | ~[N]           | [Concern description]      |

> [!NOTE]
> **Why not more splits?** [Explain which concerns are tightly coupled and why
> > they remain together. Reference shared CSS custom properties or layout state
> > dependencies as appropriate.]

---

## 2. Structural Section Map (matching modals.css style)

The cleaned `[TARGET_FILE.css]` will use these numbered comment blocks:

```
1.  Base Variables & Custom Properties
2.  [Section Name]
3.  [Section Name]
4.  [Section Name]
…
N.  Media Query — Mobile (max-width: 768px)
```

<!-- If the file is being split, add a section map per output file: -->
<!--
The new `[SPLIT_FILE_1.css]` will use:
```
1.  [Section Name]
2.  [Section Name]
```
-->

The two split-out files each get the same file-level header block as `modals.css`.

---

## 3. Dead Code & Redundancies to Remove

| Lines | Issue                                         | Action                                                                                                      |
| ----- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [N–N] | [Description of commented-out or dead block]  | **Remove** — [brief reason]                                                                                 |
| [N–N] | [Description of commented-out or dead block]  | **Remove** — [brief reason]                                                                                 |
| [N]   | `.[selector]` — hardcoded `[property: value]` | **Replace** with `var(--[token-name])` per design-spec token rules                                          |
| [N]   | `.[selector]:hover` — hardcoded `[hex value]` | **Replace** with `var(--[token-name])`                                                                      |
| [N–N] | `.[selector]` — hardcoded `[property: value]` | **Replace** with `var(--[token-name])` / `var(--[token-name])` (tokens already exist in modals.css `:root`) |

<!-- Repeat rows as needed. Add a flag row for any color with no existing token: -->
<!--
| [N] | `.[selector]` — hardcoded `[hex]` | **Token needed** — no design-spec token exists yet; see Open Questions Q[N] |
-->

---

## 4. `!important` Audit

| Lines | Declaration                                      | Disposition                                                                                                                                      |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [N]   | `.[selector] { [property]: [value] !important }` | **Scope to higher specificity**: `body .[parent] .[selector]` — [brief reason]                                                                   |
| [N]   | `.[selector] { [property]: [value] !important }` | **Keep with audit comment** — [required override reason]; add `/* audit-ok: [reason] */`                                                         |
| [N–N] | `.[selector] { … !important × [N] }`             | **Scope to higher specificity** — use `body .[selector]` to replace all [N] `!important`s                                                        |
| [N–N] | [Pseudo-element block]                           | **Keep** — [e.g. pseudo-element normalization]; add `/* audit-ok: [short label] */`                                                              |
| [N]   | `.[selector] { display: none !important }`       | **Keep** — utility toggle class; `!important` is the accepted pattern for display-toggle utilities. Add `/* audit-ok: display toggle utility */` |
| [N–N] | `.[selector] svg { … !important × [N] }`         | **Keep** — explicitly sanctioned by design-spec §"[Section Name]". Add `/* audit-ok: [citation] */`                                              |

---

## 5. Selector / Rule Redundancies

Lines [N–N] define `.[selector-A]` and lines [N–N] define `.[selector-B]`.
Lines [N–N] then re-declare both together with **overlapping properties**
(`[prop1]`, `[prop2]`, `[prop3]`).

**Action:** Merge the [N] blocks into [N] clean declarations. The `[property]`
and `[property]` from the third block belong in the primary rule.

<!-- Add additional paragraphs for each redundancy cluster found. -->

---

## 6. Proposed Changes Summary

### [MODIFY] [TARGET_FILE.css](file:///path/to/TARGET_FILE.css)

- Add file-level header block (matching modals.css style)
- Add numbered section comment blocks (sections 1–[N] per map above)
- Remove all dead/commented-out code
- Replace hardcoded hex values with design-spec tokens
- Eliminate / scope `!important` declarations per audit plan
- Merge duplicate `.[selector]` rules
- Move [split concern] rules to `[SPLIT_FILE_1.css]`
- Move [split concern] rules to `[SPLIT_FILE_2.css]`

---

### [NEW] [SPLIT_FILE_1.css](file:///path/to/SPLIT_FILE_1.css)

- File-level header comment
- [Description of rules extracted]

---

### [NEW] [SPLIT_FILE_2.css](file:///path/to/SPLIT_FILE_2.css)

- File-level header comment
- [Description of rules extracted]

---

### [MODIFY] [index.css](file:///path/to/index.css)

- Add imports for the [N] new CSS files

---

## Open Questions

> [!IMPORTANT]
> **Q1 — [Decision title]?**
> [Describe the trade-off or ambiguity. State the recommendation explicitly.]
> Approve or redirect?

> [!IMPORTANT]
> **Q2 — [Decision title]?**
> [Describe the trade-off or ambiguity. State the recommendation explicitly.]
> Confirm?

> [!NOTE]
> **Q3 — [Token inconsistency or naming question]**
> [Describe the inconsistency. State the standardization recommendation.]
> Confirm?

---

## Verification Plan

### Manual Checks

- [Primary UI surface] renders correctly in Obsidian (desktop and mobile)
- [Split-out modal or overlay] opens and displays correctly
- [Specific component 1] shows correct colors in [context]
- [Specific component 2] renders correctly ([specific visual property])
- [Utility class] properly [toggles/hides/shows] [element]
- [Specific interactive state] still visible / functional
- Focus rings visible for keyboard navigation

### Lint / Build

- `npm run build` passes with no new CSS scope violations
- No regressions in `npm run check:css-scope`
