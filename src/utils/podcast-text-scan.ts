// Text scanners for podcast descriptions. Each one returns the same result as
// the regular expression it replaces, but keeps a single forward position so a
// long description is read once instead of being rescanned from every
// occurrence of a tag name, label or digit.

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg", ".opus", ".aac", ".flac"];

// Lowercases ASCII letters only. String.prototype.toLowerCase would also fold
// or lengthen some non-ASCII characters, which the original case-insensitive
// patterns never matched and which would shift the offsets used for slicing.
function foldAscii(text: string): string {
  return text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
}

function isDigitAt(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  return code >= 48 && code <= 57;
}

function skipDigits(text: string, index: number): number {
  let end = index;
  while (isDigitAt(text, end)) end++;
  return end;
}

function findDigit(text: string, from: number): number {
  let index = from;
  while (index < text.length && !isDigitAt(text, index)) index++;
  return index < text.length ? index : -1;
}

function findQuote(text: string, from: number): number {
  for (let index = from; index < text.length; index++) {
    const char = text[index];
    if (char === '"' || char === "'") return index;
  }
  return -1;
}

// Reads the quoted value that follows an attribute name at `nameStart`, and
// returns it when it ends in an audio file extension.
function readAudioValue(
  text: string,
  lower: string,
  nameStart: number,
  name: string,
): string | undefined {
  const quoteIndex = nameStart + name.length;
  if (text[quoteIndex] !== '"' && text[quoteIndex] !== "'") return undefined;
  const valueStart = quoteIndex + 1;
  const valueEnd = findQuote(text, valueStart);
  if (valueEnd < 0) return undefined;
  const hasAudioExtension = AUDIO_EXTENSIONS.some((extension) => {
    const extensionStart = valueEnd - extension.length;
    return extensionStart >= valueStart && lower.startsWith(extension, extensionStart);
  });
  return hasAudioExtension ? text.slice(valueStart, valueEnd) : undefined;
}

// First quoted audio value for `name` (for example `href=`) anywhere in the text.
function findAudioAttribute(text: string, lower: string, name: string): string | undefined {
  let nameStart = lower.indexOf(name);
  while (nameStart >= 0) {
    const value = readAudioValue(text, lower, nameStart, name);
    if (value !== undefined) return value;
    nameStart = lower.indexOf(name, nameStart + 1);
  }
  return undefined;
}

// Audio value for `name` inside the first `<tag ...>` that has one. Within a
// tag the last matching attribute wins, and a tag with none is skipped along
// with every later tag opening that starts before its closing `>`.
function findAudioInTag(
  text: string,
  lower: string,
  tag: string,
  name: string,
): string | undefined {
  let tagStart = lower.indexOf(tag);
  let nextName = -1;
  while (tagStart >= 0) {
    const attributesStart = tagStart + tag.length;
    const close = text.indexOf(">", attributesStart);
    const limit = close < 0 ? text.length : close;

    if (nextName >= 0 && nextName < attributesStart) nextName = -1;
    if (nextName < 0) nextName = lower.indexOf(name, attributesStart);
    if (nextName < 0) return undefined;

    let found: string | undefined;
    while (nextName >= 0 && nextName <= limit) {
      found = readAudioValue(text, lower, nextName, name) ?? found;
      nextName = lower.indexOf(name, nextName + 1);
    }
    if (found !== undefined) return found;
    if (close < 0) return undefined;
    tagStart = lower.indexOf(tag, close + 1);
  }
  return undefined;
}

export function findPodcastAudioUrl(description: string): string | undefined {
  const lower = foldAscii(description);
  return (
    findAudioInTag(description, lower, "<enclosure", "url=") ??
    findAudioInTag(description, lower, "<audio", "src=") ??
    findAudioAttribute(description, lower, "href=") ??
    findAudioInTag(description, lower, "<source", "src=")
  );
}

interface ClockScan {
  // End of the leading digit run; scanning may resume here after a miss.
  hoursEnd: number;
  // End of the `h:m` or `h:m:s` clock, or -1 when there is none.
  clockEnd: number;
}

// Reads `digits:digits` with an optional `:digits` starting at `start`.
function scanClock(text: string, start: number): ClockScan {
  const hoursEnd = skipDigits(text, start);
  if (text[hoursEnd] !== ":") return { hoursEnd, clockEnd: -1 };
  const minutesEnd = skipDigits(text, hoursEnd + 1);
  if (minutesEnd === hoursEnd + 1) return { hoursEnd, clockEnd: -1 };
  if (text[minutesEnd] === ":") {
    const secondsEnd = skipDigits(text, minutesEnd + 1);
    if (secondsEnd > minutesEnd + 1) return { hoursEnd, clockEnd: secondsEnd };
  }
  return { hoursEnd, clockEnd: minutesEnd };
}

// The first clock that follows a label such as "duration", with only
// non-digit characters between them.
function findLabelledClock(text: string, lower: string, label: string): string | undefined {
  let labelStart = lower.indexOf(label);
  while (labelStart >= 0) {
    const digitStart = findDigit(text, labelStart + label.length);
    if (digitStart < 0) return undefined;
    const clock = scanClock(text, digitStart);
    if (clock.clockEnd >= 0) return text.slice(digitStart, clock.clockEnd);
    // Later labels before this digit reach the same digit, so start after it.
    labelStart = lower.indexOf(label, digitStart);
  }
  return undefined;
}

// The first clock that is followed by "min", "mins" or "minutes".
function findClockBeforeMinutes(text: string): string | undefined {
  const minutes = /\s*min/iy;
  let digitStart = findDigit(text, 0);
  while (digitStart >= 0) {
    const clock = scanClock(text, digitStart);
    if (clock.clockEnd >= 0) {
      minutes.lastIndex = clock.clockEnd;
      if (minutes.test(text)) return text.slice(digitStart, clock.clockEnd);
    }
    // Digits inside this run lead to the same clock, so resume after it.
    digitStart = findDigit(text, clock.hoursEnd);
  }
  return undefined;
}

export function findPodcastDuration(description: string): string | undefined {
  const lower = foldAscii(description);
  return (
    findLabelledClock(description, lower, "duration") ??
    findLabelledClock(description, lower, "length") ??
    findLabelledClock(description, lower, "time") ??
    findClockBeforeMinutes(description)
  );
}