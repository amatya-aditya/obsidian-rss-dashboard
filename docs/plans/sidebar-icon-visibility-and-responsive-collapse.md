# Plan: Sidebar Icon Visibility & Responsive Hamburger Collapse

**Status:** Draft  
**Date:** 2026-03-20  
**Owner:** RSS Dashboard Plugin

## TL;DR

Four coordinated features:

1. **Feature 1 — Icon Visibility Settings**: Per-icon visibility toggles + master kill-switch in Settings → Display → Sidebar Settings.
2. **Feature 1.5 — Custom Icon Reordering**: Drag-to-reorder or up/down buttons in settings; persist custom order; collapse order dynamically follows custom order.
3. **Features 2 & 3 — Progressive Collapse**: A single responsive mechanism where `ResizeObserver` drives icons into a hamburger dropdown one-by-one (right-to-left in custom order) as sidebar width shrinks below per-icon hardcoded thresholds.
4. **Toolbar Restructure**: Toolbar unified and renders in custom order instead of fixed order.

Existing **200px minimum floor** is unchanged.

**Phase 0 precedes all implementation:** Tests for icon registry, collapse logic, and settings migration are written first and must all pass before Phase 1 begins.

---

## Phase 0 — Tests First (TDD)

*Write these tests BEFORE implementing the corresponding code. All tests must be green before starting Phase 1.*

### Test File 1: `test_files/unit/sidebar-icon-registry.test.ts`

Tests the pure data and functions in `src/utils/sidebar-icon-registry.ts`.

**Registry shape:**
- All 9 expected IDs present: `dashboard`, `discover`, `addFeed`, `manageFeeds`, `search`, `addFolder`, `sort`, `collapseAll`, `settings`
- Every entry has required fields: `id`, `label`, `lucideIcon`, `settingKey`, and either `collapseThreshold` or `neverCollapses: true`
- No duplicate IDs in the array

**`getIconById()`:**
- Returns correct config for each valid ID
- Returns `undefined` for unknown ID
- Returns `undefined` for empty string

**`SIDEBAR_ICON_IDS`:**
- Contains all 9 IDs, no duplicates

**Collapse thresholds:**
- `dashboard` and `discover` have `neverCollapses: true`
- Threshold values descend: `settings=360`, `collapseAll=320`, `sort=300`, `addFolder=280`, `search=260`, `manageFeeds=240`, `addFeed=220`
- No inversions (each is lower than previous — asserts collapse order)

**`settingKey` pattern:**
- Each collapsible icon's `settingKey` matches `hideIcon{PascalCaseId}` exactly

---

### Test File 2: `test_files/unit/sidebar-collapse-logic.test.ts`

Tests the collapse decision logic as a **pure function**:

```typescript
function computeCollapsedIds(
  width: number,
  iconOrder: string[],
  hiddenSettings: Partial<Record<string, boolean>>,
  hideToolbarEntirely: boolean
): Set<string>
```

**Normal collapse progression:**
- `width=400` → empty set
- `width=350` → `{ 'settings' }` (threshold 360)
- `width=310` → `{ 'settings', 'collapseAll' }`
- `width=270` → `{ 'settings', 'collapseAll', 'sort', 'addFolder' }`
- `width=210` → all 7 collapsible icons in set

**Never-collapse icons:**
- `dashboard` and `discover` never appear in the set regardless of width

**Settings-hidden icons skipped from collapsed set:**
- `hideIconSort=true` + `width=290` → `sort` absent from set
- `width=100` with hide flag → hidden icon still absent

**Master toggle short-circuit:**
- `hideToolbarEntirely=true` → returns empty set

**Edge cases:**
- `iconOrder` contains unknown ID → safely skipped
- `iconOrder` is empty → returns empty set
- `width=0` → all 7 collapsible icons in set

---

### Test File 3: `test_files/unit/sidebar-settings-migration.test.ts`

Tests new-field migration in `migrateLegacySettings()`.

