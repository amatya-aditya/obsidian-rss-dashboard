# RSS Dashboard - Bug Fix Plans

## Bug: Manage Feeds Modal Not Visible on Mobile/Tablet

### Description

On mobile and tablet views (screens <= 1200px width), the "Manage Feeds" modal does not appear when the button is pressed. The button visually indicates it has been pressed (active state), but the modal content is not visible to the user.

### Root Cause Analysis

#### 1. CSS Specificity Issue

The `FeedManagerModal` class applies these CSS classes to the modal element:

```typescript
// src/modals/feed-manager-modal.ts:1076
this.modalEl.className += " rss-dashboard-modal rss-dashboard-modal-container";
```

The `MobileNavigationModal` (which works correctly on mobile) uses:

```typescript
// src/modals/mobile-navigation-modal.ts:31
this.modalEl.addClass("rss-mobile-navigation-modal");
```

#### 2. Missing `.modal` Prefix in CSS Selectors

In `src/styles/responsive.css`, the working mobile modal has high-specificity selectors:

```css
/* Line 187-204 */
.modal.rss-mobile-navigation-modal,
.modal.rss-mobile-discover-filters-modal {
  height: calc(90vh - 20px) !important;
  position: fixed;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  /* ... more positioning rules */
}
```

In `src/styles/modals.css`, the FeedManagerModal responsive styles use lower specificity:

```css
/* Line 628-641 */
.rss-dashboard-modal-container {
  width: 100% !important;
  position: fixed !important;
  bottom: 0 !important;
  /* ... but missing .modal prefix */
}
```

#### 3. Obsidian's Default Modal Styles Override

Obsidian's core CSS applies default styles to `.modal` elements that can conflict with plugin styles. Without the `.modal` prefix in the selector, the plugin's CSS has lower specificity than Obsidian's native mobile modal handling, causing:

- Modal positioned off-screen or behind other elements
- Display properties being overridden
- Transform/positioning conflicts

### Comparison of Working vs Broken Modals

| Modal                      | CSS Class                           | Selector Pattern                           | Works on Mobile? |
| -------------------------- | ----------------------------------- | ------------------------------------------ | ---------------- |
| MobileNavigationModal      | `rss-mobile-navigation-modal`       | `.modal.rss-mobile-navigation-modal`       | Yes              |
| MobileDiscoverFiltersModal | `rss-mobile-discover-filters-modal` | `.modal.rss-mobile-discover-filters-modal` | Yes              |
| FeedManagerModal           | `rss-dashboard-modal-container`     | `.rss-dashboard-modal-container`           | No               |
| AddFeedModal               | `rss-dashboard-modal-container`     | `.rss-dashboard-modal-container`           | No               |
| EditFeedModal              | `rss-dashboard-modal-container`     | `.rss-dashboard-modal-container`           | No               |

### Suggested Fix

**Option A (Recommended): Add Mobile-Specific Modal Class**

Add a dedicated mobile class to `FeedManagerModal` and related modals, matching the pattern used by `MobileNavigationModal`. This approach:

- Maintains consistency with existing working modals
- Provides clear separation between desktop and mobile modal styling
- Avoids affecting desktop modal behavior

**Option B: Fix CSS Specificity**

Add `.modal` prefix to existing responsive CSS selectors in `modals.css` to match Obsidian's specificity requirements.

---

## Task List

### Phase 1: Preparation

- [ ] 1.1 Create a backup or note current behavior for testing
- [ ] 1.2 Document current CSS classes applied to FeedManagerModal

### Phase 2: Implement Fix (Option A - Recommended)

- [ ] 2.1 Modify `FeedManagerModal.onOpen()` to add mobile-specific class
  - File: `src/modals/feed-manager-modal.ts`
  - Add class `rss-mobile-feed-manager-modal` for screens <= 1200px
