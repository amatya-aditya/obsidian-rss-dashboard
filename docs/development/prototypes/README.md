# Settings design prototypes

## RSS Dashboard 2.8 settings review

Open [settings-1819.html](./settings-1819.html) from a local checkout in a browser. The prototype is a standalone HTML file with sample settings and no build or server requirement.

- Use **Before** and **After** to compare the reviewed layouts in light and dark themes at three simulated viewport sizes: mobile (393 × 852 CSS px), touch tablet (800 × 1000), and narrow mouse-driven desktop (960 × 680).
- **Before** models the settings at dev commit `cfbc3a35533f1b612debee2c932236f183057d89`. **After** records the design reviewed for [issue #1819](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1819). The prototype covers General, Display, Sidebar, Media, Article saving, Highlights, Import/Export, and Tags. Storage, Rules, and About were reviewed as existing layouts and skipped in the prototype.
- Preview edits last for the page session. The prototype simulates settings actions with sample data. Follow the issue for implementation and real-device validation.

Keep this file as the 2.8 design snapshot. For later settings changes, maintain [Settings Rows and Inputs](../design-spec.md#settings-rows-and-inputs) and the relevant Obsidian verification evidence. Start a new prototype from this file when a future review needs one, and refresh the Before reference for the tabs under review.

## Settings row breakpoint

[settings-1819-breakpoint.html](./settings-1819-breakpoint.html) previews the pane-width breakpoint alone: the same rows at three pane widths under the previous `660px` rule and the shipped `400px` one, using live container queries rather than device flags. Open it beside a build when changing the reviewed rows' stacking rule.
