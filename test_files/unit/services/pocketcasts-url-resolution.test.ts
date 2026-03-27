import { describe, it, expect } from "vitest";
import { POCKET_CASTS } from "../../../src/utils/podcast-platforms";

describe("Podcast Platform - Pocket Casts", () => {
  it("should detect Pocket Casts URLs", () => {
    expect(POCKET_CASTS.detect("https://pocketcasts.com/podcast/ai-news-strategy-daily-with-nate-b-jones/de9c9840-ecd2-013e-ea22-0acc26574db2")).toBe(true);
    expect(POCKET_CASTS.detect("https://pocketcasts.com/podcast/no-priors-artificial-intelligence-technology-startups/b87d28b0-81ba-013b-f2c6-0acc26574db2")).toBe(true);
    
    // Should not detect other platforms
    expect(POCKET_CASTS.detect("https://podcasts.apple.com/us/podcast/id12345")).toBe(false);
    expect(POCKET_CASTS.detect("https://open.spotify.com/show/5VzFvh1JlEhBMS6ZHZ8CNO")).toBe(false);
    expect(POCKET_CASTS.detect("https://example.com")).toBe(false);
  });

  it("should extract UUID from Pocket Casts URLs", () => {
    expect(POCKET_CASTS.extractId("https://pocketcasts.com/podcast/ai-news-strategy-daily-with-nate-b-jones/de9c9840-ecd2-013e-ea22-0acc26574db2")).toBe("de9c9840-ecd2-013e-ea22-0acc26574db2");
    expect(POCKET_CASTS.extractId("https://pocketcasts.com/podcast/no-priors-artificial-intelligence-technology-startups/b87d28b0-81ba-013b-f2c6-0acc26574db2")).toBe("b87d28b0-81ba-013b-f2c6-0acc26574db2");
  });

  it("should return null for malformed URLs when extracting", () => {
    expect(POCKET_CASTS.extractId("https://pocketcasts.com/podcast/invalid-format-without-uuid")).toBeNull();
    expect(POCKET_CASTS.extractId("https://pocketcasts.com/some-other-page")).toBeNull();
  });
});
