# Add flexible date formatting to templates

**Addresses**: [GH Issue #102](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/102)

## Current Behavior (Before)
Currently, users are restricted to two hardcoded date variables when creating templates in `article-saver.ts`:
- `{{date}}`: Returns a fixed long format (e.g., "16 April 2026" via `toLocaleDateString`).
- `{{isoDate}}` / `{{isoDateTime}}`: Returns the full ISO string.

**The Problem**:
Users are unable to modify these formats. This is particularly problematic for YAML frontmatter, where specific formats (like `YYYY-MM-DD`) are often required by Obsidian or other plugins for effective organization and querying (e.g., Dataview). The hardcoded nature of these fields in `applyTemplate` and `generateFrontmatter` provides no flexibility for different user preferences.

## Proposed Changes

### article-saver.ts
- [MODIFY] [article-saver.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/article-saver.ts)
    - Import `moment` from `obsidian`.
    - Implement a private helper method `replaceDatePlaceholders(text: string, date: Date): string`.
    - This helper will:
        - Replace `{{date}}` with the current long format (for backward compatibility).
        - Replace `{{isoDate}}`, `{{isoDateTime}}` with ISO strings.
        - Replace `{{dateShort}}` with `YYYY-MM-DD` (shorthand for a common requirement).
        - Use regex to find and replace `{{date:FORMAT}}` using `moment(date).format(FORMAT)`, allowing arbitrary Moment.js format strings.
    - Update `generateFrontmatter` to use this helper.
    - Update `applyTemplate` to use this helper.

### article-saving-settings-tab.ts
- [MODIFY] [article-saving-settings-tab.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/settings/tabs/article-saving-settings-tab.ts)
    - Update the help text below the template input box to list variables on separate lines.
    - Include new date variables: `{{dateShort}}` and `{{date:FORMAT}}`.
    - Format the help text to be more readable and descriptive.

## Verification Plan

### Manual Verification
- Testing with a template that includes `{{dateShort}}`.
- Testing with a template that includes `{{date:YYYY/MM/DD}}`.
- Testing with a template that includes `{{date:dddd, MMMM Do YYYY}}`.
- Ensuring existing `{{date}}` and `{{isoDate}}` still work as expected.

### Automated Tests
- Update `test_files/unit/services/article-saver.test.ts` to include a test suite specifically for date formatting placeholders, covering both the new shorthands and parameterized formats.
