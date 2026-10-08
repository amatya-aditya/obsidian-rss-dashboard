import { beforeEach, describe, expect, it } from "vitest";
import { renderKeywordFilterEditor } from "../../../src/components/keyword-filter-editor";
import type { KeywordFilterRule } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type ObsidianHTMLElement = HTMLElement & {
  createDiv(opts?: { cls?: string }): HTMLDivElement;
};

function createRule(
  overrides: Partial<KeywordFilterRule> = {},
): KeywordFilterRule {
  return {
    id: "r1",
    type: "include",
    keyword: "alpha",
    matchMode: "partial",
    applyToTitle: true,
    applyToSummary: false,
    applyToContent: false,
    enabled: true,
    createdAt: 0,
    ...overrides,
  };
}

function renderToHtml(rules: KeywordFilterRule[]): string {
  const containerEl = (
    document.body as unknown as ObsidianHTMLElement
  ).createDiv();
  renderKeywordFilterEditor({
    containerEl,
    state: { includeLogic: "AND", rules },
    onChange: () => undefined,
  });
  const rows = containerEl.querySelector(".rss-keyword-filter-rules-container");
  return rows?.innerHTML ?? "";
}

// Characterization of the rendered rule rows (#911): pins the DOM the editor
// produces today, so that moving the row code leaves it untouched.
describe("renderKeywordFilterEditor rule row DOM", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.innerHTML = "";
  });

  it("renders an enabled include rule", () => {
    expect(renderToHtml([createRule()])).toMatchInlineSnapshot(
      `"<div class="rss-keyword-filter-rule-row"><div class="rss-keyword-filter-rule-col"><div class="rss-keyword-filter-rule-header"><div class="rss-keyword-filter-rule-header-left"><span class="rss-keyword-filter-rule-title">Rule 1</span><button class="rss-keyword-filter-enabled-btn is-checked" type="button" aria-pressed="true" aria-label="Toggle enabled state for rule 1"><span class="rss-keyword-filter-enabled-btn-box is-checked">✓</span><span class="rss-keyword-filter-enabled-btn-label">Enabled</span></button></div><button class="rss-keyword-filter-delete rss-keyword-filter-delete-header" aria-label="Delete rule 1">Delete rule</button></div><div class="rss-keyword-filter-rule-body"><div class="rss-keyword-filter-rule-type-row"><span class="rss-keyword-filter-inline-label">Rule type:</span><div class="rss-keyword-filter-segmented rss-keyword-filter-rule-segmented"><button class="rss-keyword-filter-segmented-btn is-active" type="button" data-value="include">Include</button><button class="rss-keyword-filter-segmented-btn" type="button" data-value="exclude">Exclude</button></div></div><div class="rss-keyword-filter-rule-match-row"><span class="rss-keyword-filter-inline-label">Match mode:</span><div class="rss-keyword-filter-segmented rss-keyword-filter-rule-segmented"><button class="rss-keyword-filter-segmented-btn" type="button" data-value="exact">Exact</button><button class="rss-keyword-filter-segmented-btn is-active" type="button" data-value="partial">Partial</button></div></div><div class="rss-keyword-filter-rule-keyword-row"><input class="rss-keyword-filter-input" type="text" placeholder="Keyword or phrase"></div><div class="rss-keyword-filter-locations-row"><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox"><label class="rss-keyword-filter-label">Title</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox"><label class="rss-keyword-filter-label">Summary</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox"><label class="rss-keyword-filter-label">Content</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox"><label class="rss-keyword-filter-label">URL</label></div></div></div></div></div>"`,
    );
  });

  it("renders a disabled exclude rule with exact matching and every scope on", () => {
    expect(
      renderToHtml([
        createRule({
          enabled: false,
          type: "exclude",
          matchMode: "exact",
          keyword: "beta",
          applyToTitle: true,
          applyToSummary: true,
          applyToContent: true,
          applyToURL: true,
        }),
        createRule({ id: "r2", keyword: "" }),
      ]),
    ).toMatchInlineSnapshot(
      `"<div class="rss-keyword-filter-rule-row is-disabled"><div class="rss-keyword-filter-rule-col"><div class="rss-keyword-filter-rule-header"><div class="rss-keyword-filter-rule-header-left"><span class="rss-keyword-filter-rule-title">Rule 1</span><button class="rss-keyword-filter-enabled-btn" type="button" aria-pressed="false" aria-label="Toggle enabled state for rule 1"><span class="rss-keyword-filter-enabled-btn-box"></span><span class="rss-keyword-filter-enabled-btn-label">Enabled</span></button></div><button class="rss-keyword-filter-delete rss-keyword-filter-delete-header" aria-label="Delete rule 1">Delete rule</button></div><div class="rss-keyword-filter-rule-body"><div class="rss-keyword-filter-rule-type-row"><span class="rss-keyword-filter-inline-label">Rule type:</span><div class="rss-keyword-filter-segmented rss-keyword-filter-rule-segmented"><button class="rss-keyword-filter-segmented-btn" type="button" data-value="include" disabled="">Include</button><button class="rss-keyword-filter-segmented-btn is-active" type="button" data-value="exclude" disabled="">Exclude</button></div></div><div class="rss-keyword-filter-rule-match-row"><span class="rss-keyword-filter-inline-label">Match mode:</span><div class="rss-keyword-filter-segmented rss-keyword-filter-rule-segmented"><button class="rss-keyword-filter-segmented-btn is-active" type="button" data-value="exact" disabled="">Exact</button><button class="rss-keyword-filter-segmented-btn" type="button" data-value="partial" disabled="">Partial</button></div></div><div class="rss-keyword-filter-rule-keyword-row"><input class="rss-keyword-filter-input" type="text" placeholder="Keyword or phrase" disabled=""></div><div class="rss-keyword-filter-locations-row"><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox" disabled=""><label class="rss-keyword-filter-label">Title</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox" disabled=""><label class="rss-keyword-filter-label">Summary</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox" disabled=""><label class="rss-keyword-filter-label">Content</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox" disabled=""><label class="rss-keyword-filter-label">URL</label></div></div></div></div></div><div class="rss-keyword-filter-rule-row"><div class="rss-keyword-filter-rule-col"><div class="rss-keyword-filter-rule-header"><div class="rss-keyword-filter-rule-header-left"><span class="rss-keyword-filter-rule-title">Rule 2</span><button class="rss-keyword-filter-enabled-btn is-checked" type="button" aria-pressed="true" aria-label="Toggle enabled state for rule 2"><span class="rss-keyword-filter-enabled-btn-box is-checked">✓</span><span class="rss-keyword-filter-enabled-btn-label">Enabled</span></button></div><button class="rss-keyword-filter-delete rss-keyword-filter-delete-header" aria-label="Delete rule 2">Delete rule</button></div><div class="rss-keyword-filter-rule-body"><div class="rss-keyword-filter-rule-type-row"><span class="rss-keyword-filter-inline-label">Rule type:</span><div class="rss-keyword-filter-segmented rss-keyword-filter-rule-segmented"><button class="rss-keyword-filter-segmented-btn is-active" type="button" data-value="include">Include</button><button class="rss-keyword-filter-segmented-btn" type="button" data-value="exclude">Exclude</button></div></div><div class="rss-keyword-filter-rule-match-row"><span class="rss-keyword-filter-inline-label">Match mode:</span><div class="rss-keyword-filter-segmented rss-keyword-filter-rule-segmented"><button class="rss-keyword-filter-segmented-btn" type="button" data-value="exact">Exact</button><button class="rss-keyword-filter-segmented-btn is-active" type="button" data-value="partial">Partial</button></div></div><div class="rss-keyword-filter-rule-keyword-row"><input class="rss-keyword-filter-input" type="text" placeholder="Keyword or phrase"></div><div class="rss-keyword-filter-locations-row"><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox"><label class="rss-keyword-filter-label">Title</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox"><label class="rss-keyword-filter-label">Summary</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox"><label class="rss-keyword-filter-label">Content</label></div><div class="rss-keyword-filter-location-toggle"><input class="rss-keyword-filter-checkbox" type="checkbox"><label class="rss-keyword-filter-label">URL</label></div></div></div></div></div>"`,
    );
  });
});
