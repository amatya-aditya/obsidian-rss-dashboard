export const FEED_REFRESH_DISABLED_INTERVAL = -1;

export const REFRESH_INTERVAL_PRESETS = [
  0, 5, 10, 15, 30, 60, 120, 240, 480, 720, 1440,
];

export function isPresetRefreshInterval(value: number): boolean {
  return REFRESH_INTERVAL_PRESETS.includes(value);
}

export function getPerFeedRefreshIntervalDropdownValue(value: number): string {
  if (value === FEED_REFRESH_DISABLED_INTERVAL) {
    return String(FEED_REFRESH_DISABLED_INTERVAL);
  }

  if (isPresetRefreshInterval(value)) {
    return String(value);
  }

  return "custom";
}