**New boolean fields:**
- All 9 hide-flag fields missing → after migration all present as `false`
- Some fields already present → existing values preserved, missing ones default to `false`
- `hideIconSettings: true` present → preserved as `true`

**`iconOrder` field:**
- Missing → after migration equals default array of all 9 IDs in canonical order
- Present with custom order → unchanged after migration
- Final array has exactly 9 entries

**Edge cases:**
- Completely empty settings object → all 10 fields initialized
- `iconOrder` present but missing `settings` ID → preserved as-is (registry handles gracefully at render time)

---

### Execution

All three test files:
- `import { describe, it, expect } from "vitest"` — no Obsidian stubs needed
- No `vi.mock()` (pure function logic only)
- Run with: `npm run test:unit`

**Gate:** All tests must be all-green before Phase 1 implementation starts.

---

## Phase 1 — Icon Registry & Settings Infrastructure

_No UI changes yet — data model and settings foundation only._

### Step 1: Define Icon Config Type

In [src/types/types.ts](src/types/types.ts), define:

```typescript
export interface SidebarIconConfig {
  id: string;
  label: string;
  lucideIcon: IconName;
  settingKey: keyof DisplaySettings;
  collapseThreshold?: number;
  neverCollapses?: boolean;
}
```

### Step 2: Create Icon Registry & Factory

Create new file `src/utils/sidebar-icon-registry.ts`:

- Export `SIDEBAR_ICONS: SidebarIconConfig[]` with all 8 icons in new visual order
- Export `createToolbarButton(icon: SidebarIconConfig, onClick: () => void, onKeydown?: (e: KeyboardEvent) => void): HTMLElement` factory
  - Must follow design spec `clickable-icon` pattern:
    - `container.createDiv({ cls: "clickable-icon", attr: { role: "button", tabindex: "0", "aria-label": icon.label } })`
    - Call `setIcon(el, icon.lucideIcon)` (not innerHTML)
    - Attach `keydown` handler for `Enter` and `Space` (prevent default + fire action) for 1:1 keyboard parity

### Step 3: Add New Settings Fields

In [src/types/types.ts](src/types/types.ts), add to `DisplaySettings` interface:

```typescript
// Per-icon visibility (all default false)
hideIconDashboard: boolean;
hideIconDiscover: boolean;
hideIconAddFeed: boolean;
hideIconManageFeeds: boolean;
hideIconSearch: boolean;
hideIconAddFolder: boolean;
hideIconSort: boolean;
hideIconCollapseAll: boolean;

// Master control
hideToolbarEntirely: boolean;
```

Add to `DEFAULT_SETTINGS`:

```typescript
display: {
  // ... existing fields ...
  hideIconDashboard: false,
  hideIconDiscover: false,
  hideIconAddFeed: false,
  hideIconManageFeeds: false,
  hideIconSearch: false,
  hideIconAddFolder: false,
  hideIconSort: false,
  hideIconCollapseAll: false,
  hideToolbarEntirely: false,
}
```

### Step 4: Update Settings Migration

In [main.ts](main.ts), update `migrateLegacySettings()` to initialize all 9 new fields with their defaults.

---

## Phase 2 — Toolbar Restructure & Settings-Based Hiding

_Depends on Phase 1. Reorders and unifies the toolbar; applies visibility from settings._

### Step 5: Refactor Header Rendering

In [src/components/sidebar.ts](src/components/sidebar.ts), refactor `renderHeader()`:

**Visual order** (left → right):  
Dashboard, Discover | Add Feed, Manage Feeds, Search, Add Folder, Sort, Collapse All

**DOM restructure:**

- Merge the three current containers (`rss-dashboard-nav-container`, `rss-dashboard-header-manage-container`, `rss-dashboard-sidebar-toolbar`) into a unified icon row
- Loop through `SIDEBAR_ICONS` registry
- Use `createToolbarButton()` factory for all icon creation (not manual icon rendering)
- **Store button element references as class properties** on the `Sidebar` class (needed for Phase 4 collapse logic):
  - `private dashboardBtnEl: HTMLElement | null = null;`
  - `private discoverBtnEl: HTMLElement | null = null;`
  - etc. for each of the 8 icons

