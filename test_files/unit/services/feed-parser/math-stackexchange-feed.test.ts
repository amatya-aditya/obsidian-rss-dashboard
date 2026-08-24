// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser";

describe("Math StackExchange Atom feed", () => {
  it("preserves the exact math-container HTML used by the Reader", () => {
    const xml = String.raw`<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title type="text">Recent Questions - Mathematics Stack Exchange</title>
        <link rel="alternate" href="https://math.stackexchange.com/questions" type="text/html" />
        <entry>
          <id>https://math.stackexchange.com/q/1</id>
          <title type="text">Surjectivity via Sperner's lemma</title>
          <link rel="alternate" href="https://math.stackexchange.com/questions/1/example" />
          <published>2026-08-03T18:48:01Z</published>
          <summary type="html">
            &lt;p&gt;Let &lt;span class=&quot;math-container&quot;&gt;$f:\Delta\to\Delta$&lt;/span&gt; be a continuous map such that &lt;span class=&quot;math-container&quot;&gt;$f(\Delta')\subseteq\Delta'$&lt;/span&gt; for every facet of &lt;span class=&quot;math-container&quot;&gt;$\Delta$&lt;/span&gt;.&lt;/p&gt;&#xA;&lt;p&gt;&lt;strong&gt;Sperner's lemma.&lt;/strong&gt; If &lt;span class=&quot;math-container&quot;&gt;$\varphi:\mathcal{K}'\to\mathcal{K}$&lt;/span&gt; is a simplicial map, then &lt;span class=&quot;math-container&quot;&gt;$\varphi(\Delta') = \Delta$&lt;/span&gt;.&lt;/p&gt;
          </summary>
        </entry>
      </feed>`;

    const parsed = new CustomXMLParser().parseString(xml);
    const expected = String.raw`<p>Let <span class="math-container">$f:\Delta\to\Delta$</span> be a continuous map such that <span class="math-container">$f(\Delta')\subseteq\Delta'$</span> for every facet of <span class="math-container">$\Delta$</span>.</p> <p><strong>Sperner's lemma.</strong> If <span class="math-container">$\varphi:\mathcal{K}'\to\mathcal{K}$</span> is a simplicial map, then <span class="math-container">$\varphi(\Delta') = \Delta$</span>.</p>`;

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].description).toBe(expected);
    expect(parsed.items[0].content).toBe(expected);
  });
});
