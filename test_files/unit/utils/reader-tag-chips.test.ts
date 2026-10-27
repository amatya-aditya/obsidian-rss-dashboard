import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderReaderTagChips } from "../../../src/utils/reader-tag-chips";
import {
  DEFAULT_TAG_COLOR,
  DEFAULT_TAG_TEXT_COLOR,
} from "../../../src/utils/tag-colors";

describe("reader-tag-chips", () => {
  let header: HTMLElement;

  beforeEach(() => {
    header = createDiv();
    document.body.appendChild(header);
  });

  afterEach(() => {
    document.body.empty();
  });

  it("renders registry overrides and inherited defaults without changing article tags", () => {
    const tags = [
      { name: "Registered", color: "#stale", textColor: "#stale" },
      { name: "Inheriting", color: "#stale", textColor: "#stale" },
      { name: "Orphan", color: "#123456", textColor: "#654321" },
      { name: "New" },
    ];

    renderReaderTagChips(header, tags, {
      availableTags: [
        { name: "Registered", color: "#234567", textColor: "#765432" },
        { name: "Inheriting" },
      ],
    });

    const chips = header.querySelectorAll<HTMLElement>(".rss-reader-tag");
    expect(
      Array.from(chips, (chip) => [
        chip.style.getPropertyValue("--tag-color"),
        chip.style.getPropertyValue("--tag-text-color"),
      ]),
    ).toEqual([
      ["#234567", "#765432"],
      [DEFAULT_TAG_COLOR, DEFAULT_TAG_TEXT_COLOR],
      ["#123456", "#654321"],
      [DEFAULT_TAG_COLOR, DEFAULT_TAG_TEXT_COLOR],
    ]);
    expect(tags[0]).toEqual({
      name: "Registered",
      color: "#stale",
      textColor: "#stale",
    });
  });
});