### Step 6: Apply Settings-Based Visibility

In `renderHeader()`:

```typescript
for (const icon of SIDEBAR_ICONS) {
  if (this.settings.display.hideToolbarEntirely) {
    // Skip rendering all icons
    continue;
  }

  const hideKey = icon.settingKey as keyof DisplaySettings;
  if (this.settings.display[hideKey]) {
    // Skip this icon
    continue;
  }

  // Render the button
  const btn = createToolbarButton(icon, () => {
    // action for this icon
  });

  // Store reference
  if (icon.id === "dashboard") this.dashboardBtnEl = btn;
  // ... etc
}
```

---

## Phase 3 — Settings UI

_Depends on Phase 1. Parallel with Phase 2._

### Step 7: Add Icon Visibility Subsection

In [src/settings/settings-tab.ts](src/settings/settings-tab.ts), in the Display Tab's Sidebar Settings area, add:

```typescript
// Icon Visibility heading
new Setting(containerEl).setName("Icon Visibility").setHeading();

// Store references to individual toggle Settings so master toggle can disable them
const iconToggleSettings: Setting[] = [];

// Master toggle: "Hide toolbar entirely"
new Setting(containerEl)
  .setName("Hide toolbar entirely")
  .setDesc("Hide all icons in the sidebar header")
  .addToggle((toggle) => {
    toggle
      .setValue(this.plugin.settings.display.hideToolbarEntirely)
      .onChange(async (value) => {
        this.plugin.settings.display.hideToolbarEntirely = value;
        await this.plugin.saveSettings();

        // Disable/enable individual toggles using Obsidian API
        iconToggleSettings.forEach((setting) => {
          setting.setDisabled(value);
        });

        // Re-render the sidebar to show/hide icons
        view.sidebar.render();
      });
  });

// Loop over SIDEBAR_ICONS registry — one toggle per icon
for (const icon of SIDEBAR_ICONS) {
  const hideKey =
    `hideIcon${icon.id.charAt(0).toUpperCase() + icon.id.slice(1)}` as keyof DisplaySettings;

  const setting = new Setting(containerEl)
    .setName(`Show ${icon.label}`)
    .setDesc(`Toggle visibility of the ${icon.label} icon`)
    .setDisabled(this.plugin.settings.display.hideToolbarEntirely)
    .addToggle((toggle) => {
      toggle
        .setValue(!this.plugin.settings.display[hideKey])
        .onChange(async (value) => {
          this.plugin.settings.display[hideKey] = !value;
          await this.plugin.saveSettings();
          view.sidebar.render();
        });
    });

  iconToggleSettings.push(setting);
}
```

**Key pattern:** Use Obsidian's `Setting#setDisabled()` API (not CSS workarounds) to disable the individual toggles when the master toggle is on. This follows the settings reference patterns.

### Step 8: Apply Pattern

After any icon visibility change:

- `await this.plugin.saveSettings()`
- `view.sidebar.render()`

(Existing pattern)

---

## Phase 4 — Progressive Collapse (Hamburger)

_Depends on Phase 2._

### Step 9: Define Collapse Thresholds

In `src/utils/sidebar-icon-registry.ts`, add collapse threshold constants:

| Icon (right-to-left collapse order) | Collapse below (px) | Notes                              |
| ----------------------------------- | ------------------- | ---------------------------------- |
| Collapse All                        | 320                 | First to collapse as width shrinks |
| Sort                                | 300                 |                                    |
| Add Folder                          | 280                 |                                    |
| Search                              | 260                 |                                    |
| Manage Feeds                        | 240                 |                                    |
| Add Feed                            | 220                 | Last to collapse before floor      |
| Dashboard / Discover                | never               | Primary nav, never collapses       |

Update `SidebarIconConfig` array entries with `collapseThreshold` values.

### Step 10: Add Hamburger Button

