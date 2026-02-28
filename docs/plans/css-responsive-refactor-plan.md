# CSS Responsive Refactor Plan

**Date:** 2026-02-28  
**Goal:** Consolidate all mobile/tablet responsive styling from `sidebar.css` into `responsive.css` for better maintainability and single-source breakpoint management.

---

## 1. Current State Analysis

### 1.1 In sidebar.css

#### Block 1: Lines 698-736 (38 lines)

```css
@media (max-width: 1200px) {
  .modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-toolbar {
    border-radius: 0;
    padding: 6px 0;
    margin: 0;
    width: 100%;
    border-top: 1px solid var(--background-modifier-border);
    border-bottom: none;
    border-left: none;
    border-right: none;
  }

  .modal.rss-mobile-navigation-modal .rss-dashboard-search-dock {
    border-top: 1px solid var(--background-modifier-border);
    padding: 8px 4px 6px;
  }

  .modal.rss-mobile-navigation-modal .rss-dashboard-drawer-actions {
    padding-right: 2px;
    padding-left: 4px;
  }

  .modal.rss-mobile-navigation-modal
    .rss-dashboard-bottom-drawer-content
    .rss-dashboard-sidebar-toolbar {
    margin: 0;
    border-left: none;
    border-right: none;
  }

  .rss-folder-name-modal {
    top: 44% !important;
    transform: translate(-50%, -44%) !important;
  }

  .rss-folder-name-modal-input {
    font-size: 16px;
  }
}
```

**Selectors targeted:**

- `.modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-toolbar`
- `.modal.rss-mobile-navigation-modal .rss-dashboard-search-dock`
- `.modal.rss-mobile-navigation-modal .rss-dashboard-drawer-actions`
- `.modal.rss-mobile-navigation-modal .rss-dashboard-bottom-drawer-content .rss-dashboard-sidebar-toolbar`
- `.rss-folder-name-modal`
- `.rss-folder-name-modal-input`

---

#### Block 2: Lines 825-878 - Three Device-Specific Media Queries

**Lines 825-846: Desktop (@media min-width: 1025px)**

```css
/* Desktop (>1024px) */
@media (min-width: 1025px) {
  .rss-dashboard-mobile-only {
    display: none !important;
  }
  .rss-dashboard-feed,
  .rss-dashboard-all-feeds-button {
    min-height: 28px;
    padding: 3px 8px 3px 20px;
  }
  .rss-dashboard-feed-folder-header {
    min-height: 28px;
    padding: 3px 10px;
  }
  .rss-dashboard-all-feeds-button {
    padding-left: 10px;
  }
  .rss-dashboard-header-icon-button {
    width: 36px;
    height: 36px;
  }
}
```

**Lines 848-862: Tablet (@media 768px-1024px)**

```css
/* Tablet (768px - 1024px) */
@media (min-width: 768px) and (max-width: 1024px) {
  .rss-dashboard-feed,
  .rss-dashboard-all-feeds-button {
    min-height: 36px;
    padding: 5px 8px 5px 32px;
  }
  .rss-dashboard-feed-folder-header {
    min-height: 36px;
    padding: 4px 10px;
  }
  .rss-dashboard-all-feeds-button {
    padding-left: 10px;
  }
}
```

**Lines 864-878: Mobile (@media max-width: 767px)**

```css
/* Mobile (<768px) */
@media (max-width: 767px) {
  .rss-dashboard-feed,
  .rss-dashboard-all-feeds-button {
    min-height: 36px;
    padding: 4px 8px 4px 20px;
  }
  .rss-dashboard-feed-folder-header {
    min-height: 36px;
    padding: 4px 10px;
  }
  .rss-dashboard-all-feeds-button {
    padding-left: 10px;
  }
}
```

---

### 1.2 In responsive.css

#### Block 1: Lines 89-430 - Extensive @media (max-width: 1200px)

This is a large block containing:

