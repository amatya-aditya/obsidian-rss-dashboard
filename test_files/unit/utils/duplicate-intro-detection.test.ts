// Duplicate-intro detection (#247 slice 2, ADR 0007 "Duplicate-intro
// suppression"): a description duplicates the article's opening when it matches
// exactly, or as a normalized prefix of at least 30 characters in either
// direction. On ambiguity the check does not flag.
import { describe, expect, it } from "vitest";
import {
  DUPLICATE_INTRO_MIN_PREFIX_LENGTH,
  isDuplicateIntro,
} from "../../../src/utils/duplicate-intro-detection";

const OPENING =
  "The council voted on Tuesday to approve the new harbor budget after months of debate";

describe("isDuplicateIntro", () => {
  describe("exact match", () => {
    it("flags text that differs only in markup, case, quotes and spacing", () => {
      expect(
        isDuplicateIntro("<p>Don’t   “stop”</p>", `<div>don't "STOP"</div>`),
      ).toBe(true);
    });

    it("flags a short exact match, since the prefix floor applies only to prefixes", () => {
      expect(isDuplicateIntro("<p>Desc</p>", "desc")).toBe(true);
    });

    it("does not flag different text", () => {
      expect(isDuplicateIntro("<p>one</p>", "<p>two</p>")).toBe(false);
      expect(isDuplicateIntro("a – b", "a - b")).toBe(false);
    });

    it("does not flag when either side has no text", () => {
      expect(isDuplicateIntro("", "")).toBe(false);
      expect(isDuplicateIntro("<p> </p>", "<br>")).toBe(false);
      expect(isDuplicateIntro("", OPENING)).toBe(false);
      expect(isDuplicateIntro(OPENING, "<p></p>")).toBe(false);
    });

    it("ignores script and style text", () => {
      expect(
        isDuplicateIntro(
          "<p>Hello</p><script>var z</script><style>p{}</style>",
          "hello",
        ),
      ).toBe(true);
    });
  });

  describe("prefix match", () => {
    it("flags a description that is the start of the article body", () => {
      expect(
        isDuplicateIntro(
          `<p>${OPENING}</p>`,
          `<p>${OPENING}. Members of the public lined up to speak.</p>`,
        ),
      ).toBe(true);
    });

    it("flags in either direction", () => {
      const longer = `${OPENING}. Members of the public lined up to speak.`;
      expect(isDuplicateIntro(OPENING, longer)).toBe(true);
      expect(isDuplicateIntro(longer, OPENING)).toBe(true);
    });

    it("looks through markup and block boundaries on the longer side", () => {
      expect(
        isDuplicateIntro(
          "The council voted on Tuesday to approve the new harbor budget",
          "<div><p>The council voted on Tuesday</p><p>to approve the new harbor budget and more</p></div>",
        ),
      ).toBe(true);
    });

    it("flags a prefix of exactly the minimum length but not one character fewer", () => {
      const body = "x".repeat(DUPLICATE_INTRO_MIN_PREFIX_LENGTH + 20);
      expect(
        isDuplicateIntro("x".repeat(DUPLICATE_INTRO_MIN_PREFIX_LENGTH), body),
      ).toBe(true);
      expect(
        isDuplicateIntro(
          "x".repeat(DUPLICATE_INTRO_MIN_PREFIX_LENGTH - 1),
          body,
        ),
      ).toBe(false);
    });

    it("does not flag a short opening that merely starts the body", () => {
      expect(
        isDuplicateIntro("Breaking news", `Breaking news: ${OPENING}`),
      ).toBe(false);
    });

    it("does not flag text that shares only the start", () => {
      expect(
        isDuplicateIntro(
          `${OPENING}, and then something else entirely`,
          `${OPENING}, followed by a different story`,
        ),
      ).toBe(false);
    });

    it("does not flag text that merely appears later in the body", () => {
      expect(
        isDuplicateIntro(
          OPENING,
          `Local news roundup. ${OPENING}. More below.`,
        ),
      ).toBe(false);
    });
  });

  describe("trailing ellipsis", () => {
    it.each(["…", "...", " …", "[…]", "[...]", " [ … ]", "....", "…..."])(
      "strips %j before comparing, so a truncated blurb matches the body",
      (ellipsis) => {
        expect(
          isDuplicateIntro(
            `<p>${OPENING}${ellipsis}</p>`,
            `${OPENING}. Members of the public lined up to speak.`,
          ),
        ).toBe(true);
      },
    );

    it("strips an ellipsis from the body side as well", () => {
      expect(isDuplicateIntro(OPENING, `${OPENING}…`)).toBe(true);
    });

    it("strips an ellipsis from an otherwise exact short match", () => {
      expect(isDuplicateIntro("Desc…", "Desc")).toBe(true);
    });

    it("leaves an ellipsis in the middle of the text", () => {
      expect(
        isDuplicateIntro(
          "The council voted … on Tuesday to approve the new harbor budget",
          `${OPENING}. Members of the public lined up to speak.`,
        ),
      ).toBe(false);
    });

    it("measures the prefix floor after the ellipsis is removed", () => {
      const short = "x".repeat(DUPLICATE_INTRO_MIN_PREFIX_LENGTH - 1);
      expect(isDuplicateIntro(`${short}…`, `${short}${"y".repeat(40)}`)).toBe(
        false,
      );
    });

    it("does not flag text that is only an ellipsis", () => {
      expect(isDuplicateIntro("…", OPENING)).toBe(false);
      expect(isDuplicateIntro("[...]", "...")).toBe(false);
    });
  });

  describe("lightly reworded near-duplicates", () => {
    it("does not flag one inserted word", () => {
      expect(
        isDuplicateIntro(
          "The council voted on Tuesday to approve the new harbor budget after months of debate",
          "The council voted on Tuesday to quickly approve the new harbor budget after months of debate",
        ),
      ).toBe(false);
    });

    it("does not flag one substituted word", () => {
      expect(
        isDuplicateIntro(
          "The council voted on Tuesday to approve the new harbor budget",
          "The council voted on Wednesday to approve the new harbor budget",
        ),
      ).toBe(false);
    });

    it("does not flag a reordered opening", () => {
      expect(
        isDuplicateIntro(
          "On Tuesday the council voted to approve the new harbor budget",
          "The council voted on Tuesday to approve the new harbor budget",
        ),
      ).toBe(false);
    });
  });
});
