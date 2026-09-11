# 02: Add JSDoc to high-risk modules

**Parent:** #249

**What to build:** BackgroundImportService and settings-loader have complete JSDoc documentation following the pattern established in Ticket 01. These modules handle complex state machines (background import orchestration) and data migration logic (settings normalization), making clear documentation critical for future maintainers.

**Blocked by:** 01 (ensures consistent JSDoc style across all services)

**Status:** completed (PR #250)

## Modules

- `src/services/background-import-service.ts` — `BackgroundImportService` class
- `src/utils/settings-loader.ts` — exported pure functions: `loadAndNormalizeSettings`, `migrateSettings`, `dedupeAndNormalizeFeedItems`

## Acceptance criteria

- [ ] All exported class methods have JSDoc with description, `@param` entries, `@returns`, and `@throws` as applicable
- [ ] All exported functions in settings-loader have JSDoc with thorough descriptions of parameters, return values, and error conditions
- [ ] JSDoc follows the style and conventions established in Ticket 01
- [ ] Error behavior is documented (which errors throw, under what conditions)
- [ ] `npm run build` succeeds with zero type errors
- [ ] All service unit tests pass (`test_files/unit/services/background-import-service.test.ts`, `utils/settings-loader.test.ts`)
- [ ] Code is committed with message: `docs: add JSDoc to background-import and settings-loader`
