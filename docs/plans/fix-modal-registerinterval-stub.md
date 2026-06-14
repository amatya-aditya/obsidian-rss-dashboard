# Fix MobileNavigationModal interval lifecycle

## Goal
Make the failing `MobileNavigationModal` unit tests pass while keeping the modal implementation compatible with Obsidian's `Modal` API.

## Diagnosis
The failures occurred because `MobileNavigationModal.onOpen()` called `this.registerInterval(...)` at `src/modals/mobile-navigation-modal.ts:126`. Obsidian's `Modal` type does not expose `registerInterval`; that method belongs to `Plugin`/`Component`-style APIs. Calling it on a modal is unsafe and can fail in tests or production.

## Implementation plan
1. Replace the modal's `registerInterval` call with a private interval id stored on `MobileNavigationModal`.
2. Clear that interval from `onClose()` so repeated open/close cycles do not leak timers.
3. Run the focused unit test:
   - `npm run test:unit -- test_files/unit/modals/mobile-navigation-modal.test.ts`
4. Run the broader unit suite:
   - `npm run test:unit`
5. Run lint/type validation:
   - `npm run lint`
   - `npx tsc -noEmit -skipLibCheck`

## Expected result
`MobileNavigationModal.open()` updates refresh state every 100ms while open, and `onClose()` clears the interval, allowing callback wrapping and resize tests to execute without `TypeError: this.registerInterval is not a function`.
