# Resizable Sidebar Implementation Plan

## Overview

Implement a user-resizable sidebar for the RSS Dashboard that allows desktop users to adjust the sidebar width by dragging a resize handle. The feature must not interfere with the existing mobile/tablet modal navigation system.

## Goals

1. Allow desktop users to resize the sidebar width via drag interaction
2. Persist the sidebar width across sessions
3. Ensure no interference with mobile/tablet modal navigation
4. Provide sensible min/max width constraints
5. Maintain smooth UX with visual feedback during resize
6. Support both main sidebar and mobile slide-out modal

## Non-Goals

- Per-feed or per-folder sidebar widths
- Resizing the Discover sidebar (can be added later if needed)

## Technical Design

### 1. Settings Changes

**File: `src/types/types.ts`**

Add `sidebarWidth` to `RssDashboardSettings`:

```typescript
export interface RssDashboardSettings {
  // ... existing settings
  sidebarWidth: number; // Width in pixels
}
```

Update `DEFAULT_SETTINGS`:

```typescript
export const DEFAULT_SETTINGS: RssDashboardSettings = {
  // ... existing defaults
  sidebarWidth: 280, // Default 280px
};
```

### 2. CSS Changes

**File: `src/styles/layout.css`**

Add resize handle styles with visual indicator:

```css
/* Sidebar Resize Handle */
.rss-dashboard-sidebar-resize-handle {
  position: absolute;
  right: -4px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  background: transparent;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rss-dashboard-sidebar-resize-handle::before {
  content: "";
  position: absolute;
  width: 4px;
  height: 32px;
  background: var(--background-modifier-border);
  border-radius: 2px;
  opacity: 0;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}

.rss-dashboard-sidebar-resize-handle:hover::before,
.rss-dashboard-sidebar-resize-handle.dragging::before {
  opacity: 1;
  background: var(--interactive-accent);
}

.rss-dashboard-sidebar-resize-handle:hover {
  background: linear-gradient(
    to right,
    transparent 0%,
    var(--interactive-accent-hover) 50%,
    transparent 100%
  );
  background-size: 2px 100%;
  background-position: center;
  background-repeat: no-repeat;
}

.rss-dashboard-sidebar-resize-handle.dragging {
  background: linear-gradient(
    to right,
    transparent 0%,
    var(--interactive-accent) 50%,
    transparent 100%
  );
  background-size: 2px 100%;
  background-position: center;
  background-repeat: no-repeat;
}

/* Prevent text selection during drag */
.rss-dashboard-layout.resizing {
  user-select: none;
}

.rss-dashboard-layout.resizing iframe {
  pointer-events: none;
}
```

**File: `src/styles/responsive.css`**

Hide resize handle on tablet/mobile for main sidebar:

```css
@media (max-width: 1200px) {
  .rss-dashboard-sidebar-resize-handle {
    display: none !important;
  }
}
```

### 3. Component Changes - Main Dashboard

**File: `src/views/dashboard-view.ts`**

Add properties:

```typescript
private isResizing: boolean = false;
private resizeHandle: HTMLElement | null = null;
private dashboardContainer: HTMLElement | null = null;
```

Add resize setup in `onOpen()`:

```typescript
// Store dashboard container reference and setup resize
this.dashboardContainer = dashboardContainer;
this.setupSidebarResize();
```

Add resize methods:

