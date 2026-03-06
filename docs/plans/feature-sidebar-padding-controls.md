## Export + Implement: Sidebar Left/Right Padding Settings

### Summary
Create a new plan document in `docs/plans`, then implement a Display-tab Sidebar setting section with two pixel controls:
1. `Left padding`
2. `Right padding`

Both default to `2px`, use slider-adjust UI, and apply to desktop sidebar and mobile navigation sidebar modal rows.

### Plan Export (first action)
1. Create new file: `docs/plans/feature-sidebar-padding-controls.md`.
2. Export this full implementation plan into that file.
3. Keep style consistent with existing `docs/plans/feature-add-show-sidebar-scrollbar.md`.

### Public API / Interface Changes
1. Update `DisplaySettings` in `src/types/types.ts`:
- Add `sidebarItemPaddingLeft: number`
- Add `sidebarItemPaddingRight: number`

2. Update `DEFAULT_SETTINGS.display` in `src/types/types.ts`:
- `sidebarItemPaddingLeft: 2`
- `sidebarItemPaddingRight: 2`

### Implementation Details

1. Display settings UI
- File: `src/settings/settings-tab.ts`
- In `createDisplaySettings(...)`, under the Sidebar area, add a heading:
  - `Sidebar padding`
- Add two controls with slider + number input sync (matching existing sidebar spacing/indentation pattern):
  - `Left padding`
  - `Right padding`
- Limits:
  - min `0`, max `40`, step `1`
- Behavior on change:
  - update setting value
  - `await this.plugin.saveSettings()`
  - rerender active sidebar (`view.sidebar.render()`) when present
- Apply class `rss-dashboard-settings-two-row` for layout parity.

2. Runtime CSS variable wiring
- File: `src/components/sidebar.ts`
- In `render()`, set variables on `this.container`:
  - `--sidebar-item-padding-left`
  - `--sidebar-item-padding-right`
- Use fallbacks `2` when values are missing.

3. Desktop sidebar CSS
- File: `src/styles/sidebar.css`
- Add defaults on `.rss-dashboard-sidebar`:
  - `--sidebar-item-padding-left: 2px;`
  - `--sidebar-item-padding-right: 2px;`
- Apply to:
  - `.rss-dashboard-feed-folder-header`
  - `.rss-dashboard-feed`
  - `.rss-dashboard-all-feeds-button`
- Use:
  - `padding-left: var(--sidebar-item-padding-left);`
  - `padding-right: var(--sidebar-item-padding-right);`
- Keep existing row spacing/indentation mechanics intact.

4. Mobile modal parity
- File: `src/styles/modals.css`
- In `.modal.rss-mobile-navigation-modal` row overrides, replace hardcoded horizontal padding with:
  - `var(--sidebar-item-padding-left)`
  - `var(--sidebar-item-padding-right)`
- Cover:
  - `.rss-dashboard-feed`
  - `.rss-dashboard-feed-folder-header`
  - `.rss-dashboard-all-feeds-button`
- Preserve current vertical padding behavior.

### Compatibility / Migration
- No dedicated migration function changes needed.
- Existing `loadSettings()` merge with `DEFAULT_SETTINGS.display` will populate new fields for older configs.

### Test Cases and Scenarios

1. Plan export
- `docs/plans/feature-sidebar-padding-controls.md` exists and contains this complete plan.

2. Default behavior
- New install shows both controls at `2`.
- Sidebar rows render with `2px` left/right padding.

3. Existing users
- No errors with older settings files lacking new fields.
- Defaults are applied automatically.

4. Control sync
- Slider updates number input.
- Number input updates slider.
- Values clamp to `0..40`.

5. Live update
- Changing either value updates visible sidebar immediately after rerender.

6. Desktop coverage
- All feeds row, folder headers, and feed rows reflect left/right values.

7. Mobile coverage
- Mobile navigation modal rows reflect same left/right values.

8. Regression checks
- Sidebar row spacing and indentation still work.
- Hover/active states, unread badges, and row min-height behavior remain correct.

### Assumptions and Defaults
- Range is `0..40px`.
- Scope is desktop + mobile navigation sidebar.
- Defaults are `2px` for both left and right.
- UX pattern is slider + numeric input, consistent with existing sidebar spacing controls.
