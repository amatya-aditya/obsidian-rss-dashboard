# Proxy Refactor Plan

The goal is to allow users to easily select from the built-in fallback proxy URLs inside the "Enable CORS proxy" settings, instead of having to look them up.

## Proposed Changes

### Settings Tab UI Update

#### [MODIFY] `src/settings/settings-tab.ts`
- Update the "Proxy URL" setting section under `if (this.plugin.settings.corsProxyEnabled)`.
- Change this setting to include a proxy template dropdown **above** or **next to** the text field.
- The dropdown will include:
  - Predefined fallback proxies (AllOrigins, CodeTabs, Isomorphic-Git, ThingProxy, RSS2JSON).
  - A persistent "Add new Proxy URL..." option at the bottom.
- Give the setting a "Save" icon button and a "Clear" icon button.
- When a user selects a predefined proxy, the text field updates immediately.
- The "Save" icon only appears when "Add new Proxy URL..." is selected.
- Style the setting to be responsive (stack vertically on mobile).

### [Styles] `src/styles/settings.css`
- Add responsive CSS for `.rss-proxy-setting-item` to stack elements vertically on mobile/tablet.

## Verification Plan

### Automated Tests
- `npm run build` to verify code correctness.

### Manual Verification
- Resize browser window/Obsidian window to verify vertical stacking.
- Select "Add new proxy URL..." and verify the save icon appears.
- Click "Clear" and verify the text field is emptied.
- Select different predefined proxies and verify the text field updates.