- **Lines 90-59:** General container/layout responsive styles
- **Lines 187-208:** Mobile navigation modal positioning/sizing
- **Lines 210-230:** Mobile discover filters modal and feed manager modal
- **Lines 232-240:** Modal content styling
- **Lines 242-264:** Modal close button positioning
- **Lines 266-276:** Sidebar display in mobile modal
- **Lines 278-287:** Discover sidebar in mobile modal
- **Lines 289-295:** Sidebar container in mobile modal
- **Lines 297-302:** Resize handle positioning

**Key selectors already in responsive.css:**

- `.modal.rss-mobile-navigation-modal`
- `.modal.rss-mobile-discover-filters-modal`
- `.modal.rss-mobile-feed-manager-modal`
- `.rss-mobile-navigation-modal .modal-content`
- `.modal.rss-mobile-navigation-modal .modal-close-button`
- `.modal.rss-mobile-navigation-modal .rss-dashboard-sidebar`
- `.modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-container`

#### Block 2: Lines 305-398 - Nested @media (max-width: 768px)

```css
@media (max-width: 768px) {
  .modal.rss-mobile-navigation-modal {
    width: 95vw !important;
    max-width: 95vw !important;
    border-radius: 0 !important;
    border: 1px solid var(--background-modifier-border) !important;
    border-left: none !important;
  }

  .modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-resize-handle {
    display: none !important;
  }

  /* Hide top-right close button for mobile navigation modal */
  .modal.rss-mobile-navigation-modal .modal-close-button {
    display: none !important;
  }

  /* Add notch safe-area padding for mobile navigation modal */
  .modal.rss-mobile-navigation-modal .rss-dashboard-header {
    padding-top: calc(10px + env(safe-area-inset-top, 0px));
  }

  /* Add safe-area padding to bottom drawer */
  .modal.rss-mobile-navigation-modal .rss-dashboard-bottom-drawer {
    padding-bottom: calc(2px + env(safe-area-inset-bottom, 0px));
  }

  /* Enlarge nav buttons for mobile */
  .modal.rss-mobile-navigation-modal .rss-dashboard-nav-button {
    font-size: 18px;
    padding: 12px 20px;
    min-height: 48px;
  }

  /* Enlarge feed items for mobile touch targets */
  .modal.rss-mobile-navigation-modal .rss-dashboard-feed {
    min-height: 44px;
    padding: 10px 10px 10px 35px;
  }

  .modal.rss-mobile-navigation-modal .rss-dashboard-feed-folder-header {
    min-height: 44px;
    padding: 10px;
  }

  /* Enable momentum scrolling on mobile */
  .modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-container {
    -webkit-overflow-scrolling: touch;
  }

  /* Drawer toggle button styling for mobile */
  .modal.rss-mobile-navigation-modal .rss-dashboard-drawer-toggle-button {
    min-height: 16px;
    font-size: 4px;
    padding: 8px 16px;
  }

  /* Header close button for mobile - match footer button styling */
  .modal.rss-mobile-navigation-modal .rss-dashboard-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .modal.rss-mobile-navigation-modal .rss-dashboard-nav-container {
    flex: 1;
    display: flex;
    align-items: center;
  }

  .modal.rss-mobile-navigation-modal .rss-dashboard-header-close-button {
    width: 36px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 8px;
    border: 1px solid var(--background-secondary);
    background: var(--background-secondary);
    color: #fff;
    margin-right: 2px;
  }

  .modal.rss-mobile-navigation-modal .rss-dashboard-header-close-button:hover {
    border-color: #9b59b6;
    background: #9b59b6;
    color: #fff;
  }
}
```

---

## 2. Code to Move

### 2.1 sidebar.css → responsive.css

| Source Location | Lines   | Description                                                                                                      | Destination                                                                 |
| --------------- | ------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| sidebar.css     | 698-736 | `@media (max-width: 1200px)` block with mobile nav modal toolbar, search dock, drawer actions, folder name modal | Merge into responsive.css `@media (max-width: 1200px)` block (lines 89-430) |
| sidebar.css     | 825-846 | Desktop `@media (min-width: 1025px)` feed/folder sizing                                                          | Move to responsive.css                                                      |
| sidebar.css     | 848-862 | Tablet `@media (min-width: 768px) and (max-width: 1024px)` feed/folder sizing                                    | Move to responsive.css                                                      |
| sidebar.css     | 864-878 | Mobile `@media (max-width: 767px)` feed/folder sizing                                                            | Move to responsive.css                                                      |

