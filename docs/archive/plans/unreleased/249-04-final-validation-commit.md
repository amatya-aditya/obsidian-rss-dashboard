# 04: Final validation and commit Phase 4

**Parent:** #249

**What to build:** Confirm all Phase 4 work is complete and correct (JSDoc, error handling, tests, linting). Create a final commit that marks the end of the main.ts refactor Phase 4.

**Blocked by:** 03 (all documentation and error-handling work complete)

**Status:** completed (PR #250)

## Validation Checklist

- [ ] Full unit test suite passes: `npm run test:unit` → all 896+ tests passing
- [ ] Build succeeds with no errors or warnings: `npm run build`
- [ ] Type checking passes: `npx tsc --noEmit -skipLibCheck`
- [ ] Linting passes: `npx eslint src/ --max-warnings=0` (focus on the five modified service modules)
- [ ] Compliance checks pass: `npm run check:compliance`
- [ ] No regressions in plugin behavior:
  - [ ] Plugin loads without startup errors
  - [ ] Dashboard, discover, reader, smallweb views activate normally
  - [ ] Feed refresh and background import still work as expected
  - [ ] Settings load and persist correctly
  - [ ] Import/export and backup functionality unchanged

## Acceptance criteria

- [ ] All tests pass
- [ ] All build checks pass
- [ ] All compliance checks pass
- [ ] No regressions detected
- [ ] Final commit created with message:
  ```
  refactor: complete main.ts decomposition — document services and standardize error handling
  
  Phase 4 of the main.ts refactor adds comprehensive JSDoc documentation to all
  exported members of the five service modules (BackupService, FolderService,
  ImportExportService, BackgroundImportService, settings-loader utilities) and
  establishes a consistent error-handling strategy across services.
  
  Recoverable errors (bad input, timeouts) are thrown; callers decide on UX.
  Invariant violations are logged and thrown.
  
  All 896+ tests pass; no breaking changes.
  
  Closes #249.
  ```
- [ ] GitHub issue #249 is updated with completion status and link to final commit