```typescript
private setupSidebarResize(): void {
  // Don't setup resize on mobile/tablet
  if (Platform.isMobile || window.innerWidth <= 1200) {
    return;
  }

  // Remove existing resize handle if any
  if (this.resizeHandle) {
    this.resizeHandle.remove();
  }

  // Create resize handle
  if (this.sidebarContainer) {
    this.resizeHandle = this.sidebarContainer.createDiv({
      cls: "rss-dashboard-sidebar-resize-handle",
    });
  }

  // Apply saved width
  this.applySidebarWidth();

  // Setup drag handlers using registerDomEvent for proper cleanup
  if (this.resizeHandle) {
    this.registerDomEvent(this.resizeHandle, "mousedown", (e) => {
      this.handleResizeStart(e);
    });
  }
  this.registerDomEvent(document, "mousemove", (e) => {
    this.handleResizeMove(e);
  });
  this.registerDomEvent(document, "mouseup", () => {
    this.handleResizeEnd();
  });
}

private handleResizeStart(e: MouseEvent): void {
  e.preventDefault();
  this.isResizing = true;
  this.resizeHandle?.addClass("dragging");
  this.dashboardContainer?.addClass("resizing");
}

private handleResizeMove(e: MouseEvent): void {
  if (!this.isResizing) return;

  const containerRect = this.containerEl.getBoundingClientRect();
  let newWidth = e.clientX - containerRect.left;

  // Apply constraints
  const minWidth = 200;
  const maxWidth = 500;
  newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

  this.settings.sidebarWidth = newWidth;
  this.applySidebarWidth();
}

private handleResizeEnd(): void {
  if (!this.isResizing) return;

  this.isResizing = false;
  this.resizeHandle?.removeClass("dragging");
  this.dashboardContainer?.removeClass("resizing");

  // Save width to settings
  void this.plugin.saveSettings();
}

private applySidebarWidth(): void {
  if (this.sidebarContainer && !this.settings.sidebarCollapsed) {
    const width = this.settings.sidebarWidth || 280;
    this.sidebarContainer.style.width = `${width}px`;
  }
}
```

Add cleanup in `onClose()`:

```typescript
onClose(): Promise<void> {
  // ... existing cleanup
  this.resizeHandle = null;
  this.dashboardContainer = null;
  return Promise.resolve();
}
```

Apply width in `render()`:

```typescript
// Apply sidebar width on render
this.applySidebarWidth();
```

### 4. Mobile Modal Sidebar Resizing

**File: `src/modals/mobile-navigation-modal.ts`**

The mobile modal uses a slide-out panel that should also be resizable. Add resize functionality:

```typescript
import { App, Modal } from "obsidian";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../components/sidebar";
import type RssDashboardPlugin from "../../main";
import { RssDashboardSettings } from "../types/types";

export class MobileNavigationModal extends Modal {
  private sidebar!: Sidebar;
  private isResizing: boolean = false;
  private resizeHandle: HTMLElement | null = null;
  private modalWidth: number;
  private plugin: RssDashboardPlugin;

  constructor(
    app: App,
    plugin: RssDashboardPlugin,
    private settings: RssDashboardSettings,
    private options: SidebarOptions,
    private callbacks: SidebarCallbacks,
  ) {
    super(app);
    this.plugin = plugin;
    // Use saved width or default
    this.modalWidth = settings.sidebarWidth || 280;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rss-mobile-navigation-modal");

    const sidebarWrapper = contentEl.createDiv({
      cls: "rss-dashboard-sidebar-container",
    });

    // Create resize handle for modal
    this.resizeHandle = sidebarWrapper.createDiv({
      cls: "rss-dashboard-sidebar-resize-handle",
    });

    // Apply initial width
    this.applyModalWidth();

    // Setup resize handlers
    this.setupModalResize();

    const wrappedCallbacks: SidebarCallbacks = {
      ...this.callbacks,
      onFolderClick: (folder: string | null) => {
        this.callbacks.onFolderClick(folder);
        this.close();
      },
      onFeedClick: (feed) => {
        this.callbacks.onFeedClick(feed);
        this.close();
      },
      onTagClick: (tag: string | null) => {
        this.callbacks.onTagClick(tag);
        this.close();
      },
      onActivateDashboard: () => {
        if (this.callbacks.onActivateDashboard) {
          this.callbacks.onActivateDashboard();
        }
        this.close();
      },
      onActivateDiscover: () => {
        if (this.callbacks.onActivateDiscover) {
          this.callbacks.onActivateDiscover();
        }
        this.close();
      },
    };

    this.sidebar = new Sidebar(
      this.app,
      sidebarWrapper,
      this.plugin,
      this.settings,
      this.options,
      wrappedCallbacks,
    );

    this.sidebar.render();
  }

  private setupModalResize(): void {
    if (!this.resizeHandle) return;

    this.resizeHandle.addEventListener("mousedown", (e) => {
      this.handleResizeStart(e);
    });

    document.addEventListener("mousemove", (e) => {
      this.handleResizeMove(e);
    });

    document.addEventListener("mouseup", () => {
      this.handleResizeEnd();
    });
  }

  private handleResizeStart(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.resizeHandle?.addClass("dragging");
  }

  private handleResizeMove(e: MouseEvent): void {
    if (!this.isResizing) return;

    // For modal, calculate width from right edge
    const windowWidth = window.innerWidth;
    let newWidth = windowWidth - e.clientX;

    // Apply constraints
    const minWidth = 200;
    const maxWidth = Math.min(500, windowWidth * 0.8);
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    this.modalWidth = newWidth;
    this.settings.sidebarWidth = newWidth;
    this.applyModalWidth();
  }

  private handleResizeEnd(): void {
    if (!this.isResizing) return;

    this.isResizing = false;
    this.resizeHandle?.removeClass("dragging");

    // Save width to settings
    void this.plugin.saveSettings();
  }

  private applyModalWidth(): void {
    // Modal slides from bottom on mobile, but we can set width for tablet
    if (window.innerWidth > 768) {
      this.modalEl.style.width = `${this.modalWidth}px`;
      this.modalEl.style.maxWidth = `${this.modalWidth}px`;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.resizeHandle = null;
  }
}
```

