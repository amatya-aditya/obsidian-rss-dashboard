# 03: Standardize error handling across services

**Parent:** #249

**What to build:** All five service modules follow a consistent error-handling strategy: service methods throw on recoverable errors (bad input, network timeouts, validation failures); callers decide whether to show a user-facing Notice, retry, or handle silently. For invariant violations (state corruption, missing dependencies), services log an error and throw.

**Blocked by:** 01, 02 (to understand current error patterns while documenting, and ensure consistency with JSDoc `@throws` entries)

**Status:** ready-for-agent

## Strategy

**Recoverable errors** (caller's choice on UX):
- Invalid input parameters
- Network timeouts or fetch failures
- Feed parse errors
- File I/O failures during import/export

Action: Throw the error. Log a warning if helpful for debugging. Let the caller (usually main.ts) decide whether to show a Notice, retry, or fail gracefully.

**Invariant violations** (log + throw):
- Settings object is null/undefined when method expects it to exist
- Folder service is called before initialization
- Data structure is corrupted or missing required fields
- Internal state machine is in an impossible state

Action: Log the error with context. Throw the error. This signals a bug in the code, not a user action.

**Silent failures** (avoid):
- Don't silently fail when a user action can't complete
- Don't ignore errors in background operations without logging
- Every error path should either throw, log, or notify the user

## Modules to Review & Standardize

- `src/services/backup-service.ts`
- `src/services/folder-service.ts`
- `src/services/import-export-service.ts`
- `src/services/background-import-service.ts`
- `src/utils/settings-loader.ts`

## Acceptance criteria

- [ ] All service methods follow the strategy above: throw on recoverable errors, log + throw on invariants
- [ ] No silent failures or unhandled errors in service methods
- [ ] JSDoc `@throws` entries (added in Tickets 01–02) accurately reflect which errors each method may throw
- [ ] Error messages are descriptive and include context (e.g., "Failed to import feed 'Tech News': timeout after 30s")
- [ ] Obsidian `Notice` objects are NOT shown from service methods; responsibility to notify users belongs to main.ts or views (services are infrastructure)
- [ ] All 896+ unit tests pass (`npm run test:unit`)
- [ ] `npm run build` succeeds
- [ ] Code is committed with message: `refactor: standardize error handling across service modules`
