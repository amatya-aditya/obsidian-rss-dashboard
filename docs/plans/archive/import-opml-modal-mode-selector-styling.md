# Import OPML Modal - Mode Selector Styling Issue

## Bug Summary

**Status:** Open  
**Date Reported:** 2026-02-24  
**Affected Component:** Import OPML Modal - Mode Selector Section  
**File Location:** `src/modals/import-opml-modal.ts`, `src/styles/modals.css`

### Description

The Import OPML modal's mode selector section displays two containers (for "Update" and "Overwrite" options) but the text content appears **outside** the containers instead of inside them. The radio buttons are visible, but the title text ("Update", "Overwrite") and description text appear outside the bordered container boxes.

### Expected Behavior

The mode selector should display:

- "Import mode:" label at the top
- Two bordered option containers, each containing:
  - A radio button on the left
  - Title text ("Update" or "Overwrite")
  - Description text below the title

### Actual Behavior

- Two bordered containers are visible
- Radio buttons appear inside containers
- Title and description text appear outside/above the containers
- Text appears to "float" outside the visual boundaries

---

## Debugging Attempts

### Attempt 1: CSS Class Name Mismatch

**Hypothesis:** CSS classes used in TypeScript didn't match CSS definitions.

**Changes Made:**

- Added `.import-mode-label` CSS class definition
- Added `.import-mode-option-text` CSS class definition

**Result:** Build succeeded, but issue persisted after Obsidian reload.

### Attempt 2: Global CSS Rule Override (Specificity)

**Hypothesis:** Global CSS rule `.rss-dashboard-modal label { display: block; }` was forcing label elements to display as block, breaking the flexbox layout.

**Changes Made:**

```css
/* Override global .rss-dashboard-modal label display:block */
.rss-dashboard-modal .import-mode-option-title,
.import-mode-option .import-mode-option-title {
  display: inline !important;
}
```

**Result:** Build succeeded, but issue persisted.

### Attempt 3: Flex Container Fix

**Hypothesis:** The `.import-mode-option-text` container needed explicit flex properties.

**Changes Made:**

```css
.import-mode-option-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.import-mode-option {
  overflow: hidden;
}
```

**Result:** Build succeeded, but issue persisted.

### Attempt 4: Change from `<label>` to `<div>` Elements

**Hypothesis:** Using `<label>` elements triggers the global CSS rule. Switching to `<div>` elements would avoid the conflict.

**Changes Made:**

```typescript
// Before:
updateText.createEl("label", {
  cls: "import-mode-option-title",
  attr: { for: "import-mode-update" },
  text: "Update",
});

// After:
const updateTitle = updateText.createDiv({
  cls: "import-mode-option-title",
});
updateTitle.textContent = "Update";
```

**Result:** Build succeeded, but issue persisted.

---

## Current Code State

### TypeScript Structure (src/modals/import-opml-modal.ts)

```typescript
private createModeSelector(container: HTMLElement) {
  container.empty();

  const label = container.createDiv({ cls: "import-mode-label" });
  label.textContent = "Import mode:";

  // Update option
  const updateOption = container.createDiv({ cls: "import-mode-option" });
  const updateRadio = updateOption.createEl("input", { type: "radio", ... });
  const updateText = updateOption.createDiv({ cls: "import-mode-option-text" });
  const updateTitle = updateText.createDiv({ cls: "import-mode-option-title" });
  updateTitle.textContent = "Update";
  updateText.createEl("div", { cls: "import-mode-option-desc", text: "..." });

  // Overwrite option (similar structure)
}
```

### CSS Definitions (src/styles/modals.css)

```css
.import-mode-selector {
  margin-bottom: 1rem;
  padding: 1rem;
  background: var(--background-secondary);
  border-radius: 8px;
}

.import-mode-label {
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
}

.import-mode-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.import-mode-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 0.75rem;
  border: 2px solid var(--background-modifier-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  overflow: hidden;
}

.import-mode-option input[type="radio"] {
  margin-top: 2px;
  flex-shrink: 0;
}

.import-mode-option-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.import-mode-option-title {
  font-weight: 500;
  color: var(--text-normal);
  margin-bottom: 2px;
  display: inline !important;
  font-size: 0.95rem;
}

.import-mode-option-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
}
```

---

## Potential Causes

### Most Likely Culprits