---

## 3. Conflicts to Resolve

### 3.1 Duplicate Mobile Navigation Modal Styles

**sidebar.css (698-736) vs responsive.css (187-295):**

Both files contain styles for `.modal.rss-mobile-navigation-modal`:

| Selector                                                                                                 | sidebar.css   | responsive.css |
| -------------------------------------------------------------------------------------------------------- | ------------- | -------------- |
| `.modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-toolbar`                                      | Lines 699-708 | ❌ Missing     |
| `.modal.rss-mobile-navigation-modal .rss-dashboard-search-dock`                                          | Lines 710-713 | ❌ Missing     |
| `.modal.rss-mobile-navigation-modal .rss-dashboard-drawer-actions`                                       | Lines 715-718 | ❌ Missing     |
| `.modal.rss-mobile-navigation-modal .rss-dashboard-bottom-drawer-content .rss-dashboard-sidebar-toolbar` | Lines 720-726 | ❌ Missing     |
| `.rss-folder-name-modal`                                                                                 | Lines 728-731 | ❌ Missing     |
| `.rss-folder-name-modal-input`                                                                           | Lines 733-735 | ❌ Missing     |

**Resolution:** These styles from sidebar.css need to be ADDED to responsive.css's `@media (max-width: 1200px)` block. They are not duplicates - they are missing from responsive.css.

### 3.2 Feed/Folder Sizing Conflicts

**sidebar.css (825-878) vs responsive.css (305-398):**

| Breakpoint        | sidebar.css   | responsive.css                                        |
| ----------------- | ------------- | ----------------------------------------------------- |
| Desktop >1024px   | Lines 825-846 | ❌ Missing                                            |
| Tablet 768-1024px | Lines 848-862 | Lines 341-349 (mobile only, 44px min-height)          |
| Mobile <768px     | Lines 864-878 | Lines 341-349 (similar but slightly different values) |

**Resolution:** The sidebar.css device-specific queries for feed/folder sizing are more complete. Move all three to responsive.css and ensure proper merge with any existing mobile touch target styles.

---

## 4. Organization After Refactor

### responsive.css Structure

```
responsive.css
├── Lines 1-43: Animations & Loading
├── Lines 45-59: @media (max-width: 1200px) - Sidebar visibility
├── Lines 61-87: Theme overrides
├── Lines 89-430: @media (max-width: 1200px) - Extended responsive styles
│   ├── Container/Layout
│   ├── Controls
│   ├── Reader
│   ├── Modal positioning
│   ├── Mobile navigation modal styles ← MERGED from sidebar.css 698-736
│   ├── Mobile discover filters modal
│   └── Form actions
├── Lines 305-398 (nested): @media (max-width: 768px) - Mobile specific
├── Lines 432-443: Touch device styles
├── Lines 458-477: Landscape orientation
├── Lines 481-683: Card view breakpoints
├── Lines 689-799: Container queries
├── Lines 803-852: Interaction & accessibility
├── Lines 854-862: Dark theme
├── Lines 865-880: Mobile landscape
├── Lines 882-897: Print
└── Lines 899-922: High contrast & focus
```

### sidebar.css Structure After Refactor

```
sidebar.css
├── Lines 1-100: Base layout & components (no @media queries)
├── Lines 101-340: Tags, filters, folders
├── Lines 341-430: Toolbar & buttons
├── Lines 431-520: Modal base styles
├── Lines 521-620: Search dock & drawer
├── Lines 621-696: Drawer actions & buttons
├── Lines 738-824: Redesign layout components (NO @media queries)
└── Lines 880-958: Mobile bottom sheet (base styles, no @media)
```

**Result:** sidebar.css should contain ONLY base/desktop component styles with NO `@media` queries. All breakpoint-based responsive code will live in responsive.css.