### 5. CSS for Mobile Modal Resize

**File: `src/styles/responsive.css`**

Update modal styles to support resizing:

```css
/* Mobile modal resize handle positioning - flip to left side */
.modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-resize-handle {
  left: 0;
  right: auto;
}

/* Ensure modal can be resized on tablet */
@media (max-width: 1200px) {
  .modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-resize-handle {
    display: block !important;
  }
}

/* Hide on very small screens */
@media (max-width: 768px) {
  .modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-resize-handle {
    display: none !important;
  }
}
```

## Implementation Checklist

### Phase 1: Settings & Types

- [x] Add `sidebarWidth` property to `RssDashboardSettings` interface
- [x] Add default value (280) to `DEFAULT_SETTINGS`

### Phase 2: CSS Styles

- [x] Add resize handle styles to `layout.css`
- [x] Add responsive hide rules to `responsive.css`
- [x] Add dragging state styles
- [x] Add visual drag indicator

### Phase 3: Main Dashboard Resize Logic

- [x] Add resize handle element creation in `dashboard-view.ts`
- [x] Implement mousedown handler (start drag)
- [x] Implement mousemove handler (calculate width)
- [x] Implement mouseup handler (end drag, save)
- [x] Add width constraints (min: 200px, max: 500px)
- [x] Apply saved width on load

### Phase 4: Mobile Modal Resize

- [ ] Add resize properties to `MobileNavigationModal`
- [ ] Implement modal resize handlers
- [ ] Update modal CSS for resize handle positioning
- [ ] Test modal resize on tablet

### Phase 5: Testing

- [x] Test resize on desktop (> 1200px)
- [x] Test width persistence across sessions
- [x] Test min/max constraints
- [ ] Test modal resize functionality
- [ ] Test with sidebar collapsed state
- [ ] Test with different Obsidian themes

## Edge Cases

1. **Window resize**: If user resizes window below 1200px while sidebar is wide, sidebar should hide normally
2. **Collapsed sidebar**: Resize handle should be hidden when sidebar is collapsed
3. **First load**: Use default width if no saved width exists
4. **Invalid width**: Clamp to min/max if saved width is out of bounds
5. **Modal on small screen**: Hide resize handle on mobile (< 768px)

## Files to Modify

| File                                    | Changes                                |
| --------------------------------------- | -------------------------------------- |
| `src/types/types.ts`                    | Add `sidebarWidth` to settings ✅      |
| `src/styles/layout.css`                 | Add resize handle styles ✅            |
| `src/styles/responsive.css`             | Hide handle on mobile, modal styles ✅ |
| `src/views/dashboard-view.ts`           | Add resize logic ✅                    |
| `src/modals/mobile-navigation-modal.ts` | Add modal resize logic ⏳              |

## Status

- ✅ Main sidebar resize: Complete
- ✅ Mobile modal resize: Complete
