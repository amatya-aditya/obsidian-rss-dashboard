# Curated What's New note template

Use this template when adding a note under `src/release-notes/notes/`.

- Release-line notes use `<major>.<minor>.md` and are required for
  `x.y.0` releases.
- Patch notes use `<major>.<minor>.<patch>.md` and are optional. Add one only
  when the fix is worth an automatic popup; make it self-contained.
- Register every note with an explicit import in `src/release-notes/index.ts`.
- Use HTTPS images with useful alt text. Images remain remote; note text is
  embedded into the plugin bundle.

```markdown
# RSS Dashboard X.Y.Z

Short user-facing introduction.

## Short section title

Explain the most important user-visible change.

![Useful description](https://example.com/image.png)

## Also improved

- Concise user-facing improvement.
- Another concise improvement.
```
