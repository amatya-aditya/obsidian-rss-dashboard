type ElapsedTime = {
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
  weeks: number;
  months: number;
  years: number;
};

function getElapsedTime(diffInMs: number): ElapsedTime {
  const seconds = Math.floor(diffInMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  return { seconds, minutes, hours, days, weeks, months, years };
}

function selectRelativeTimeUnit(elapsed: ElapsedTime) {
  const candidates = [
    { amount: elapsed.years, unit: "year" },
    { amount: elapsed.months, unit: "month" },
    { amount: elapsed.weeks, unit: "week" },
    { amount: elapsed.days, unit: "day" },
    { amount: elapsed.hours, unit: "hour" },
    { amount: elapsed.minutes, unit: "minute" },
    { amount: elapsed.seconds, unit: "second" },
  ] as const;

  return candidates.find(({ amount }) => amount > 0) ?? candidates[6];
}

function formatWithIntl(elapsed: ElapsedTime): string | null {
  if (typeof Intl === "undefined" || !Intl.RelativeTimeFormat) {
    return null;
  }

  try {
    const rtf = new Intl.RelativeTimeFormat("en", {
      numeric: "auto",
      style: "long",
    });
    const { amount, unit } = selectRelativeTimeUnit(elapsed);
    return rtf.format(-amount, unit);
  } catch {
    // Fall through to manual formatting if Intl.RelativeTimeFormat fails.
    return null;
  }
}

function formatManually(elapsed: ElapsedTime): string {
  const { amount, unit } = selectRelativeTimeUnit(elapsed);
  if (unit === "second") {
    return "Just now";
  }

  return `${amount} ${unit}${amount > 1 ? "s" : ""} ago`;
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const targetDate = typeof date === "string" ? new Date(date) : date;

  if (isNaN(targetDate.getTime())) {
    return "Invalid date";
  }

  if (now.toDateString() === targetDate.toDateString()) {
    return "Today";
  }

  const diffInMs = now.getTime() - targetDate.getTime();

  // Handle future dates - treat as "Just now" to avoid confusing output
  // like "in 6,638,873 seconds"
  if (diffInMs < 0) {
    return "Just now";
  }

  const elapsed = getElapsedTime(diffInMs);
  return formatWithIntl(elapsed) ?? formatManually(elapsed);
}
