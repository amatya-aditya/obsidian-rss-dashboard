# RSS Dashboard — Hover Performance Fix Plan

> **Plugin:** `obsidian-rss-dashboard`
> **Issue:** 200–500ms hover lag on cards with large images (NPR feed: 5000×3333px sources)
> **Strategy:** Four targeted fixes applied in order, each independently testable. Stop after any step that fully resolves the issue.

---

## Step 1 — Fix `overflow-y` on the summary overlay

**File:** `src/styles/` (locate the rule for `.rss-dashboard-summary-overlay`)

**What to do:**
Change `overflow-y: auto` to `overflow-y: hidden` on the summary overlay element.

```css
/* BEFORE */
.rss-dashboard-summary-overlay {
  overflow-y: auto;
}

/* AFTER */
.rss-dashboard-summary-overlay {
  overflow-y: hidden;
}
```

**Why:** `overflow-y: auto` creates a new block formatting context, which forces a full layout recalculation every time opacity transitions begin. Switching to `hidden` keeps the transition entirely on the GPU compositor (opacity is compositor-only when no layout is involved), eliminating ~50–150ms of CPU work.

**If the overlay text overflows visually after this change:** Add a `max-height` with text clamping instead of scroll:

```css
.rss-dashboard-summary-overlay {
  overflow-y: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}
```

**Verify:** Hover over an NPR card. The lag should be noticeably reduced. Confirm the overlay text still displays correctly and doesn't overflow its container.

---

## Step 2 — Remove the transition from the image element

**File:** Same CSS file as Step 1

**What to do:**
Remove any `transition` property on `.rss-dashboard-cover-image`. Only the overlay should animate — the image can snap instantly to `opacity: 0`.

```css
/* BEFORE */
.rss-dashboard-cover-container:hover .rss-dashboard-cover-image {
  opacity: 0;
  transition: opacity 0.3s ease; /* remove this */
}

/* AFTER */
.rss-dashboard-cover-container:hover .rss-dashboard-cover-image {
  opacity: 0;
  /* no transition — instant snap is imperceptible when overlay fades in */
}

/* Keep transition only on the overlay */
.rss-dashboard-summary-overlay {
  opacity: 0;
  transition: opacity 0.3s ease;
}
.rss-dashboard-cover-container:hover .rss-dashboard-summary-overlay {
  opacity: 1;
}
```

**Why:** Running two simultaneous opacity transitions means the compositor is managing two layer uploads at once. Since the image disappearing is masked by the overlay appearing, the image transition is invisible in practice. Removing it halves the compositor work per hover event.

**Verify:** Hover animation still looks clean. The overlay fades in smoothly; the image disappearing underneath is not perceptible.

---

## Step 3 — Add `will-change: opacity` to animated elements

**File:** Same CSS file as Steps 1–2

**What to do:**
Add `will-change: opacity` to both the cover image and the summary overlay. This tells the browser to promote these elements to their own compositor layers _before_ hover fires.

```css
.rss-dashboard-cover-image,
.rss-dashboard-summary-overlay {
  will-change: opacity;
}
```

**Why:** Without this hint, the browser composites these elements on demand when hover triggers — meaning it must upload GPU textures at exactly the moment the user expects instant feedback. With `will-change`, layers are pre-promoted and the compositor can start the transition in under one frame.

**Caution — memory trade-off:** Each promoted layer consumes GPU memory proportional to the element's rendered size. With 20+ visible cards each containing a large image, this can be significant on lower-end devices (e.g., mobile Obsidian).

**If memory pressure is a concern on mobile:** Instead of static `will-change` in CSS, apply it dynamically via JavaScript only during hover:

```typescript
// In the component that renders cards:
cardEl.addEventListener("mouseenter", () => {
  imageEl.style.willChange = "opacity";
  overlayEl.style.willChange = "opacity";
});
cardEl.addEventListener("mouseleave", () => {
  imageEl.style.willChange = "auto";
  overlayEl.style.willChange = "auto";
});
```

Note: Dynamic `will-change` provides less benefit than static (the promotion happens at mouseenter, not before), but it avoids the memory cost at rest.

**Verify:** Use browser DevTools → Layers panel (or Obsidian's Chromium devtools via `Ctrl+Shift+I`) to confirm the image and overlay elements have their own compositor layers. Hover transitions should now be visibly instant.

---

## Step 4 — Downscale image URLs at extraction time

**File:** Wherever image URLs are extracted from RSS feed content — likely in the feed parser or article processing pipeline (search for `content:encoded` parsing or `cover` / `image` extraction logic)

**What to do:**
Add a URL rewriting utility that detects CDN resize parameters and replaces them with display-appropriate dimensions before the URL is stored or rendered.

```typescript
/**
 * Rewrites known CDN image URLs to a display-appropriate size.
 * Prevents the browser from decoding multi-megapixel images for card thumbnails.
 */
export function optimizeImageUrl(url: string, maxWidth = 600): string {
  if (!url) return url;

  // NPR / Brightspot CDN
  if (url.includes("brightspotcdn.com")) {
    // Remove existing crop/resize params and inject our own
    return url
      .replace(/\/crop\/\d+x\d+\//g, "/")
      .replace(/\/resize\/\d+x\d+(\/|$)/g, `/resize/${maxWidth}x/`);
  }

  // WordPress Photon / Jetpack CDN
  if (
    url.includes("i0.wp.com") ||
    url.includes("i1.wp.com") ||
    url.includes("i2.wp.com")
  ) {
    const parsed = new URL(url);
    parsed.searchParams.set("w", String(maxWidth));
    parsed.searchParams.delete("h");
    return parsed.toString();
  }

  // Cloudinary
  if (url.includes("cloudinary.com")) {
    return url.replace(/\/upload\//, `/upload/w_${maxWidth},c_scale/`);
  }

  // Generic: return unchanged (unknown CDN, no safe transform)
  return url;
}
```

**Where to call it:** Apply `optimizeImageUrl(rawUrl)` at the point where the cover image URL is extracted from the feed item, before it is stored in the article object. Do not apply it at render time — it should be baked in at parse time so it works consistently across all views.

**Why:** Reduces GPU texture size from ~75MB (decoded 5000×3333 JPEG) to ~2MB (decoded 600×400). This is the only fix that addresses the memory and decode-cost root cause. Steps 1–3 make transitions fast; Step 4 makes the entire page lighter.

**Verify:**

1. Open an NPR feed and inspect the `src` of a card's cover image in DevTools — it should now show a `resize/600x` variant.
2. Check the Network tab: image file sizes should be dramatically smaller (tens of KB vs several MB).
3. Hover lag on NPR cards should now be imperceptible even without Steps 1–3 in isolation.

---

## Completion checklist

After all steps are applied, confirm:

- [ ] Hovering NPR cards shows no perceptible delay (target: < 16ms / one frame)
- [ ] Summary overlay fades in smoothly at `0.3s ease`
- [ ] Overlay text is not clipped or scrollable unexpectedly
- [ ] Card images load visibly faster on first render (Step 4)
- [ ] No regression on other feeds (standard CDN images, feeds without cover images)
- [ ] Mobile Obsidian: no increased memory pressure or blank card images from URL rewriting

---

## Notes for future feeds

The `optimizeImageUrl` function in Step 4 is intentionally conservative — it only rewrites URLs from known CDNs with documented resize APIs. If a new feed surfaces the same issue, identify its CDN pattern and add a branch to the function. Do not attempt to resize arbitrary image URLs via query params, as most hosts will either ignore them or return errors.