In `renderHeader()`, after rendering the Discover button, add a hamburger button:

```typescript
const hamburgerBtn = createToolbarButton(
  {
    id: "hamburger",
    label: "More actions",
    lucideIcon: "menu",
    settingKey: "hideToolbarEntirely", // placeholder, not used for this button
  },
  () => {
    // Toggle popover (step 13)
    this.toggleHamburgerPopover();
  },
);
hamburgerBtn.style.display = "none"; // Hidden by default
this.hamburgerBtnEl = hamburgerBtn;
```

The hamburger button itself must also follow the `clickable-icon` pattern (created by the factory function).

### Step 11: Implement Responsive Collapse Logic

Add method to `Sidebar` class:

```typescript
private applyResponsiveCollapse(width: number): void {
  if (this.settings.display.hideToolbarEntirely) {
    // Short-circuit: hide everything including hamburger
    this.hamburgerBtnEl!.style.display = 'none';
    return;
  }

  const collapsedIcons: SidebarIconConfig[] = [];

  for (const icon of SIDEBAR_ICONS) {
    if (icon.neverCollapses || !icon.collapseThreshold) {
      continue;  // Dashboard, Discover never collapse
    }

    const hideKey = icon.settingKey as keyof DisplaySettings;
    if (this.settings.display[hideKey]) {
      continue;  // Skip if user has hidden this icon
    }

    if (width < icon.collapseThreshold) {
      collapsedIcons.push(icon);
      // Hide the button from header (if we have element reference)
      const btnRef = this[`${icon.id}BtnEl` as keyof this] as HTMLElement | null;
      if (btnRef) btnRef.style.display = 'none';
    } else {
      // Restore to header
      const btnRef = this[`${icon.id}BtnEl` as keyof this] as HTMLElement | null;
      if (btnRef) btnRef.style.display = '';
    }
  }

  // Show/hide hamburger
  this.hamburgerBtnEl!.style.display = collapsedIcons.length > 0 ? '' : 'none';
  this.collapsedIconsSet = new Set(collapsedIcons.map(i => i.id));
}
```

Add class properties:

```typescript
private hamburgerBtnEl: HTMLElement | null = null;
private collapsedIconsSet: Set<string> = new Set();
private resizeObserver: ResizeObserver | null = null;
```

### Step 12: Build Hamburger Popover

```typescript
private toggleHamburgerPopover(): void {
  if (this.hamburgerPopoverEl?.style.display === 'block') {
    this.hamburgerPopoverEl.style.display = 'none';
    return;
  }

  // Create or show popover
  if (!this.hamburgerPopoverEl) {
    this.hamburgerPopoverEl = this.container.createDiv({
      cls: 'rss-hamburger-popover'
    });

    for (const icon of SIDEBAR_ICONS) {
      if (!this.collapsedIconsSet.has(icon.id)) {
        continue;  // Only show collapsed icons
      }

      const row = this.hamburgerPopoverEl.createDiv({
        cls: 'rss-hamburger-popover-row'
      });

      // Use clickable-icon pattern for each row
      const iconEl = row.createDiv({
        cls: 'clickable-icon',
        attr: {
          role: 'button',
          tabindex: '0',
          'aria-label': icon.label
        }
      });
      setIcon(iconEl, icon.lucideIcon);

      const label = row.createSpan({
        cls: 'rss-hamburger-popover-label',
        text: icon.label
      });

      // Fire the original button's action
      const onClick = () => {
        this.fireIconAction(icon.id);
        this.hamburgerPopoverEl!.style.display = 'none';
      };

      iconEl.addEventListener('click', onClick);
      iconEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      });
      row.addEventListener('click', onClick);
    }
  }

  this.hamburgerPopoverEl.style.display = 'block';
}

private fireIconAction(iconId: string): void {
  // Dispatch the action for this icon (SearchButtons expand dock, etc.)
  // Implementation depends on how each icon's action is currently wired
}
```

Add click-outside listener:

