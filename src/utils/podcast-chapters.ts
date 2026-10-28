/**
 * Chapter list parsing for the podcast player (#1374).
 *
 * The only chapter source is the episode's notes text, which is what the
 * details panel renders (`selectEpisodeNotesHtml`). The parser is pure and
 * deliberately isolated behind `parsePodcastChapters` so a later ticket can
 * add Podcasting 2.0 `<podcast:chapters>` JSON ahead of it (DEC-001).
 *
 * Shapes seen in real feeds:
 * - `<p>(HH:MM:SS) - Title</p>` (Dwarkesh)
 * - `(MM:SS) Title` on newline-separated plain text (Science Vs, FSMI, Huberman)
 * - `<li>Sentence with a <a>link</a>. (HH:MM:SS)</li>` (The Amp Hour)
 * - `(m:ss) &#8211; Title<br />` (Lex Fridman)
 *
 * A line has to lead with the time, or end with a wrapped time after the
 * title. A timestamp inside a line of prose is not a chapter (DEC-004).
 */

/** One chapter: its start in seconds and its title as plain text. */
export interface PodcastChapter {
  /** Start offset in seconds from the beginning of the audio. */
  start: number;
  /** Plain-text title, HTML removed and entities decoded. */
  title: string;
}

/** The minimum number of ascending timestamps a list needs (DEC-005). */
const MIN_CHAPTERS = 3;

/** Block boundaries that end a line in the notes HTML (DEC-003). */
const BLOCK_BOUNDARY =
  /<\/?(?:p|br|li|ul|ol|div|h[1-6]|tr|td|th|blockquote|section|article)\b[^>]*>/gi;

const INLINE_TAG = /<[^>]*>/g;
const CDATA_MARKER = /<!\[CDATA\[|\]\]>/g;

/** `-----`, `***`, `___` and similar separator-only lines carry no chapter. */
const SEPARATOR_ONLY = /^[\s\-–—_*=.~|]+$/;

/**
 * A line that starts with a time: `m:ss`, `mm:ss` or `h:mm:ss`, optionally
 * wrapped in parentheses or brackets, then an optional `-`, `–`, `—` or `:`
 * separator, then the title.
 */
const LEADING_TIME =
  /^[([]?\s*(\d{1,4}):([0-5]\d)(?::([0-5]\d))?\s*[)\]]?\s*(?:[-–—:]\s*)?(.*)$/;

/**
 * A line that ends with a wrapped time after its title. The wrapper is
 * required here so prose such as "runs 45:00" does not become a chapter.
 */
const TRAILING_TIME =
  /^(.*)\s*[([]\s*(\d{1,4}):([0-5]\d)(?::([0-5]\d))?\s*[)\]]\s*$/;

/**
 * A bare trailing time after an explicit separator, as in `Title - 12:30`.
 * The separator is what keeps runtime prose such as "runs 45:00" out.
 */
const TRAILING_TIME_AFTER_SEPARATOR =
  /^(.*?)\s*[-–—:]\s*(\d{1,4}):([0-5]\d)(?::([0-5]\d))?\s*$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  mdash: "—",
  middot: "·",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  trade: "™",
};

/** Decode the entities feeds use in notes, including numeric ones. */
function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Turn one raw block into a single readable line: strip tags, decode entities
 * (twice, because some feeds double-encode), and collapse whitespace,
 * including non-breaking spaces.
 */
function toPlainLine(raw: string): string {
  const withoutTags = raw.replace(CDATA_MARKER, " ").replace(INLINE_TAG, "");
  const decoded = decodeEntities(decodeEntities(withoutTags));
  return decoded
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert the matched time parts to seconds, whichever shape matched. */
function toSeconds(first: string, second: string, third?: string): number {
  const a = Number.parseInt(first, 10);
  const b = Number.parseInt(second, 10);
  if (third === undefined) return a * 60 + b;
  const c = Number.parseInt(third, 10);
  return a * 3600 + b * 60 + c;
}

/** Parse one plain-text line into a chapter, if it is one. */
function parseLine(text: string): PodcastChapter | null {
  const leading = LEADING_TIME.exec(text);
  if (leading) {
    const title = (leading[4] ?? "").trim();
    if (title) {
      return {
        start: toSeconds(leading[1] ?? "", leading[2] ?? "", leading[3]),
        title,
      };
    }
  }

  const trailing = TRAILING_TIME.exec(text);
  if (trailing) {
    const title = (trailing[1] ?? "").replace(/[\s\-–—:]+$/g, "").trim();
    if (title) {
      return {
        start: toSeconds(trailing[2] ?? "", trailing[3] ?? "", trailing[4]),
        title,
      };
    }
  }

  const separated = TRAILING_TIME_AFTER_SEPARATOR.exec(text);
  if (separated) {
    const title = (separated[1] ?? "").trim();
    if (title) {
      return {
        start: toSeconds(separated[2] ?? "", separated[3] ?? "", separated[4]),
        title,
      };
    }
  }

  return null;
}

/**
 * Read the chapter list from an episode's notes text.
 *
 * Returns an empty list unless at least three strictly ascending timestamps
 * remain. When `duration` is a finite positive number, timestamps at or past
 * it are dropped first, because they cannot mark a point inside the audio.
 */
export function parsePodcastChapters(
  notesHtml: string,
  duration?: number | null,
): PodcastChapter[] {
  if (!notesHtml) return [];

  const candidates: PodcastChapter[] = [];
  const blocks = notesHtml
    .split(BLOCK_BOUNDARY)
    .flatMap((block) => block.split(/\r?\n/));
  for (const rawLine of blocks) {
    const line = toPlainLine(rawLine);
    if (!line || SEPARATOR_ONLY.test(line)) continue;
    const chapter = parseLine(line);
    if (chapter) candidates.push(chapter);
  }

  const limit =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? duration
      : null;
  const chapters =
    limit === null
      ? candidates
      : candidates.filter((chapter) => chapter.start < limit);

  if (chapters.length < MIN_CHAPTERS) return [];

  for (let index = 1; index < chapters.length; index += 1) {
    const previous = chapters[index - 1];
    const current = chapters[index];
    if (!previous || !current || current.start <= previous.start) return [];
  }

  return chapters;
}

/** `m:ss`, or `h:mm:ss` once the chapter is an hour or longer. */
export function formatChapterTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const padded = secs.toString().padStart(2, "0");
  if (hours > 0)
    return `${hours}:${minutes.toString().padStart(2, "0")}:${padded}`;
  return `${minutes}:${padded}`;
}

/** Shorten a chapter title for the one-line label and the preview (U-002). */
export const CHAPTER_TITLE_MAX_LENGTH = 120;

export function shortenChapterTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= CHAPTER_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, CHAPTER_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}
