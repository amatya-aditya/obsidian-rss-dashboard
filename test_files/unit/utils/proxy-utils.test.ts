import { describe, it, expect } from "vitest";
import {
  PREDEFINED_PROXIES,
  resolveProxyPrefixes,
} from "../../../src/utils/proxy-utils";

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

  describe("resolveProxyPrefixes", () => {
    it("expands auto to the whole built-in list", () => {
      expect(resolveProxyPrefixes("auto")).toEqual(
        PREDEFINED_PROXIES.map((proxy) => proxy.url),
      );
    });

    it("leaves proxies that wrap the page in JSON out when the raw body is needed", () => {
      const prefixes = resolveProxyPrefixes("auto", { rawBodyOnly: true });

      expect(prefixes.length).toBeGreaterThan(0);
      expect(prefixes).not.toContain("https://api.allorigins.win/get?url=");
      expect(prefixes.some((prefix) => prefix.includes("rss2json"))).toBe(
        false,
      );
    });

    it("returns a custom proxy URL unchanged", () => {
      expect(resolveProxyPrefixes("https://proxy.example.com/?url=")).toEqual([
        "https://proxy.example.com/?url=",
      ]);
    });
  });
});
