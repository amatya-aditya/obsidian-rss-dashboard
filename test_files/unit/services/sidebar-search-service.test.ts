import { describe, expect, it } from "vitest";
import { SidebarSearchService } from "../../../src/services/sidebar-search-service";

describe("SidebarSearchService tag queries", () => {
  it.each(["tag:Saved", "tag:#Saved", " TAG: #SaVeD ", "tags:#Saved"])(
    "normalizes %s to a case-insensitive tag term",
    (raw) => {
      expect(SidebarSearchService.parseQuery(raw)).toMatchObject({
        scope: "tags",
        term: "saved",
      });
    },
  );

  it.each(["tag:", "tag:#", "tag: # "])(
    "treats %s as an empty, unfiltered query",
    (raw) => {
      const query = SidebarSearchService.parseQuery(raw);
      expect(query.term).toBe("");
      expect(SidebarSearchService.matchesTag(query, "Anything")).toBe(true);
      expect(SidebarSearchService.matchesFeed(query, "Any feed")).toBe(true);
      expect(SidebarSearchService.matchesFolder(query, "Any folder")).toBe(
        true,
      );
    },
  );

  it.each([
    ["tag:Saved", "Saved", true],
    ["tag:#sAv", "SAVED/later", true],
    ["tag:A", "A", true],
    ["tag:A", "About", true],
    ["tag:#a", "About", true],
    ["tag:Saved", "Unsaved", false],
    ["tag:A", "Read", false],
    ["tag:Sa*", "Saved", false],
    ["tag:Sa*", "Sa*ved", true],
    ["tag:Sa?", "Saved", false],
    ["tag:Sa?", "Sa?ved", true],
    ["tag:Save later", "Save for later", false],
    ["tag:Save later", "Save later/today", true],
  ])("matches %s against %s as a literal prefix: %s", (raw, tag, matches) => {
    expect(
      SidebarSearchService.matchesTag(
        SidebarSearchService.parseQuery(raw),
        tag,
      ),
    ).toBe(matches);
  });

  it("does not match feed or folder names for a nonempty tag query", () => {
    const query = SidebarSearchService.parseQuery("tag:Saved");
    expect(SidebarSearchService.matchesFeed(query, "Saved", "Saved")).toBe(
      false,
    );
    expect(SidebarSearchService.matchesFolder(query, "Saved", "Saved")).toBe(
      false,
    );
  });

  it("preserves unscoped substring matching and other search scopes", () => {
    expect(
      SidebarSearchService.matchesTag(
        SidebarSearchService.parseQuery("saved"),
        "Unsaved",
      ),
    ).toBe(true);
    expect(
      SidebarSearchService.matchesFeed(
        SidebarSearchService.parseQuery("feed:daily news"),
        "Daily technology news",
      ),
    ).toBe(true);
    expect(
      SidebarSearchService.matchesFolder(
        SidebarSearchService.parseQuery("path:read deep"),
        "Deep",
        "Reading/Deep",
      ),
    ).toBe(true);
    expect(SidebarSearchService.parseQuery("feed:#Saved").term).toBe("#saved");
    expect(SidebarSearchService.parseQuery("#Saved").term).toBe("#saved");
  });
});
