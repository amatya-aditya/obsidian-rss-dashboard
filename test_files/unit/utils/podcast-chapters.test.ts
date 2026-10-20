import { describe, expect, it } from "vitest";
import {
  CHAPTER_TITLE_MAX_LENGTH,
  formatChapterTime,
  parsePodcastChapters,
  shortenChapterTitle,
} from "../../../src/utils/podcast-chapters";
import { CHAPTER_FIXTURES } from "../fixtures/podcast-chapters";

describe("parsePodcastChapters", () => {
  describe("accepted shapes", () => {
    it("reads one <p>(HH:MM:SS) – Title</p> per chapter, with a hyphen or en dash", () => {
      const html = [
        "<p>(00:00:00) - Cortés's conquest of the Aztecs</p>",
        "<p>(00:22:39) – Pizarro's conquest of the Inca</p>",
        "<p>(00:26:59) - Explaining Conquistador military superiority</p>",
      ].join("");

      expect(parsePodcastChapters(html)).toEqual([
        { start: 0, title: "Cortés's conquest of the Aztecs" },
        { start: 1359, title: "Pizarro's conquest of the Inca" },
        { start: 1619, title: "Explaining Conquistador military superiority" },
      ]);
    });

    it("reads (MM:SS) Title with no separator on newline-separated plain text", () => {
      const text = [
        "(00:00) Intro",
        "(02:45) What does it mean to reach poophoria?",
        "(04:37) Living in a poo-forward household",
      ].join("\n");

      expect(parsePodcastChapters(text)).toEqual([
        { start: 0, title: "Intro" },
        { start: 165, title: "What does it mean to reach poophoria?" },
        { start: 277, title: "Living in a poo-forward household" },
      ]);
    });

    it("ignores rule lines and trailing non-breaking spaces", () => {
      const html =
        "-----\n(00:00) Intro&nbsp;\n-----\n(02:19) Middle&nbsp;\n-----\n(10:03) End\n-----";

      expect(
        parsePodcastChapters(html).map((chapter) => chapter.title),
      ).toEqual(["Intro", "Middle", "End"]);
    });

    it("reads <li> items that end in (HH:MM:SS), keeping link text and decoding entities", () => {
      const html = [
        "<ul>",
        "<li>Chris welcomes <a href='#'>Eric Pan</a> to the show. (00:00:15)</li>",
        "<li>Seeed&rsquo;s earliest projects. (00:02:45)</li>",
        "<li>Inside <strong>Intel</strong>. (00:05:30)</li>",
        "</ul>",
      ].join("");

      expect(parsePodcastChapters(html)).toEqual([
        { start: 15, title: "Chris welcomes Eric Pan to the show." },
        { start: 165, title: "Seeed’s earliest projects." },
        { start: 330, title: "Inside Intel." },
      ]);
    });

    it("accepts m:ss, mm:ss, [brackets], em dash, colon and <br> line breaks", () => {
      const html =
        "[0:00] First<br>[12:30] Second<br>[1:02:03]: Third<br>[2:00:00] — Fourth";

      expect(parsePodcastChapters(html)).toEqual([
        { start: 0, title: "First" },
        { start: 750, title: "Second" },
        { start: 3723, title: "Third" },
        { start: 7200, title: "Fourth" },
      ]);
    });

    it("accepts a first chapter that is not 0:00", () => {
      const html = "(00:00:15) Start\n(00:02:45) Middle\n(00:05:30) End";

      expect(
        parsePodcastChapters(html).map((chapter) => chapter.start),
      ).toEqual([15, 165, 330]);
    });

    it("keeps a long title intact (the UI shortens it later)", () => {
      const title = `${"A very long sentence ".repeat(10)}end`;
      const html = `(00:00) ${title}\n(00:01) Two\n(00:02) Three`;

      expect(parsePodcastChapters(html)[0]?.title).toBe(title.trim());
    });
  });

  describe("rejections", () => {
    it("returns no chapters with fewer than three timestamps", () => {
      expect(parsePodcastChapters("(00:00) One\n(00:01) Two")).toEqual([]);
    });

    it("returns no chapters when the timestamps are not strictly ascending", () => {
      expect(
        parsePodcastChapters("(00:00) One\n(00:05) Two\n(00:03) Three"),
      ).toEqual([]);
      expect(
        parsePodcastChapters("(00:00) One\n(00:00) Two\n(00:01) Three"),
      ).toEqual([]);
    });

    it("ignores a timestamp that is inside a line of prose", () => {
      expect(
        parsePodcastChapters(
          "<p>The story of New Year's Eve in (2:46) Times Square.</p>",
        ),
      ).toEqual([]);
    });

    it("ignores runtime lines such as 'runs 45:00'", () => {
      expect(
        parsePodcastChapters("This episode runs 45:00.\nAnother line."),
      ).toEqual([]);
    });

    it("ignores the Science Vs instruction line that names 00:00", () => {
      const html = [
        "Time stamp and titles for each chapter (first chapter must start at 00:00, minimum 3 chapters)",
        "(00:00) Intro",
        "(02:45) Middle",
        "(04:37) End",
      ].join("\n");

      expect(parsePodcastChapters(html)).toHaveLength(3);
    });

    it("needs the title on the same line as the time", () => {
      expect(parsePodcastChapters("(00:00)\n(00:01)\n(00:02)")).toEqual([]);
    });

    it("drops timestamps at or past a supplied duration", () => {
      const html =
        "(00:00) One\n(00:05) Two\n(00:10) Three\n(00:20) Four\n(00:30) Five";

      expect(
        parsePodcastChapters(html, 12).map((chapter) => chapter.start),
      ).toEqual([0, 5, 10]);
    });

    it("returns no list when the duration filter leaves fewer than three", () => {
      expect(
        parsePodcastChapters("(00:00) One\n(00:05) Two\n(00:20) Three", 10),
      ).toEqual([]);
    });

    it("ignores an unknown or non-finite duration", () => {
      const html = "(00:00) One\n(00:05) Two\n(00:10) Three";
      expect(parsePodcastChapters(html, null)).toHaveLength(3);
      expect(parsePodcastChapters(html, Number.POSITIVE_INFINITY)).toHaveLength(
        3,
      );
      expect(parsePodcastChapters(html, Number.NaN)).toHaveLength(3);
    });
  });

  describe("fixture corpus (AC-004)", () => {
    it.each(CHAPTER_FIXTURES)(
      "parses $feed as expected",
      ({ excerpt, duration, expected }) => {
        expect(parsePodcastChapters(excerpt, duration)).toEqual(expected);
      },
    );
  });
});

describe("chapter formatting", () => {
  it("formats m:ss below an hour and h:mm:ss from an hour", () => {
    expect(formatChapterTime(0)).toBe("0:00");
    expect(formatChapterTime(754)).toBe("12:34");
    expect(formatChapterTime(3723)).toBe("1:02:03");
  });

  it("shortens a sentence-length title with an ellipsis", () => {
    const long = "word ".repeat(60).trim();
    const shortened = shortenChapterTitle(long);
    expect(shortened.length).toBeLessThanOrEqual(CHAPTER_TITLE_MAX_LENGTH);
    expect(shortened.endsWith("…")).toBe(true);
  });

  it("leaves a short title alone", () => {
    expect(shortenChapterTitle("  Intro  ")).toBe("Intro");
  });
});
