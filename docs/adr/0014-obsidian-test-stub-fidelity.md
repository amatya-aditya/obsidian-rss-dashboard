# ADR 0014: The Obsidian Test Stub Models Observed Obsidian Behavior

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-25

## Context and problem

RSS Dashboard's unit tests don't run inside Obsidian. They replace the
`obsidian` module with a hand-written stub (`test_files/stubs/obsidian.ts`) and
add Obsidian's DOM helpers (`createDiv`, `toggleClass`, and so on) through
`test_files/unit/test-dom-polyfills.ts`. A test is only as trustworthy as that
stub: wherever the stub behaves differently from real Obsidian, a bug can pass
its tests and still fail for users.

That already happened. A fix for
[#360](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/360)
passed its tests but failed in real Obsidian, because desktop Obsidian refuses
to remove any folder, even an empty one, unless the removal is recursive, and
the stub didn't. A follow-up audit
([#372](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/372))
found more divergences, several of which likely hide production bugs. For
example, real `requestUrl` throws on any HTTP status of 400 or above, while
tests fake 403 responses that real Obsidian can never return, so the proxy
retry for blocked pages has never been exercised.

Fixing the stub raises three questions that future contributors will meet
again: what the stub is allowed to be based on, which Obsidian it should
imitate, and what to do when a more faithful stub makes existing tests fail.

## Decision

1. **The stub models Obsidian's observed behavior.** Each behavior the stub
   imitates is recorded as an expectation in a contract test next to the stub
   (`test_files/stubs/obsidian.contract.test.ts`), with the Obsidian version it
   was observed on. The stub must pass that contract test.
2. **Obsidian's own source is never copied.** Obsidian is closed source.
   Contributors may read its shipped code to learn how it behaves, then write
   the stub independently to match. Code from MIT-licensed community projects,
   such as [obsidian-test-mocks](https://github.com/mnaoumov/obsidian-test-mocks),
   may be copied with an attribution header, but only once the contract test
   confirms it matches real Obsidian.
3. **The reference is the latest stable desktop release.** The version is
   pinned in a header comment in the stub and bumped deliberately. Where the
   plugin's minimum supported version behaves differently in a way production
   code must handle, the stub offers a switch for that one behavior only.
   Mobile-only behavior is modeled only after it has been verified on a device.
4. **When a more faithful stub breaks a test, fix the production code.** A
   newly failing test is treated as a real divergence the old stub was hiding.
   The stub is not weakened again to make it pass. If the underlying bug does
   not reproduce in real Obsidian, the contract expectation is wrong and is
   corrected, with a note explaining what was observed.

## Consequences

### Benefits

- Tests fail for the same reasons the plugin would fail in Obsidian, so bugs
  like #360's surface before manual testing instead of during it.
- The contract test documents Obsidian behaviors that `obsidian.d.ts` doesn't,
  such as which calls throw, and on which version each was confirmed.
- Divergences become findable. A drift check
  ([#253](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/253))
  can run the contract test, and typing the stub's exports as the real
  `obsidian.d.ts` ([#362](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/362))
  catches mistyped stub members at compile time. A member the stub lacks
  fails the test that needs it.

### Trade-offs

- Adding to the stub costs more: a new behavior needs a contract expectation
  confirmed in real Obsidian, not just a convenient fake.
- Making the stub faithful will break some tests that pass today, and each one
  has to be followed up in production code.
- Confirming behavior needs a real Obsidian install, which CI doesn't have. CI
  checks the recorded expectations; re-observing them is a manual step when the
  reference version is bumped.

### Existing users and data

- None directly. This is a development convention. Users benefit only through
  the production bugs it exposes and the fixes that follow.

## Considered options

### Option A — Keep approximating Obsidian by hand

The stub keeps growing as tests need it, shaped by what each test expects. This
costs the least per change, but it is how the current divergences built up, and
nothing detects new ones.

### Option B — Replace the stub with obsidian-test-mocks

The only comprehensive community mock package. It already models several
divergences #372 found, such as folders that can't be created twice and folders
that can't be removed without `recursive`. But it has a single maintainer, it
shipped three major versions in the month before this decision, and it still
returns responses of 400 and above from `requestUrl` instead of throwing, so it
would not catch #372's most important finding. Depending on it would make our
tests' correctness depend on its release churn.

### Option C — Port Obsidian's shipped code into the stub

The most faithful option, but Obsidian is proprietary and RSS Dashboard is
MIT-licensed. Copying its code, even minified, is a licensing risk the project
won't take.

### Option D — Contract-tested stub, observed behavior only, MIT borrowing allowed (chosen)

Keeps the stub under the project's control, makes each imitated behavior
explicit and dated, and still lets contributors reuse good MIT-licensed work
instead of re-deriving it.

## Historical precedent

- The [Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks)
  keeps a test file for its Obsidian mock (`tests/__mocks__/obsidian.test.ts`)
  that states how the mock's behavior relates to real Obsidian. The contract
  test here applies that idea to every behavior the stub imitates.

## Related

- [GitHub Issue #372](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/372)
  — stub audit and the production bugs it points to
- [GitHub Issue #360](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/360)
  — the fix that passed its tests but failed in Obsidian
- [GitHub Issue #362](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/362)
  — type-checking test files against the real API
- [GitHub Issue #253](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/253)
  — architecture drift guardrails
- [Plan: Obsidian test stub fidelity](../plans/372-stub-fidelity.md)
