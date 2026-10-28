import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

// The copy-address control became a native <button> (#1478), so the mobile
// feed manager's blanket `.setting-item-control button { min-height: 44px }`
// reaches it and stretches the 32px square to 32x44. jsdom does not run the
// cascade, so the override is pinned as a stylesheet contract.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const SHEET = "feed-manager-modal.css";
const MOBILE_BUTTON =
  ".rss-mobile-feed-manager-modal .setting-item .setting-item-control button";
const COPY_BUTTON =
  ".rss-mobile-feed-manager-modal .setting-item .setting-item-control .rss-edit-feed-storage-copy-button";

function minHeightFor(selector: string): string | undefined {
  const sheet = postcss.parse(
    readFileSync(path.resolve(testDir, "../../../src/styles", SHEET), "utf-8"),
  );
  let value: string | undefined;
  sheet.walkRules((rule) => {
    const selectors = rule.selectors.map((s) => s.replace(/\s+/g, " ").trim());
    if (!selectors.includes(selector)) return;
    rule.walkDecls("min-height", (decl) => {
      value = decl.value;
    });
  });
  return value;
}

describe("edit-feed copy-address button on the mobile feed manager", () => {
  it("is out-ranked by a rule that keeps its 32px square", () => {
    expect(minHeightFor(MOBILE_BUTTON)).toBe("44px");
    expect(minHeightFor(COPY_BUTTON)).toBe("0");
  });
});
