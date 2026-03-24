import { describe, it, expect } from "vitest";
import { CustomXMLParser } from "../../src/services/feed-parser";

describe("iOS Namespace Fix - CustomXMLParser", () => {
    it("should correctly extract content:encoded even if namespaces are slightly malformed or in different environments", () => {
        const parser = new CustomXMLParser();
        const xml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
                <channel>
                    <item>
                        <title>Test Item</title>
                        <content:encoded><![CDATA[<p>Robustly extracted content</p>]]></content:encoded>
                    </item>
                </channel>
            </rss>
        `;
        const result = parser.parseString(xml);
        expect(result.items[0].content).toContain("Robustly extracted content");
    });

    it("should extract dc:creator author reliably", () => {
        const parser = new CustomXMLParser();
        const xml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
                <channel>
                    <item>
                        <title>Test Item</title>
                        <dc:creator>Jane Doe</dc:creator>
                    </item>
                </channel>
            </rss>
        `;
        const result = parser.parseString(xml);
        expect(result.items[0].author).toBe("Jane Doe");
    });

    it("should handle cases where content:encoded and description are both present and prioritize encoded", () => {
        const parser = new CustomXMLParser();
        const xml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
                <channel>
                    <item>
                        <title>Dual Content</title>
                        <description>Small Summary</description>
                        <content:encoded>Full Article Text</content:encoded>
                    </item>
                </channel>
            </rss>
        `;
        const result = parser.parseString(xml);
        expect(result.items[0].content).toBe("Full Article Text");
        expect(result.items[0].description).toBe("Small Summary");
    });
});
