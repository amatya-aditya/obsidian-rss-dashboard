# Name the starred-article importer explicitly for Inoreader

## Status

accepted

## Decision

All user-facing copy for the starred-article import feature — the command name, the Settings-tab section heading and button, the Feed Manager button, the modal title, and the tag-import toggle description — names Inoreader explicitly ("Import starred articles from Inoreader," "Inoreader starred articles," "Inoreader labels become tags…") rather than using generic language like "Import starred articles."

This was a deliberate reversal mid-design: the first instinct was to keep the copy generic, since the underlying `starred.json` schema is the Google Reader API "Read later" format that other tools could plausibly export too, and the feature's internal identifiers (`StarredImportCandidate`, `import-starred-modal.ts`, `starredImportContentState`, GH issue #234's own title) are all named generically for that reason. But today this importer has only ever been built against, and tested against, Inoreader's actual export — no other source has been verified compatible — so a generic name overstates what it currently does.

## Considered Options

- **Generic naming now** ("Import starred articles"), on the theory that a future multi-platform importer would reuse the same UI without a rename. Rejected: it promises format-agnostic support that doesn't exist yet, and a user with a differently-shaped starred export would have no reason to suspect it wouldn't work until it silently fails.
- **Explicit Inoreader naming now** (chosen): names the feature for what it verifiably does today. When another platform's export is supported, the UI copy gets renamed again at that point — a normal, low-cost rename — rather than carrying an inaccurate generic name in the meantime.

## Consequences

The UI copy and the internal identifiers now intentionally disagree in specificity (UI says "Inoreader," code says "starred import" generically). This is deliberate, not drift: don't "fix" the UI copy back to generic language without first confirming a second export format is actually supported, and don't rename the internal identifiers to be Inoreader-specific to match — they were kept generic on purpose so a future multi-source importer doesn't require a type-level rename, only a copy-level one.
