# ADR 0011: Starred state is independent from tags

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-22

## Context and problem

Before this decision, starring an article in RSS Dashboard also added a `Favorite` tag, and unstarring the article removed that tag.

This represented the same idea in two different systems: the article had both a starred state and a tag describing that state. It also made `Favorite` behave differently from ordinary user-created tags. A user could create or rely on a tag named `Favorite`, but unstarring the article could remove it even though the user had not asked to change its tags.

The coupling also conflicted with the Google Reader-compatible model already used by RSS Dashboard's starred-article importer, where starred state and user-defined labels are separate concepts.

We therefore needed to decide whether starring should continue to control a special tag, whether `Favorite` should become a reserved system tag, or whether stars and tags should become fully independent.

## User stories

The decision is intended to preserve three main user expectations:

1. As a reader, I want starring an article to show only a filled star, so that a lightweight keep/revisit action is not duplicated as a classification chip.
2. As a reader, I want un-starring an article to leave every tag unchanged, so that I do not lose my organization metadata.
3. As a reader, I want adding a tag named `Favorite` to leave starred state unchanged, so that tag names remain mine to define.

For a complete list of all 14 user stories that were identified, visit [GitHub Issue #331](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/331).

## Decision

Starred state and tags are independent.

A star represents lightweight article state. Tags represent user-defined classification. Neither is derived from the other, and no tag name has reserved starred-state semantics.

Concretely:

- Starring or unstarring an article never adds, removes, or renames a tag, including one named `Favorite` or `Starred`.
- Adding, removing, renaming, recoloring, or deleting a tag never changes whether an article is starred.
- The filled star remains the visual indicator that an article is starred.
- The tag menu shows only tags actually assigned to the article.
- Fresh installations no longer include `Favorite` in the default tag palette.
- Existing `Favorite` tags and palette entries are left untouched.

### Valid star/tag combinations

All four combinations are valid and meaningful:

|               | Untagged                                                     | Tagged                                                                                       |
| ------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Starred**   | A lightweight keep or revisit marker with no classification. | Starred and classified; each can be changed independently.                                   |
| **Unstarred** | The default: no starred state and no classification.         | Classified without being marked for revisit; tags do not imply starred or read-later intent. |

## Consequences

### Benefits

- Stars can serve as a lightweight keep, favorite, or revisit signal without adding metadata to the tag system.
- Tags remain entirely user-controlled and can be used for classification, topics, workflows, or any other purpose.
- The interface no longer represents the same state twice with both a filled star and an automatically generated tag chip.
- A tag named `Favorite` behaves exactly like any other user-created tag.
- Starred state and tags can be combined intentionally instead of one automatically controlling the other.
- RSS Dashboard's local behavior now matches the separation already used by its Google Reader-compatible starred-import model.

### Trade-offs

- Users accustomed to every starred article automatically receiving a `Favorite` tag will no longer see that happen for newly starred articles.
- Over time, an existing vault may contain some older starred articles with `Favorite` tags and newer starred articles without them. This is expected because existing data is deliberately not rewritten.
- Workflows that depended specifically on the automatically generated `Favorite` tag should use starred-state filtering instead, or assign a tag explicitly if both concepts are desired.

### Existing users and data

No migration removes or changes existing tags.

RSS Dashboard cannot reliably determine whether an existing `Favorite` tag was generated automatically by an older version or intentionally created or assigned by the user. Removing tags based on a heuristic could therefore destroy user-created data.

Existing `Favorite` tags and palette entries are preserved exactly as stored. From this decision forward, `Favorite` is an ordinary user tag with no special relationship to starred state.

This is a change to future behavior, not a cleanup of historical data.

## Considered options

### Keep automatically adding and removing a `Favorite` tag

Rejected.

This duplicates the same information in both the starred-state UI and the tag system, places a tag in the user's tag menu that they may not have assigned themselves, and makes unstarring potentially destructive to a tag the user may have created or incorporated into their own organization system.

It also conflicts with the Google Reader-compatible import model RSS Dashboard already follows, where starred state and user labels are separate.

### Reserve `Favorite` as a system tag

Rejected.

RSS Dashboard could prevent users from renaming or deleting `Favorite`, or otherwise treat it specially throughout the interface.

This would preserve the coupling in another form and require special handling throughout tag editing, filtering, rendering, and storage. It would also prevent users from freely using `Favorite` as an ordinary classification of their own.

### Remove existing `Favorite` tags that appear to have been generated automatically

Rejected.

Stored article data contains no provenance that distinguishes an automatically generated `Favorite` tag from one a user intentionally assigned.

Any cleanup heuristic could silently delete user data. Preserving ambiguous existing data is safer than attempting to infer user intent.

### Decouple stars and tags going forward, leaving existing data untouched

Chosen.

Stars and tags become independent while all previously stored user data remains intact.

## Historical precedent

Separating stars from user-defined labels is established behavior in the Google Reader-compatible ecosystem that RSS Dashboard already interoperates with.

- Google Reader's 2008 [“Better Cooking Through Reader-ing”](https://googlereader.blogspot.com/2008/11/better-cooking-through-reader-ing.html) post demonstrates a real-world workflow where stars act as a lightweight marker while item-level tags provide additional organization and retrieval.
- Inoreader's [tag-editing API](https://www.inoreader.com/developers/edit-tag) represents system starred state separately from user-defined labels and tags.
- Inoreader's [“Use stars like never before”](https://www.inoreader.com/blog/2014/12/use-stars-like-never-before.html) describes stars as their own article-state mechanism.
- FreshRSS's [Google Reader-compatible API documentation](https://freshrss.github.io/FreshRSS/en/developers/06_GoogleReader_API.html) follows the same distinction between system state and user-defined labels.

These references provide historical precedent for the model, but they are not the primary reason for the decision.

For RSS Dashboard, the decisive concerns are avoiding duplicate UI, keeping the tag system user-controlled, preventing unstarring from deleting potentially user-created data, and maintaining a simple model in which starred state and classification can vary independently.

## Implementation notes

The shared article-update normalization path no longer changes tags in response to a starred-state update. Saved-tag behavior is separate and unaffected by this decision.

Fresh installations no longer seed `Favorite` into the default tag palette. Existing installations are not migrated or cleaned up.

The starred-import mapper already treats Google Reader-compatible system starred state and exported labels separately and continues to do so. It must not manufacture a `Favorite` tag from starred state.

Starred retention protection and starred-status filtering continue to read starred state directly. Tag filtering continues to read assigned tags directly. The two remain independently composable.

## Related

- [ADR 0003 — Generalize starred-article import naming to Google Reader-compatible](0003-generalize-starred-import-to-google-reader-compatible-naming.md)
- [Starred state and tags development notes](../development/starred-state-and-tags.md)
- [GitHub Issue #331](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/331) — decouple starred state from tags
- [GitHub Issue #332](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/332) — primary star-entry-point regression coverage
- [GitHub Issue #333](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/333) — filtering and retention independence
- [GitHub Issue #334](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/334) — import, re-import, and storage persistence coverage
