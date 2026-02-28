# Custom Sidebar Row Spacing Setting

## Overview

Add a new setting under the **Display** tab that allows users to customize the height/spacing between rows in the sidebar feed list. The setting will be a slider ranging from 10px to 44px.

## Files to Edit

| File                           | Purpose                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `src/types/types.ts`           | Add new property to `DisplaySettings` interface and `DEFAULT_SETTINGS` |
| `src/settings/settings-tab.ts` | Add slider control in the Display tab                                  |
| `src/styles/sidebar.css`       | Add CSS variable support for row spacing                               |
| `src/components/sidebar.ts`    | Apply the CSS variable to feed rows                                    |

## Implementation Details

### 1. Update Types (`src/types/types.ts`)

Add the new property to the `DisplaySettings` interface (around line 154-174):

```typescript
export interface DisplaySettings {
  showCoverImage: boolean;
  showSummary: boolean;
  showFilterStatusBar: boolean;
  filterDisplayStyle: "vertical" | "inline";
  mobileShowCardToolbar: boolean;
  mobileShowListToolbar: boolean;
  mobileListToolbarStyle: "left-grid" | "bottom-row" | "minimal";
  defaultFilter:
    | "all"
    | "starred"
    | "unread"
    | "read"
    | "saved"
    | "videos"
    | "podcasts";
  hiddenFilters: string[];
  useDomainFavicons: boolean;
  hideDefaultRssIcon: boolean;
  autoMarkReadOnOpen: boolean;
  sidebarRowSpacing: number; // <-- ADD THIS NEW PROPERTY
}
```

Add the default value in `DEFAULT_SETTINGS` (around line 372-385):

```typescript
display: {
  showCoverImage: true,
  showSummary: true,
  showFilterStatusBar: true,
  filterDisplayStyle: "inline",
  mobileShowCardToolbar: true,
  mobileShowListToolbar: true,
  mobileListToolbarStyle: "minimal",
  defaultFilter: "all",
  hiddenFilters: [],
  useDomainFavicons: true,
  hideDefaultRssIcon: false,
  autoMarkReadOnOpen: false,
  sidebarRowSpacing: 20,  // <-- ADD THIS DEFAULT VALUE (20px)
},
```

### 2. Update Settings Tab (`src/settings/settings-tab.ts`)

Add a new slider setting in the `createDisplaySettings` method. Best place would be after the "Hide default RSS icon" toggle (around line 416), before the "Automatically mark article 'read'" setting:

```typescript
new Setting(containerEl)
  .setName("Sidebar row spacing")
  .setDesc("Adjust the height between rows in the sidebar feed list")
  .addSlider((slider) =>
    slider
      .setLimits(10, 44, 1)
      .setValue(this.plugin.settings.display.sidebarRowSpacing ?? 20)
      .setDynamicTooltip()
      .onChange(async (value) => {
        this.plugin.settings.display.sidebarRowSpacing = value;
        await this.plugin.saveSettings();
        // Apply the new spacing to the sidebar by re-rendering
        const view = await this.plugin.getActiveDashboardView();
        if (view?.sidebar) {
          view.sidebar.render();
        }
      }),
  );
```

### 3. Update Sidebar CSS (`src/styles/sidebar.css`)

Add a CSS custom property definition at the top of the file or modify the `.rss-dashboard-feed` class:

```css
/* Add at the top of the file or in a :root block */
:root {
  --sidebar-row-spacing: 20px;
}

/* Update the .rss-dashboard-feed class (around line 224) */
.rss-dashboard-feed {
  cursor: pointer;
  display: flex;
  align-items: center;
  padding-top: calc(var(--sidebar-row-spacing) / 2);
  padding-bottom: calc(var(--sidebar-row-spacing) / 2);
}
```

Alternatively, if you prefer margin-based spacing:

```css
.rss-dashboard-feed {
  cursor: pointer;
  display: flex;
  align-items: center;
  margin-bottom: var(--sidebar-row-spacing, 20px);
}
```

### 4. Update Sidebar Component (`src/components/sidebar.ts`)

Apply the CSS custom property when rendering the sidebar. Find where the sidebar is initialized and add:

```typescript
// In the render method
const spacing = this.settings.display.sidebarRowSpacing ?? 20;
this.container.style.setProperty("--sidebar-row-spacing", `${spacing}px`);
```

## Task List

- [ ] Add `sidebarRowSpacing: number` to `DisplaySettings` interface in `src/types/types.ts`
- [ ] Add default value `sidebarRowSpacing: 20` to `DEFAULT_SETTINGS.display` in `src/types/types.ts`
- [ ] Add slider setting in `createDisplaySettings` method in `src/settings/settings-tab.ts`
- [ ] Add CSS custom property `:root { --sidebar-row-spacing: 20px; }` in `src/styles/sidebar.css`
- [ ] Update `.rss-dashboard-feed` class to use `var(--sidebar-row-spacing)` in `src/styles/sidebar.css`
- [ ] Apply CSS custom property in sidebar component in `src/components/sidebar.ts`
- [ ] Build and test the new setting

## Notes

- The range of 10px to 44px was chosen to provide adequate spacing options from compact to spacious
- Using CSS custom properties allows for dynamic updates without reloading the page
- The default value of 20px provides a balance between readability and compactness
- Similar slider implementations can be found in the General settings (e.g., "Refresh interval" at line 227-239)
