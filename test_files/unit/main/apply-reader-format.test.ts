import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, __resetObsidianVersion, __setObsidianVersion } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  RssDashboardView,
  RSS_DASHBOARD_VIEW_TYPE,
} from "../../../src/views/dashboard-view";

const manifest = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "1.0.0",
  minAppVersion: "1.8.7",
  author: "test",
  description: "test",
  dir: ".",
};

describe("applyReaderFormatToOpenViews", () => {
  beforeEach(() => {
    __setObsidianVersion("1.8.7");
  });

  afterEach(() => {
    __resetObsidianVersion();
  });

  it("updates inline formatting in every open Dashboard leaf", async () => {
    const firstView = Object.create(
      RssDashboardView.prototype,
    ) as RssDashboardView;
    const secondView = Object.create(
      RssDashboardView.prototype,
    ) as RssDashboardView;
    firstView.applyInlineReaderFormat = vi.fn();
    secondView.applyInlineReaderFormat = vi.fn();
    const leaves = [firstView, secondView].map(
      (view) =>
        ({
          view,
          loadIfDeferred: vi.fn(async () => {}),
        }) as unknown as WorkspaceLeaf,
    );
    const app = new App();
    vi.spyOn(app.workspace, "getLeavesOfType").mockImplementation(((
      type: string,
    ) => (type === RSS_DASHBOARD_VIEW_TYPE ? leaves : [])) as never);
    const plugin = new RssDashboardPlugin(app, manifest);

    await plugin.applyReaderFormatToOpenViews();

    expect(firstView.applyInlineReaderFormat).toHaveBeenCalledTimes(1);
    expect(secondView.applyInlineReaderFormat).toHaveBeenCalledTimes(1);
  });
});
