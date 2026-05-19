import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/components/keyword-filter-editor", () => {
  return {
    renderKeywordFilterEditor: vi.fn(),
  };
});

describe("renderRulesSettingsTab()", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("initializes missing keywordRules and persists updates via editor onChange()", async () => {
    const { renderRulesSettingsTab } = await import(
      "../../../src/settings/tabs/rules-settings-tab"
    );
    const editor = await import("../../../src/components/keyword-filter-editor");

    const containerEl = document.createElement("div");
    document.body.appendChild(containerEl);
    const saveSettings = vi.fn(async () => {});
    const notifyFiltersUpdated = vi.fn();
    const plugin = {
      settings: {},
      saveSettings,
      notifyFiltersUpdated,
    } as unknown as RssDashboardPlugin;
    const onRefresh = vi.fn();

    vi.spyOn(Date, "now").mockReturnValue(123);

    renderRulesSettingsTab(containerEl, plugin, onRefresh);

    expect(plugin.settings.keywordRules).toMatchObject({
      includeLogic: "AND",
      bypassAll: false,
      rules: [],
    });

    const mockRender = editor.renderKeywordFilterEditor as Mock;
    expect(mockRender).toHaveBeenCalledTimes(1);
    
    interface EditorArgs {
      state: unknown;
      onChange: (newState: { includeLogic: string; rules: { kind: string; keyword: string }[] }) => void;
    }
    const callArgs = mockRender.mock.calls[0][0] as EditorArgs;
    expect(callArgs.state).toEqual({ includeLogic: "AND", rules: [] });

    callArgs.onChange({
      includeLogic: "OR",
      rules: [{ kind: "include", keyword: "a" }],
    });

    expect(plugin.settings.keywordRules?.includeLogic).toBe("OR");
    expect(plugin.settings.keywordRules?.rules).toEqual([
      { kind: "include", keyword: "a" },
    ]);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 0));

    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(notifyFiltersUpdated).toHaveBeenCalledWith({
      source: "settings-rules-tab",
      timestamp: 123,
    });
  });
});