- [ ] 2.2 Add responsive CSS for new mobile modal class
  - File: `src/styles/modals.css` or `src/styles/responsive.css`
  - Add `.modal.rss-mobile-feed-manager-modal` selector with proper positioning
  - Include bottom-sheet style positioning (fixed, bottom: 0)
  - Set appropriate height, width, and z-index

- [ ] 2.3 Apply same fix to `AddFeedModal` class
  - File: `src/modals/feed-manager-modal.ts`
  - Add same mobile-specific class

- [ ] 2.4 Apply same fix to `EditFeedModal` class
  - File: `src/modals/feed-manager-modal.ts`
  - Add same mobile-specific class

### Phase 3: CSS Implementation Details

- [ ] 3.1 Add mobile modal base styles (<= 1200px breakpoint)

  ```css
  .modal.rss-mobile-feed-manager-modal {
    height: calc(90vh - 20px) !important;
    min-height: calc(90vh - 20px) !important;
    max-height: calc(90vh - 20px) !important;
    width: 100%;
    max-width: clamp(480px, 85vw, 900px);
    margin: 0 auto;
    border-radius: 16px 16px 0 0;
    position: fixed;
    bottom: 20px;
    left: 0;
    right: 0;
    top: auto;
    display: flex;
    flex-direction: column;
    z-index: 99999 !important;
  }
  ```

- [ ] 3.2 Add mobile modal content styles

  ```css
  .rss-mobile-feed-manager-modal .modal-content {
    padding: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  ```

- [ ] 3.3 Add small screen adjustments (<= 768px)

  ```css
  @media (max-width: 768px) {
    .modal.rss-mobile-feed-manager-modal {
      max-width: 100%;
      height: 90vh !important;
      bottom: 0;
    }
  }
  ```

- [ ] 3.4 Add very small screen adjustments (<= 400px)
  ```css
  @media (max-width: 400px) {
    .modal.rss-mobile-feed-manager-modal {
      height: 95vh !important;
      max-height: 95vh !important;
    }
  }
  ```

### Phase 4: Testing

- [ ] 4.1 Test on mobile width (<= 768px)
  - Open Manage Feeds modal
  - Verify modal appears from bottom
  - Verify close button works
  - Test scrolling within modal

- [ ] 4.2 Test on tablet width (768px - 1200px)
  - Open Manage Feeds modal
  - Verify modal positioning
  - Verify all interactive elements work

- [ ] 4.3 Test on desktop width (> 1200px)
  - Verify modal still works as before
  - Confirm no regression in desktop styling

- [ ] 4.4 Test Add Feed modal on mobile
- [ ] 4.5 Test Edit Feed modal on mobile
- [ ] 4.6 Test with different Obsidian themes
- [ ] 4.7 Test on actual mobile device (if available)

### Phase 5: Build & Deploy

- [ ] 5.1 Run build command
- [ ] 5.2 Run lint/typecheck if available
- [ ] 5.3 Test in development mode
- [ ] 5.4 Verify no console errors

---

## Alternative Approach (Option B)

If Option A is not preferred, use Option B:

### Phase B1: CSS Selector Fix

- [ ] B1.1 Update `modals.css` line 628 to use `.modal.rss-dashboard-modal-container`
- [ ] B1.2 Update all media query selectors to include `.modal` prefix
- [ ] B1.3 Test thoroughly for any unintended side effects

---

## Files to Modify

| File                               | Changes                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `src/modals/feed-manager-modal.ts` | Add mobile-specific class to `FeedManagerModal`, `AddFeedModal`, `EditFeedModal` |
| `src/styles/modals.css`            | Add mobile modal responsive CSS                                                  |
| `src/styles/responsive.css`        | (Optional) Add styles here instead of modals.css                                 |

---

## Notes

- The existing `MobileNavigationModal` pattern should be used as reference
- z-index must be high enough (99999) to appear above Obsidian's UI elements
- The `!important` flag is necessary to override Obsidian's core styles
- Border-radius on top corners (16px 16px 0 0) creates the "bottom sheet" appearance
