import { describe, expect, it } from "vitest";
import { loadAndNormalizeSettings } from "../../../src/utils/settings-loader";

describe("FreshRSS settings normalization", () => {
  it("defaults configured FreshRSS connections to two-way article-state sync", () => {
    const settings = loadAndNormalizeSettings({
      freshRss: {
        endpoint: "https://reader.example.test/api/greader.php",
        credentialReference: "fresh-rss-secret",
        status: "connected",
      },
    });

    expect(settings.freshRss.stateSyncMode).toBe("two-way");
  });

  it("preserves a saved FreshRSS Receive-only choice", () => {
    const settings = loadAndNormalizeSettings({
      freshRss: {
        endpoint: "https://reader.example.test/api/greader.php",
        credentialReference: "fresh-rss-secret",
        status: "connected",
        stateSyncMode: "receive-only",
      },
    });

    expect(settings.freshRss.stateSyncMode).toBe("receive-only");
  });
});
