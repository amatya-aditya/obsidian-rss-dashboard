# Icon Replacement Plan for `feed-manager-modal.ts`

## Current State Analysis

The file contains **6 custom SVG icons** (3 icon types × 2 modal instances) that need to be replaced:

| Location      | Icon Type            | Current Implementation            | Lines     |
| ------------- | -------------------- | --------------------------------- | --------- |
| EditFeedModal | RSS Badge            | Custom SVG (viewBox: 0 0 448 512) | 274-294   |
| EditFeedModal | Apple Podcasts Badge | Custom SVG (viewBox: 0 0 24 24)   | 296-318   |
| EditFeedModal | YouTube Badge        | Custom SVG (viewBox: 0 0 24 24)   | 320-342   |
| AddFeedModal  | RSS Badge            | Custom SVG (viewBox: 0 0 448 512) | 1086-1106 |
| AddFeedModal  | Apple Podcasts Badge | Custom SVG (viewBox: 0 0 24 24)   | 1108-1130 |
| AddFeedModal  | YouTube Badge        | Custom SVG (viewBox: 0 0 24 24)   | 1132-1154 |

### Icons Already Correctly Using Lucide

The file already uses `setIcon()` for interactive buttons:

- [`setIcon(closeBtn, "x")`](src/modals/feed-manager-modal.ts:1558) - Close button
- [`setIcon(searchClearBtn, "x")`](src/modals/feed-manager-modal.ts:1586) - Search clear
- [`setIcon(importOpmlBtn, "upload")`](src/modals/feed-manager-modal.ts:1659) - Import
- [`setIcon(exportOpmlBtn, "download")`](src/modals/feed-manager-modal.ts:1669) - Export
- [`setIcon(deleteAllBtn, "trash-2")`](src/modals/feed-manager-modal.ts:1679) - Delete all
- [`setIcon(deleteFolderBtn, "trash-2")`](src/modals/feed-manager-modal.ts:1746) - Delete folder
- [`setIcon(editBtn, "pencil")`](src/modals/feed-manager-modal.ts:1823) - Edit feed
- [`setIcon(delBtn, "trash-2")`](src/modals/feed-manager-modal.ts:1834) - Delete feed

---

## Design Spec Requirements

Per [`docs/design/design-spec.md`](docs/design/design-spec.md:170-225), the Icon Rendering Standards require:

1. **Use the `clickable-icon` pattern** for interactive icons
2. **Use `setIcon()`** with Lucide icon names
3. **Follow implementation structure:**
   ```typescript
   const iconButton = container.createDiv({
     cls: "clickable-icon",
     attr: {
       "aria-label": "Desired Action",
       role: "button",
       tabindex: "0",
     },
   });
   setIcon(iconButton, "lucide-icon-name");
   ```
4. **Handle keyboard events** for accessibility

---

## Recommended Replacements

| Current Custom SVG | Lucide Icon  | Reasoning                                                                                                                                                 |
| ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RSS (radio waves)  | `rss`        | Already used throughout codebase (e.g., [`sidebar.ts:369`](src/components/sidebar.ts:369), [`article-list.ts:2108`](src/components/article-list.ts:2108)) |
| Apple Podcasts     | `headphones` | Used in [`sidebar.ts:1431`](src/components/sidebar.ts:1431) and [`article-list.ts:2212`](src/components/article-list.ts:2212) for podcast feeds           |
| YouTube            | `youtube`    | Available in Lucide; also used in [`video-player.ts:134`](src/views/video-player.ts:134)                                                                  |

---

## Implementation Plan

### Step 1: Replace RSS Badge Icons

**EditFeedModal (lines 274-294):**

```typescript
// Replace custom SVG creation with:
const rssBadge = formatsDesc.createSpan({ cls: "format-badge rss" });
const rssIcon = rssBadge.createSpan({ cls: "clickable-icon" });
setIcon(rssIcon, "rss");
rssBadge.appendText(" RSS");
```

**AddFeedModal (lines 1086-1106):**

```typescript
// Same replacement pattern
```

### Step 2: Replace Apple Podcasts Badge Icons

**EditFeedModal (lines 296-318):**

```typescript
const podcastBadge = formatsDesc.createSpan({ cls: "format-badge podcast" });
const podcastIcon = podcastBadge.createSpan({ cls: "clickable-icon" });
setIcon(podcastIcon, "headphones");
podcastBadge.appendText(" Apple Podcasts");
```

**AddFeedModal (lines 1108-1130):**

```typescript
// Same replacement pattern
```

### Step 3: Replace YouTube Badge Icons

**EditFeedModal (lines 320-342):**

```typescript
const youtubeBadge = formatsDesc.createSpan({ cls: "format-badge youtube" });
const youtubeIcon = youtubeBadge.createSpan({ cls: "clickable-icon" });
setIcon(youtubeIcon, "youtube");
youtubeBadge.appendText(" YouTube");
```

**AddFeedModal (lines 1132-1154):**

```typescript
// Same replacement pattern
```

---

## CSS Considerations

The design spec ([`design-spec.md:210-224`](docs/design/design-spec.md:210)) recommends:

```css
.clickable-icon svg {
  width: var(--icon-size) !important;
  height: var(--icon-size) !important;
  display: block !important;
  visibility: visible !important;
}
```

The existing `.format-badge` elements should continue working with Lucide icons since they use the same class structure. Verify that `14px` sizing is maintained via CSS if different from default `--icon-size`.

---

## Summary

**Total replacements needed:** 6 icons (3 types × 2 modal instances)

This change will:

- ✅ Align with design spec icon standards
- ✅ Use consistent Lucide icons already used elsewhere in the codebase
- ✅ Improve maintainability (no inline SVG paths)
- ✅ Ensure cross-platform compatibility (especially Android WebView)
