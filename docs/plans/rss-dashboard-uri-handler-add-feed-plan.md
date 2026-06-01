# RSS Dashboard URI Handler Plan (Add Feed)

## Goal

Enable one-click feed subscription from external apps/browser extensions via:

`obsidian://rss-dashboard?action=add-feed&url=<encoded-feed-url>`

## Scope

In scope:

- Add URI action handling for `add-feed`.
- Parse and validate `url` parameter.
- Reuse existing feed-add flow (`addFeed`) for parsing, dedupe, save, and refresh.
- Use current default folder behavior.
- Immediate auto-save (no confirmation modal).

Out of scope (this iteration):

- Additional URI actions.
- Complex payloads (custom per-feed settings in URI).
- New settings UI for URI behavior.

---

## Phase 1: Protocol Entry + Dispatch

### Tasks

- [ ] Add protocol handler registration in plugin startup (`onload`) in `main.ts`.
- [ ] Add centralized URI dispatcher method for plugin URI actions.
- [ ] Route `action=add-feed` to a dedicated handler method.
- [ ] Return/show clear error for unsupported actions.

### Deliverable

- Plugin receives URI calls for `rss-dashboard` and routes supported actions.

### Acceptance Criteria

- Calling `obsidian://rss-dashboard?action=unknown` results in a clear unsupported-action notice.

---

## Phase 2: Param Parsing + Validation

### Tasks

- [ ] Parse URI params safely (`action`, `url`).
- [ ] Require `url`; fail fast if missing.
- [ ] Decode URL robustly and handle malformed encoding.
- [ ] Validate feed URL format before invoking add logic.
- [ ] Add guardrails so handler failures do not break startup/runtime.

### Deliverable

- Robust parsing path with user-friendly errors for invalid input.

### Acceptance Criteria

- Missing `url` shows clear notice and does not modify settings.
- Malformed/invalid URL shows clear notice and does not modify settings.

---

## Phase 3: Feed Add Integration (Reuse Existing Path)

### Tasks

- [ ] Implement `handleAddFeedUriAction(...)` in plugin class.
- [ ] Delegate to existing `addFeed(...)` method rather than duplicating logic.
- [ ] Ensure duplicate URL checks come from existing add path.
- [ ] Keep folder resolution aligned with current default behavior.
- [ ] Ensure success/failure notices are clear and not duplicated.

### Deliverable

- URI-triggered add reuses canonical feed-add behavior and persistence flow.

### Acceptance Criteria

- Valid URI adds feed, persists to storage, and appears in dashboard.
- Duplicate URI add is rejected by existing duplicate protections.

---

## Phase 4: Documentation

### Tasks

- [ ] Add usage section to `README.md` with exact URI format.
- [ ] Add browser-extension mapping example (subscribe button -> URI handler).
- [ ] Document URL-encoding requirement for feed URLs.
- [ ] Add troubleshooting notes for unsupported actions or invalid params.
- [ ] Add changelog/release note entry as appropriate.

### Deliverable

- Users can configure browser tools to subscribe directly into RSS Dashboard.

### Acceptance Criteria

- A user can follow docs and complete a successful one-click subscribe flow.

---

## Phase 5: Tests (Implementation Handoff)

### Tasks

- [ ] Add/extend unit tests for URI action parsing and dispatch.
- [ ] Add/extend tests for missing/invalid `url` handling.
- [ ] Add/extend tests confirming delegation to `addFeed(...)`.
- [ ] Add/extend tests for unsupported actions.

### Suggested verification (do not run as part of this planning task)

- `npm test`
- Repo lint/typecheck command set used by maintainers
- Any targeted test command for URI handler specs

### Deliverable

- Confident behavior coverage for happy path and failure paths.

### Acceptance Criteria

- New URI-specific tests pass in CI/local verification.

---

## Execution Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5

## Risks and Mitigations

- Risk: Duplicating add logic introduces drift.
  - Mitigation: Delegate URI flow to existing `addFeed(...)` entrypoint.
- Risk: Poor URI parsing UX causes silent failures.
  - Mitigation: Explicit validation and notices for each failure mode.
- Risk: Notice spam from nested calls.
  - Mitigation: Consolidate notice ownership in URI action path.

## Definition of Done

- URI action `add-feed` works with encoded URL input.
- Feed is added through existing pipeline and persists correctly.
- Invalid inputs fail safely with clear user feedback.
- Docs are updated with working setup instructions.
- Tests are added for parser/dispatch/integration behavior.
