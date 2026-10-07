# Article Saving

This context covers reusable article-saving templates, saved-note associations, and how templates are selected for saved articles.

## Language

**Saved template**:
A named reusable article-note body with per-template save options such as a folder and filename pattern.

**Global default template**:
The saved template selected for article saves that have no feed-specific template assignment.

**Feed-assigned template**:
A saved template selected for future article saves from one configured feed. It takes precedence over the global default for that feed.

**Filename pattern**:
An optional saved-template expression that produces the filename stem for an article note, using supported article metadata placeholders but not the article body.

**Filename stem**:
The sanitized filename portion before the automatically added `.md` extension.

**Filename pattern override**:
A one-save replacement for the selected saved template's filename pattern. It changes the name used for that saved note without changing the saved template.
**Saved note**:
A vault note associated with a feed article through the article's save action.
_Avoid_: Saved article (when referring to the note rather than the feed article), article backup

**Saved-note association**:
The recorded relationship between a feed article and its current saved note. An observed rename or move preserves that relationship; opening a saved note does not establish a different association by matching its filename.
_Avoid_: Filename match, recovered article

**Saved state**:
The article state recording its association with a saved note. A missing association, observed note deletion, or confirmed absence during an explicit saved-note open clears it; unobserved changes can leave it stale.
_Avoid_: Backed up, protected forever

**Saved tag**:
The case-insensitive Saved article-tag assignment used as a convenience indicator for saved articles. It is cleared with Saved state, including manually assigned variants, because assignment provenance is not distinguished.
_Avoid_: Saved state (the tag is a separate indicator), starred tag