---

## 5. Implementation Steps

### Step 1: Add missing styles to responsive.css

**Action:** Merge sidebar.css lines 698-736 into responsive.css `@media (max-width: 1200px)` block

**Add these selectors to responsive.css (around line 295, before the nested @media):**

```css
.modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-toolbar {
  border-radius: 0;
  padding: 6px 0;
  margin: 0;
  width: 100%;
  border-top: 1px solid var(--background-modifier-border);
  border-bottom: none;
  border-left: none;
  border-right: none;
}

.modal.rss-mobile-navigation-modal .rss-dashboard-search-dock {
  border-top: 1px solid var(--background-modifier-border);
  padding: 8px 4px 6px;
}

.modal.rss-mobile-navigation-modal .rss-dashboard-drawer-actions {
  padding-right: 2px;
  padding-left: 4px;
}

.modal.rss-mobile-navigation-modal
  .rss-dashboard-bottom-drawer-content
  .rss-dashboard-sidebar-toolbar {
  margin: 0;
  border-left: none;
  border-right: none;
}

.rss-folder-name-modal {
  top: 44% !important;
  transform: translate(-50%, -44%) !important;
}

.rss-folder-name-modal-input {
  font-size: 16px;
}
```

### Step 2: Move device-specific feed/folder sizing

**Action:** Move sidebar.css lines 825-878 to responsive.css

**Add to responsive.css (after line 430, before landscape styles):**

```css
/* Desktop (>1024px) */
@media (min-width: 1025px) {
  .rss-dashboard-mobile-only {
    display: none !important;
  }
  .rss-dashboard-feed,
  .rss-dashboard-all-feeds-button {
    min-height: 28px;
    padding: 3px 8px 3px 20px;
  }
  .rss-dashboard-feed-folder-header {
    min-height: 28px;
    padding: 3px 10px;
  }
  .rss-dashboard-all-feeds-button {
    padding-left: 10px;
  }
  .rss-dashboard-header-icon-button {
    width: 36px;
    height: 36px;
  }
}

/* Tablet (768px - 1024px) */
@media (min-width: 768px) and (max-width: 1024px) {
  .rss-dashboard-feed,
  .rss-dashboard-all-feeds-button {
    min-height: 36px;
    padding: 5px 8px 5px 32px;
  }
  .rss-dashboard-feed-folder-header {
    min-height: 36px;
    padding: 4px 10px;
  }
  .rss-dashboard-all-feeds-button {
    padding-left: 10px;
  }
}

/* Mobile (<768px) */
@media (max-width: 767px) {
  .rss-dashboard-feed,
  .rss-dashboard-all-feeds-button {
    min-height: 36px;
    padding: 4px 8px 4px 20px;
  }
  .rss-dashboard-feed-folder-header {
    min-height: 36px;
    padding: 4px 10px;
  }
  .rss-dashboard-all-feeds-button {
    padding-left: 10px;
  }
}
```

### Step 3: Remove moved code from sidebar.css

**Action:** Delete the following line ranges from sidebar.css:

- Lines 698-736 (entire @media max-width: 1200px block)
- Lines 825-878 (three device-specific media queries)

### Step 4: Verify no regressions

- Build the plugin with `npm run build`
- Test responsive behavior on:
  - Desktop (>1200px)
  - Tablet (768px-1200px)
  - Mobile (<768px)
- Verify mobile navigation modal renders correctly
- Verify folder name modal positioning on mobile

---

## 6. Summary

| Item                                  | Count                  |
| ------------------------------------- | ---------------------- |
| Lines to move from sidebar.css        | 90 (38 + 22 + 15 + 15) |
| New selectors added to responsive.css | 13                     |
| Media queries consolidated            | 4                      |
| Files modified                        | 2                      |

**Expected Outcome:** All responsive/breakpoint-based CSS lives in `responsive.css`, while `sidebar.css` contains only base component styles. This follows the single-responsibility principle for CSS organization and makes future responsive changes easier to locate.
