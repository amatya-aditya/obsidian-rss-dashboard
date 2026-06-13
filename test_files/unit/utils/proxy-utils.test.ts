import { describe, it, expect } from "vitest";
import { PREDEFINED_PROXIES } from "../../../src/utils/proxy-utils";

describe("Proxy Utils", () => {
  describe("PREDEFINED_PROXIES", () => {
    it("should export an array of predefined proxies", () => {
      expect(Array.isArray(PREDEFINED_PROXIES)).toBe(true);
      expect(PREDEFINED_PROXIES.length).toBeGreaterThan(0);
    });

    it("should contain proxy objects with label and url properties", () => {
      PREDEFINED_PROXIES.forEach((proxy) => {
        expect(proxy).toHaveProperty("label");
        expect(typeof proxy.label).toBe("string");
        expect(proxy.label.length).toBeGreaterThan(0);

        expect(proxy).toHaveProperty("url");
        expect(typeof proxy.url).toBe("string");
        expect(proxy.url.length).toBeGreaterThan(0);
      });
    });

    it("should contain known predefined proxies like AllOrigins and CodeTabs", () => {
      const labels = PREDEFINED_PROXIES.map((p) => p.label);
      expect(labels).toContain("AllOrigins (Raw)");
      expect(labels).toContain("CodeTabs");
      expect(labels).toContain("RSS2JSON");
    });

    it("should have RSS2JSON as the last proxy in the list (fallback mechanism)", () => {
      const lastProxy = PREDEFINED_PROXIES[PREDEFINED_PROXIES.length - 1];
      expect(lastProxy.label).toBe("RSS2JSON");
      expect(lastProxy.url).toContain("api.rss2json.com");
    });
  });
});
