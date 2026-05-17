# Keyboard Shortcuts Implementation Plan

This is a working document for future implementation of keyboard shortcuts, heavily inspired by Inoreader.

Obsidian hotkey reference: https://obsidian.md/help/hotkeys

## Implementation Architecture

To ensure we do not conflict with normal Obsidian usage (e.g., typing in a Markdown note) while still offering rapid single-key navigation, shortcuts are divided into two technical categories:

1. **Global Commands**: Registered via Obsidian's `addCommand` API. These will be left **unbound by default** so users can assign their own preferences in Obsidian's `Settings > Hotkeys`.
2. **View-Scoped Hotkeys**: Hardcoded single-key presses bound using Obsidian's `Scope` API. These are active **only** when the RSS Dashboard or Reader view is currently focused.

---

## 1. Global Commands (Unbound by Default)

These actions can be triggered from anywhere in Obsidian. Users must configure them manually via the Command Palette.

- Open RSS Dashboard
- Refresh All Feeds
- Add New Feed
- Open Settings/Preferences

---

## 2. View-Scoped Hotkeys (Active Only in RSS Views)

These single-key shortcuts are safe because they are scoped to our custom views. If the user is editing a regular note, these keys will type normally. We will provide a plugin settings tab to remap these defaults if desired.

### General Navigation

- Open Help Dialog - `h`
- Close Dialog / Clear Selection - `Esc`
- Refresh Feed - `r`

### Dashboard View

- All articles - `Shift + 1`
- Unread articles - `Shift + 2`
- Read articles - `Shift + 3`
- List view - `1`
- Card view - `2`
- Feed view - `3`

### Reader View

- Scroll up/down - `ArrowUp` / `ArrowDown`
- Scroll left/right - `ArrowLeft` / `ArrowRight`
- Page up/down - `PageUp` / `PageDown`
- Jump to start/end of article - `Home` / `End`
- Increase font size - `+`
- Decrease font size - `-`
- Reset font size - `0`

### Article Manipulation

- Next article - `j` or `Space`
- Previous article - `k` or `Shift + Space`
- Card view navigation - `Left/Right/Up/Down`
- Open/Close article - `o` or `Enter`
- Mark as read/unread toggle - `m`
- Mark all as read - `Shift + a`
- Star/Unstar article - `f`
- Add tags to article - `t`
- Save full content to notes - `s`

### Sidebar Navigation

- Next item - `Shift + j`
- Previous item - `Shift + k`
- Focus next item - `Shift + n`
- Focus previous item - `Shift + p`
- Open focused item - `Shift + o`
- Open/Collapse folder - `Shift + x`
- Delete folder/feed - `Shift + d`
- Rename folder/feed - `Shift + r`

### Section Navigation

_(Note: Multi-chord key sequences like "g then d" are replaced with Shift modifiers to ensure compatibility with standard Obsidian hotkey handling)._

- Go to Dashboard - `Shift + d`
- Go to All articles - `Shift + v`
- Go to Starred - `Shift + s`
- Go to feed - `Shift + u`
- Go to folder/tag - `Shift + t`

---

You can open the shortcuts help menu inside the dashboard by pressing `h` on your keyboard.
