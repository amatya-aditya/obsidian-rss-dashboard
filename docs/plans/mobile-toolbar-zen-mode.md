# Mobile Toolbar Rework + Zen Mode (Plan)

## Objective

Improve mobile usability of article actions by replacing low-clarity icon circles with clearer action buttons, adding display-mode controls in Settings, and providing a quick Zen-mode toggle to temporarily hide all per-article action buttons.

## UX Goals

- Make actions obvious and thumb-friendly (`44px+` tap targets).
- Reduce accidental taps in dense list layouts.
- Preserve list readability while keeping quick actions accessible.
- Let users choose between compact and explicit action layouts.

## Proposed Mobile Settings

Location: `Settings > Display > Mobile`

1. `Show toolbar in card view` (toggle)
2. `Show toolbar in list view` (toggle)
3. `List toolbar style` (dropdown)
   - `Left grid (2x2)` (current concept, refined as distinct buttons)
   - `Bottom row` (side-by-side footer actions per list item)
   - `Minimal (Read/Unread only)` (single quick action on left side)

## Zen Mode Quick Toggle

Add an on-screen mobile control in the top controls area:

- `Zen Off`: actions are shown according to settings.
- `Zen On`: hide all per-article action buttons in both card and list view.

Behavior rules:

- Zen mode is a temporary runtime override.
- Zen mode does not mutate saved settings values.
- Turning Zen off restores the exact user-selected toolbar settings/layout.
- Zen state persists between sessions.
- Zen toggle is not shown when both card and list toolbars are disabled in settings.

Effective render rule:

```text
effectiveShowToolbar = settingsShowToolbar && !zenMode
showZenToggle = showCardToolbarSetting || showListToolbarSetting
```

## Layout Direction by View

### Card View

- Use distinct rounded/pill action buttons instead of dark circular icon-only chips.
- Keep action grouping compact but clearly separated from article content.

### List View

- `Left grid (2x2)`: best for action density and quick multi-action workflows.
- `Bottom row`: best for scan-first list aesthetics.
- `Minimal`: best for rapid unread triage workflows.

## Recommended V1 Scope

- Implement all 3 mobile settings above.
- Implement the Zen-mode quick toggle (mobile only).
- Apply Zen override consistently in card and list rendering.
- Keep advanced customization (custom single action, icon+label mode switching) for later iteration.

## Decisions

1. Zen state persists between sessions.
2. Zen toggle is not shown when both card and list toolbars are disabled in settings.
3. In `Minimal` mode, the single quick action is fixed to `Read/Unread`.

## Acceptance Criteria

- Users can independently show/hide toolbars for card and list views on mobile.
- Users can select one of the 3 list toolbar styles.
- In `Minimal` mode, the only quick action shown is `Read/Unread`.
- Zen toggle immediately hides/shows actions without altering saved settings.
- Exiting Zen mode restores the configured toolbar mode exactly.
- Zen mode state persists across app restarts.
- Zen toggle is hidden when both card and list toolbar settings are disabled.
- Mobile controls remain tappable and visually clear at small widths.
