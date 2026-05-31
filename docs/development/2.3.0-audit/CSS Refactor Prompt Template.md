# CSS Refactor Prompt Template

## RSS Dashboard — audit-remediation-2.3.0

Use this prompt when initiating a CSS cleanup/refactor session for a new file.
Replace bracketed placeholders before sending.

---

## Prompt

We are working through the audit-remediation-2.3.0 checklist for the RSS Dashboard
Obsidian plugin. The current task is to produce a **cleanup, standardization, and
split plan** for `[TARGET_FILE.css]` ([TARGET_FILE.css](file:///path/to/TARGET_FILE.css)).

### Reference documents (read these first)

| Document                                                                 | Purpose                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [audit-remediation-2.3.0.md](file:///path/to/audit-remediation-2.3.0.md) | Master checklist — governs what must be fixed                                            |
| [design-spec.md](file:///path/to/design-spec.md)                         | Token names, sanctioned `!important` patterns, color palette, Android/mobile rules       |
| [modals.css](file:///path/to/modals.css)                                 | Canonical structural reference — section comment style, `:root` token block, file header |

### What to produce

Produce a **plan document only** — no implementation code yet. The plan must cover
all six sections below. Use the section headings and table formats exactly as
specified; this output becomes a checklist artifact for the remediation scorecard.

**Structural reference:** follow the layout, section order, table schemas, callout
conventions, and Open Questions format defined in
[css-refactor-plan-template.md](file:///path/to/css-refactor-plan-template.md).
Every section in that template is required; do not omit or reorder them.

---

#### 1. Recommended File Split

Analyze `[TARGET_FILE.css]` for distinct UI concerns. For each proposed file,
provide: filename, approximate line count, and a one-sentence description of what
it owns. Include a brief rationale for any concerns you recommend keeping together
rather than splitting.

Produce a table:

| New file | Lines (approx) | What it owns |
| -------- | -------------- | ------------ |

Then write a short `> [!NOTE]` callout explaining the split boundary decisions.

---

#### 2. Structural Section Map

List every logical section the cleaned file(s) should contain, numbered and labeled
exactly as they will appear in the final comment blocks (matching `modals.css`
style). Use this format:

```
1.  Section Name
2.  Section Name
…
```

If the file is being split, produce a section map per output file.

---

#### 3. Dead Code & Redundancies

Audit for: commented-out rules with no preserved intent, duplicate property
declarations across overlapping selectors, and hardcoded hex/rgb values that should
be design-spec tokens.

Produce a table with **exact line numbers**:

| Lines | Issue | Action |
| ----- | ----- | ------ |

For every hardcoded color, specify the replacement token from `design-spec.md`.
If a token does not yet exist for a value, flag it in an **Open Questions** callout.

---

#### 4. `!important` Audit

For every `!important` declaration, determine one of four dispositions:

- **Remove** — specificity is sufficient without it
- **Scope** — rewrite selector to higher specificity (show the new selector)
- **Keep** — sanctioned by design-spec (cite the relevant section); add `/* audit-ok: … */` comment
- **Keep with comment** — Obsidian host override; no safe alternative; add `/* audit-ok: … */`

Produce a table with exact line numbers:

| Lines | Declaration | Disposition |
| ----- | ----------- | ----------- |

---

#### 5. Selector / Rule Redundancies

Identify blocks where the same selector is declared in multiple locations within
the file (or where two closely-related selectors repeat properties). Describe the
merge action for each.

---

#### 6. Proposed Changes Summary

List every file that will be created or modified, with a one-line description of
the change, formatted as:

```
### [ACTION] filename.css
- Bullet list of changes
```

Close with a **Verification Plan** subsection listing:

- Manual visual checks (desktop + mobile)
- Build/lint gates that must pass

---

### Constraints

- This is an **Obsidian plugin**. Any override of Obsidian host styles must be
  minimally scoped. Do not introduce `!important` to solve new problems.
- Use existing design-spec token names where they fit. If an existing token name
  is ambiguous or a hardcoded value has no matching token, propose a name following
  the established naming schema (e.g. `--rss-color-[context]-[variant]`) and flag
  it as an Open Question for author approval — do not silently invent tokens.
- Do not implement any changes — produce the plan only.
- Flag all decisions that require author approval as `> [!IMPORTANT]` Open
  Questions at the end of the document.
- Use the same file-header comment block format as `modals.css` in any new files.
