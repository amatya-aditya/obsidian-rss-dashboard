import { describe, it, expect, vi } from "vitest";
import { Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  DEFAULT_SETTINGS,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function makeRenderer(options: {
  settings: RssDashboardSettings;
  getSettings?: () => RssDashboardSettings;
}): ArticleRenderer {
  return new ArticleRenderer({
    app: {} as never,
    component: new Component(),
    onArticleSave: vi.fn(),
    onArticleUpdate: vi.fn(),
    ...options,
  });
}

// The renderer's settings are private; read them the way its render paths do.
function readSettings(renderer: ArticleRenderer): RssDashboardSettings {
  return (renderer as unknown as { settings: RssDashboardSettings }).settings;
}

describe("ArticleRenderer live settings", () => {
  it("reads the replacement settings object after a portable-bundle import swaps plugin.settings", () => {
    const plugin = { settings: structuredClone(DEFAULT_SETTINGS) };
    const renderer = makeRenderer({
      settings: plugin.settings,
      getSettings: () => plugin.settings,
    });

    plugin.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      useFirstSeenDateFallback: true,
    };

    expect(readSettings(renderer)).toBe(plugin.settings);
    expect(readSettings(renderer).useFirstSeenDateFallback).toBe(true);
  });

  it("uses the settings it was given when no getter is supplied", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    expect(readSettings(makeRenderer({ settings }))).toBe(settings);
  });
});
