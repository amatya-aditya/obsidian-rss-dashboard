// The cover-image fetch reads only a page's head (#1702). The plugin builds its
// PageCoverImageService in main.ts, which a unit test cannot construct, so this
// pins the one line that decides which page read the service gets: the full
// article read parsed every page with Readability on the main thread and froze
// Obsidian during a bulk run.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const main = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../main.ts"),
  "utf8",
);

describe("PageCoverImageService wiring in main.ts (#1702)", () => {
  const start = main.indexOf("new PageCoverImageService(");
  const end = main.indexOf("this.feedRefreshRunner = new FeedRefreshRunner(");
  const construction = main.slice(start, end);

  it("builds the service", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("reads each page through the metadata-only fetch, not the full article fetch", () => {
    expect(construction).toContain("fetchPageMetadataWithOutcome(");
    expect(construction).not.toContain("fetchFullArticleContentWithOutcome");
  });
});