1. **Obsidian CSS Caching Issue**
   - Obsidian may be caching old CSS and not picking up changes
   - The compiled `styles.css` contains the correct CSS, but Obsidian may not be loading it
   - **Solution:** Try completely closing Obsidian and reopening, or try in a fresh vault

2. **CSS Not Being Applied to Modal**
   - The modal may not have the correct class structure for CSS to apply
   - The modal uses `rss-dashboard-modal` and `rss-dashboard-modal-container` classes
   - **Solution:** Inspect the DOM to verify class names are applied correctly

3. **Visibility Class Conflict**
   - The `import-hidden` and `import-visible` classes use `display: none !important` and `display: block !important`
   - When `import-visible` is applied, it sets `display: block` which may override flex display
   - **Solution:** Change visibility classes to not use `display` property, use `visibility` or `height` instead

### Other Potential Causes

4. **Parent Container Interference**
   - The `.import-mode-selector` container has `padding: 1rem` which might cause layout issues
   - **Solution:** Try removing padding or using margin on child elements instead

5. **CSS Specificity War**
   - There may be other CSS rules in the codebase that are overriding our styles
   - **Solution:** Use browser DevTools to inspect computed styles and see what's being applied

6. **Build Process Issue**
   - The CSS may not be properly compiled into `styles.css`
   - **Solution:** Verify the compiled `styles.css` contains all the import mode styles

7. **Obsidian Theme Conflict**
   - The user's Obsidian theme may be applying conflicting styles
   - **Solution:** Test with default theme or in a fresh vault

---

## Recommended Next Steps

### Immediate Actions

1. **Inspect DOM in Browser DevTools**
   - Open Obsidian
   - Open Import OPML modal
   - Press F12 to open DevTools
   - Inspect the `.import-mode-selector` element
   - Check:
     - Are all CSS classes applied correctly?
     - What are the computed styles?
     - Are there any crossed-out styles (indicating override)?
     - Is the text actually inside or outside the container in the DOM?

2. **Check Visibility Class Behavior**
   - The `import-visible` class uses `display: block !important`
   - This may be overriding the flex display on `.import-mode-option`
   - **Fix to try:**
     ```css
     .import-visible {
       display: flex !important;
     }
     ```
     Or use a different approach:
     ```css
     .import-hidden {
       visibility: hidden;
       height: 0;
       overflow: hidden;
     }
     .import-visible {
       visibility: visible;
       height: auto;
     }
     ```

3. **Test in Fresh Vault**
   - Create a new Obsidian vault
   - Install the plugin
   - Test the Import OPML modal
   - This rules out theme/plugin conflicts

### Code Changes to Try

#### Option A: Fix Visibility Classes

```css
/* Change from display-based to visibility-based */
.import-hidden {
  visibility: hidden !important;
  height: 0 !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
}

.import-visible {
  visibility: visible !important;
  height: auto !important;
}
```

#### Option B: Add Specific Override for Mode Selector

```css
/* Force flex display when visible */
.import-mode-selector.import-visible {
  display: block !important;
}

.import-mode-option {
  display: flex !important;
}
```

#### Option C: Use Obsidian's Built-in Setting Pattern

Instead of custom mode selector, use Obsidian's `Setting` class:

```typescript
new Setting(container)
  .setName("Import mode")
  .setDesc("Choose how to import feeds")
  .addDropdown((dropdown) => {
    dropdown.addOption("update", "Update (add new feeds)");
    dropdown.addOption("overwrite", "Overwrite (replace all)");
    dropdown.setValue(this.importMode);
    dropdown.onChange((value) => {
      this.importMode = value as "update" | "overwrite";
    });
  });
```

---

## Files Involved

| File                              | Purpose                              |
| --------------------------------- | ------------------------------------ |
| `src/modals/import-opml-modal.ts` | Modal TypeScript code                |
| `src/styles/modals.css`           | Modal CSS styles                     |
| `src/styles/index.css`            | CSS entry point (imports modals.css) |
| `styles.css`                      | Compiled CSS output                  |
| `main.js`                         | Compiled JavaScript output           |

---

## Related Issues

- None reported yet

---

## Notes

- The build process completes successfully with no errors
- ESLint passes with no issues
- The CSS is confirmed to be in the compiled `styles.css` file
- User has reloaded Obsidian multiple times
- Issue persists across all attempted fixes