```typescript
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (
    !target.closest(".rss-hamburger-popover") &&
    !target.closest(".rss-hamburger-button")
  ) {
    this.hamburgerPopoverEl?.style.display = "none";
  }
});
```

### Step 13: Attach ResizeObserver

In `render()` method:

```typescript
public render(parentEl: HTMLElement = this.container): void {
  this.container.empty();
  this.renderHeader();
  // ... rest of render ...

  // Set up ResizeObserver for responsive collapse
  if (!this.resizeObserver) {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        this.applyResponsiveCollapse(width);
      }
    });
  }
  this.resizeObserver.observe(this.container);

  // Initial call with saved width
  const initialWidth = this.settings.sidebarWidth || 280;
  this.applyResponsiveCollapse(initialWidth);
}
```

### Step 14: Clean Up On Destroy

Update `destroy()`:

```typescript
public destroy(): void {
  if (this.resizeObserver) {
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }
}
```

---

## CSS Updates

Update [src/styles/sidebar.css](src/styles/sidebar.css):

### Hamburger Button

```css
.rss-hamburger-button {
  /* clickable-icon sizing */
  --icon-size: 20px;
  display: none; /* hidden by default */
}

.rss-hamburger-button svg {
  width: var(--icon-size) !important;
  height: var(--icon-size) !important;
  display: block !important;
  visibility: visible !important;
}
```

### Hamburger Popover

```css
.rss-hamburger-popover {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  padding: 8px 0;
  display: none;
  z-index: 1000;
  min-width: 160px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.rss-hamburger-popover-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}

.rss-hamburger-popover-row:hover {
  background-color: var(--background-modifier-hover);
}

.rss-hamburger-popover-row .clickable-icon {
  --icon-size: 18px;
  flex-shrink: 0;
}

.rss-hamburger-popover-row .clickable-icon svg {
  width: var(--icon-size) !important;
  height: var(--icon-size) !important;
  display: block !important;
  visibility: visible !important;
}

.rss-hamburger-popover-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-normal);
  white-space: nowrap;
}
```

---

## Spec Compliance Notes

### Design Spec Alignment

- **Icon Visibility Standards (§Icon Rendering Standards)**: All interactive icons, including hamburger button and popover rows, are rendered as `clickable-icon` divs with `role="button"`, `tabindex="0"`, `aria-label`, and keyboard handlers for `Enter` and `Space`.
- **Android WebView Compatibility**: SVG elements in sidebar and popover icons use `width`, `height`, `display: block`, and `visibility: visible` with `!important` to prevent rendering drops.
- **Keyboard Interactivity**: 1:1 parity between click and keyboard `Enter`/`Space` across all interactive elements.

### Obsidian Settings Reference Alignment

- Icons follow Obsidian's `PluginSettingTab` pattern.
- Toggle controls in Icon Visibility subsection use `Setting#setDisabled()` (not CSS workarounds) to manage display state when master toggle is on.
- Settings persist using standard `loadData()`/`saveData()` pattern.

---

## Verification Checklist

- [ ] Each of the 8 icon toggles in Settings hides/shows that icon on save + re-render
- [ ] Master `hideToolbarEntirely` toggle disables all 8 individual `Setting` rows immediately (Obsidian API)
- [ ] Resize sidebar to 310px → Collapse All moves to hamburger; hamburger visible
- [ ] Resize to 250px → 4 icons in hamburger; Add Feed + Manage Feeds still in header
- [ ] Resize to 210px → 6 in hamburger; only Dashboard + Discover remain
- [ ] Floor holds at **200px**; sidebar cannot shrink below
- [ ] Settings-hidden icons absent from hamburger
- [ ] All header icons keyboard-accessible (Tab + Enter/Space); hamburger and dropdown rows also keyboard-accessible
- [ ] Android WebView: no missing icon renders (SVG `!important` rules present)
- [ ] `destroy()` disconnects ResizeObserver; no memory leak on re-mount
- [ ] Search icon triggered from hamburger expands dock correctly

