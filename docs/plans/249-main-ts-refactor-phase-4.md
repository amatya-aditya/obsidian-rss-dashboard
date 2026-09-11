---
status: accepted
created: 2026-09-11
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/249"
milestone: ""
owner: unassigned
workstream: ""
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Complete main.ts Refactor Phase 4 — Documentation & Error Handling

## Context

The extraction of five service modules from `main.ts` (Phases 0–3 of the main.ts refactor) is complete and all 896+ tests pass. Phase 4 cleanup remains unfinished:

- Exported members lack comprehensive JSDoc comments
- Error-handling patterns are inconsistent across services
- Phase 4 work was never formally committed

This plan captures the scope and approach for completing Phase 4.

See the original refactor plan at `docs/plans/main-ts-refactor.md` for Phases 0–3 context.

## Problem Statement

Future maintainers and developers integrating with the five service modules cannot easily understand their public APIs. JSDoc comments are missing, IDE autocomplete lacks documentation, and error-handling behavior is unpredictable (some methods throw, others show Notices, some fail silently).

## Solution

1. **Add JSDoc to all exported members** of the five service modules
2. **Establish a consistent error-handling pattern**
3. **Commit Phase 4 completion**

## Modules in Scope

- `src/services/backup-service.ts` — `BackupService` class
- `src/services/folder-service.ts` — `FolderService` class
- `src/services/import-export-service.ts` — `ImportExportService` class
- `src/services/background-import-service.ts` — `BackgroundImportService` class
- `src/utils/settings-loader.ts` — pure functions

## Implementation Plan

### Phase 4a — JSDoc Documentation

For each module:

1. Review all exported class methods, functions, and type signatures
2. Add or complete JSDoc comments with:
   - Brief description (1–2 sentences)
   - `@param` entries for all parameters
   - `@returns` entry describing return value
   - `@throws` entry if the method may throw
3. Run `npx tsc --noEmit -skipLibCheck` to catch any type errors
4. Commit incrementally: "docs: add JSDoc to <module>"

### Phase 4b — Error Handling Standardization

1. **Audit current patterns**: Review error handling in each module (throw vs. Notice vs. silent)
2. **Establish rule**: "Service methods throw on recoverable errors (bad input, network timeout); callers decide whether to show Notice or handle silently. For invariant violations (state corruption, missing dependency), log error and throw."
3. **Apply consistently**: Update methods that deviate from the pattern
4. **Commit**: "refactor: standardize error handling across service modules"

### Phase 4c — Final Validation & Commit

1. Run full test suite: `npm run test:unit` — confirm all 896+ tests pass
2. Run build: `npm run build` — confirm no type errors, linting issues
3. Create final commit: `refactor: complete main.ts decomposition — document services and standardize error handling`

## Testing Strategy

- **Seam 1 (Unit Tests)**: Five service test files remain green
- **Seam 2 (Integration Tests)**: `plugin-lifecycle.test.ts` and related main.ts tests remain green
- **Full suite**: `npm run test:unit` → all tests passing

## Success Criteria

- [ ] All exported members of the five modules have JSDoc documentation
- [ ] Error-handling patterns are consistent (throw vs. Notice per the rule above)
- [ ] All 896+ tests pass (`npm run test:unit`)
- [ ] `npm run build` succeeds with zero errors
- [ ] Phase 4 is committed in version control
- [ ] No breaking changes to public APIs

## Out of Scope

- Further main.ts decomposition (main.ts size reduction is deferred follow-up work)
- API redesign or breaking changes
- New features or performance optimization

## Notes

- Review `BackgroundImportService` and `settings-loader.ts` carefully (higher risk)
- Current main.ts line count (3,405) exceeds original plan target (600); future follow-up should assess whether further extraction is needed
