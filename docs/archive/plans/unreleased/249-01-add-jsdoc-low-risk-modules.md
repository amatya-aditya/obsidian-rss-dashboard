# 01: Add JSDoc to low-risk modules

**Parent:** #249

**What to build:** BackupService, FolderService, and ImportExportService have complete JSDoc documentation on all exported members (classes, methods, interfaces). This ticket establishes the JSDoc style pattern for the higher-risk modules that follow.

**Blocked by:** None (can start immediately)

**Status:** completed (PR #250)

## Modules

- `src/services/backup-service.ts` — `BackupService` class
- `src/services/folder-service.ts` — `FolderService` class  
- `src/services/import-export-service.ts` — `ImportExportService` class

## Acceptance criteria

- [ ] All exported class methods have JSDoc with brief description, `@param` for each parameter, `@returns` describing the return value, and `@throws` if the method may throw
- [ ] All exported interfaces/types used in public signatures have JSDoc comments
- [ ] JSDoc style is consistent across all three modules (brief summary, no overly verbose descriptions)
- [ ] `npm run build` succeeds with zero type errors
- [ ] All service unit tests pass (`test_files/unit/services/backup-service.test.ts`, `folder-service.test.ts`, `import-export-service.test.ts`)
- [ ] Code is committed with message: `docs: add JSDoc to backup, folder, and import-export services`