---

## Verification — Visual Order

Desktop header should display (left → right):

```
[Dashboard] [Discover] | [Add Feed] [Manage Feeds] [Search] [Add Folder] [Sort] [Collapse All] [≡ hamburger when < 220px]
```

---

## Related Files

| File                                                         | Changes                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `test_files/unit/sidebar-icon-registry.test.ts`              | **NEW**: Registry shape, `getIconById()`, threshold ordering, `settingKey` patterns                  |
| `test_files/unit/sidebar-collapse-logic.test.ts`             | **NEW**: `computeCollapsedIds()` pure function — all width/hide/order scenarios                     |
| `test_files/unit/sidebar-settings-migration.test.ts`         | **NEW**: New fields get correct defaults; custom order preserved                                    |
| [src/types/types.ts](src/types/types.ts)                     | Add `SidebarIconConfig` type; 10 new `DisplaySettings` fields (9 hide flags + 1 order); update defaults |
| `src/utils/sidebar-icon-registry.ts`                         | **NEW**: `SIDEBAR_ICONS` array with 9 icons; `getIconById()`; `createToolbarButton()` factory; thresholds |
| [src/components/sidebar.ts](src/components/sidebar.ts)       | Refactor `renderHeader()` to use custom order; add `applyResponsiveCollapse()`; ResizeObserver; `destroy()` |
| [src/settings/settings-tab.ts](src/settings/settings-tab.ts) | Add Icon Visibility subsection + Icon Order subsection (reordering UI); use `Setting#setDisabled()` |
| [main.ts](main.ts)                                           | Update `migrateLegacySettings()` for 10 new fields                                                  |
| [src/styles/sidebar.css](src/styles/sidebar.css)             | Hamburger button; popover; icon order list; SVG `!important` rules for Android                     |

---

## Decisions & Rationale

| Decision                                      | Rationale                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Hardcoded collapse thresholds**             | Per-user threshold config adds UI clutter; fixed thresholds are predictable and tunable only via code changes (future PR) |
| **Right-to-left collapse order**              | User's most frequent actions (Search, Add Folder, Sort) stay visible longer as sidebar shrinks                            |
| **Dashboard + Discover never collapse**       | Primary navigation must always be accessible; hiding them is opt-in via F1 toggles                                        |
| **Individual booleans for icon visibility**   | Scales better than a serialized array; per-setting migration paths; future-proof registry pattern                         |
| **`Setting#setDisabled()` for master toggle** | Follows Obsidian API best practices; avoids CSS precedence issues; clear intent in code                                   |
| **ResizeObserver over fixed breakpoints**     | Reacts to actual sidebar width, not viewport; works on mobile and desktop uniformly                                       |

---

## Further Considerations

1. **Toolbar Reorder is Visible UX Change**: Update [CHANGELOG.md](CHANGELOG.md) and notify users in release notes. The new order is optimized for frequency of use.

2. **Hamburger + Search Dock Interaction**: The Search button opens a side dock when clicked. When triggered from the hamburger dropdown, verify the dock opens correctly. The action is the same, but firing it from a different source DOM element could cause issues if any code relies on `event.target` identity.

3. **Short-Circuiting on `hideToolbarEntirely`**: If the master toggle is on, `applyResponsiveCollapse()` must always hide the hamburger as well. This is handled in the implementation above.

4. **Mobile Modal Headers**: Hamburger button placement must consider safe-area insets on mobile (per design spec). Add platform-scoped overrides in `src/styles/modals.css` if hamburger appears in mobile modals.

---

## Implementation Order Recommendation

0. **Phase 0** — Write all 3 test files (they will fail until implementation)
1. **Phase 1** — Settings infrastructure (makes migration tests pass)
2. **Phase 2** — Toolbar restructure (makes registry tests pass)
3. **Phase 3** — Settings UI (parallel with Phase 2)
4. **Phase 4** — Hamburger collapse (makes collapse-logic tests pass)

Each phase should have its tests passing before starting the next phase.
