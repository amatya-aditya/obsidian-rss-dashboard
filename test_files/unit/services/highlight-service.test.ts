import { vi, describe, it, expect, beforeEach } from "vitest";
import { HighlightService } from "../../../src/services/highlight-service";
import { HighlightSettings } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

describe("HighlightService", () => {
  let settings: HighlightSettings;
  let service: HighlightService;

  beforeEach(() => {
    settings = {
      enabled: true,
      defaultColor: "#ffff00",
      highlightInContent: true,
      highlightInTitles: true,
      highlightInSummaries: true,
      words: [
        {
          id: "1",
          text: "important",
          enabled: true,
          wholeWord: false,
          caseSensitive: false,
          createdAt: Date.now(),
        },
        {
          id: "2",
          text: "Critical",
          enabled: true,
          wholeWord: true,
          caseSensitive: true,
          color: "#ff0000",
          createdAt: Date.now(),
        },
      ],
    };
    service = new HighlightService(settings);
  });

  describe("highlightText (String Output)", () => {
    it("should return original text if highlighting is disabled", () => {
      settings.enabled = false;
      const text = "This is important text.";
      expect(service.highlightText(text)).toBe(text);
    });

    it("should return original text if no match is found", () => {
      const text = "This has nothing to highlight.";
      expect(service.highlightText(text)).toBe(text);
    });

    it("should highlight case-insensitive partial words by default", () => {
      const text = "Very ImPoRtAnT things to read.";
      const result = service.highlightText(text);
      expect(result).toContain("<mark class=\"rss-highlight\" style=\"--highlight-color: #ffff00\">ImPoRtAnT</mark>");
    });

    it("should highlight case-sensitive whole words correctly", () => {
      // "Critical" matches text, but "critical" should not, and "Critically" shouldn't (whole word)
      const text = "A Critical situation, very critical indeed. Critically speaking.";
      const result = service.highlightText(text);
      expect(result).toContain("<mark class=\"rss-highlight\" style=\"--highlight-color: #ff0000\">Critical</mark>");
      expect(result).not.toContain("<mark class=\"rss-highlight\" style=\"--highlight-color: #ff0000\">critical</mark>");
      expect(result).not.toContain("<mark class=\"rss-highlight\" style=\"--highlight-color: #ff0000\">Critically</mark>");
    });
  });

  describe("setHighlightedText (DOM Manipulation)", () => {
    it("should set textContent if highlighting is disabled", () => {
      settings.enabled = false;
      const el = document.createElement("div");
      service.setHighlightedText(el, "Important text");
      expect(el.innerHTML).toBe("Important text");
    });

    it("should append <mark> elements for matches", () => {
      const el = document.createElement("div");
      service.setHighlightedText(el, "This is important!");
      expect(el.childNodes.length).toBe(3); // text + mark + text
      const mark = el.querySelector("mark");
      expect(mark).not.toBeNull();
      expect(mark?.textContent).toBe("important");
      expect(mark?.style.getPropertyValue("--highlight-color")).toBe("#ffff00");
    });
  });

  describe("highlightElement (TreeWalker DOM Traversal)", () => {
    it("should traverse and highlight text nodes within DOM", () => {
      const container = document.createElement("div");
      container.innerHTML = `<p>This is extremely <span>important</span> stuff.</p>`;
      service.highlightElement(container);

      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe("important");
      expect(marks[0].parentElement?.tagName).toBe("SPAN");
    });

    it("should reject elements that should be skipped", () => {
      const container = document.createElement("div");
      
      // We know "shouldSkipElement" ignores code, pre, script, etc.
      container.innerHTML = `
        <div>important</div>
        <pre>important pre</pre>
        <code>let important = true;</code>
      `;
      
      service.highlightElement(container);
      const marks = container.querySelectorAll("mark");
      // Only the first one should be highlighted, 'pre' and 'code' should be skipped
      expect(marks.length).toBe(1);
      
      // Let's verify skipped elements stayed the same
      const pre = container.querySelector("pre");
      expect(pre?.innerHTML).toBe("important pre");
      
      const code = container.querySelector("code");
      expect(code?.innerHTML).toBe("let important = true;");
    });
  });

  describe("Regex compilation and caching", () => {
    it("should safely escape regex tokens", () => {
      settings.words = [
        { id: "3", text: "c++", enabled: true, wholeWord: false, caseSensitive: false, createdAt: Date.now() },
        { id: "4", text: "v1.2", enabled: true, wholeWord: false, caseSensitive: false, createdAt: Date.now() }
      ];
      service = new HighlightService(settings);
      
      const result = service.highlightText("using c++ v1.2 today");
      expect(result).toContain("<mark class=\"rss-highlight\" style=\"--highlight-color: #ffff00\">c++</mark>");
      expect(result).toContain("<mark class=\"rss-highlight\" style=\"--highlight-color: #ffff00\">v1.2</mark>");
    });
  });
});
