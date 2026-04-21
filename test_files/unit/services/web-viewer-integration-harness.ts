import { App, type TFile } from "obsidian";
import { vi } from "vitest";
import { WebViewerIntegration } from "../../../src/services/web-viewer-integration";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

export interface WebViewerPluginStub {
  openWebpage?: (url: string, title: string) => Promise<void>;
  currentTitle?: string;
  currentUrl?: string;
  cleanedHtml?: string;
}

export interface WebViewerIntegrationHarnessOverrides {
  settings?: Partial<ArticleSavingSettings>;
  webViewerPlugin?: WebViewerPluginStub | null;
  webpageContainer?: HTMLElement | null;
}

function cloneDefaultSettings(): ArticleSavingSettings {
  return {
    addSavedTag: true,
    defaultFolder: "RSS articles/",
    defaultTemplate: "---\ntitle: {{title}}\n---\n\n{{content}}",
    includeFrontmatter: true,
    frontmatterTemplate: "",
    saveFullContent: true,
    fetchTimeout: 30_000,
    savedTemplates: [],
  };
}

export function buildFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  const pubDate =
    overrides.pubDate ?? new Date("2026-01-01T00:00:00Z").toISOString();
  return {
    guid: overrides.guid ?? "guid",
    title: overrides.title ?? "Title",
    link: overrides.link ?? "https://example.com",
    pubDate,
    description: overrides.description ?? "<p>desc</p>",
    summary: overrides.summary ?? "Summary",
    author: overrides.author ?? "Author",
    read: overrides.read ?? false,
    starred: overrides.starred ?? false,
    saved: overrides.saved ?? false,
    tags: overrides.tags ?? [],
    feedTitle: overrides.feedTitle ?? "Feed",
    feedUrl: overrides.feedUrl ?? "https://example.com/feed",
    coverImage: overrides.coverImage ?? "",
  } as FeedItem;
}

export function createWebpageContainer(): HTMLElement {
  installObsidianDomPolyfills();
  return (document.body as unknown as HTMLElement).createDiv({
    cls: "webpage-container",
  });
}

export function createWebViewerIntegrationHarness(
  overrides: WebViewerIntegrationHarnessOverrides = {},
) {
  installObsidianDomPolyfills();

  const app = new App() as unknown as App & {
    plugins: { plugins: Record<string, unknown> };
  };

  const webViewerPlugin: WebViewerPluginStub | null =
    overrides.webViewerPlugin === undefined
      ? {
      openWebpage: vi.fn(async () => {}),
      currentTitle: "Web Title",
      currentUrl: "https://example.com",
      cleanedHtml: "<p>clean</p>",
    }
      : overrides.webViewerPlugin;

  app.plugins = {
    plugins: {
      ...(webViewerPlugin ? { "webpage-html-export": webViewerPlugin } : {}),
    },
  };

  const settings = cloneDefaultSettings();
  if (overrides.settings) {
    Object.assign(settings, overrides.settings);
  }

  const integration = new WebViewerIntegration(app as any, settings);

  const createdContainer = overrides.webpageContainer === undefined;
  const webpageContainer =
    overrides.webpageContainer === undefined ? createWebpageContainer() : overrides.webpageContainer;

  const cleanup = () => {
    if (createdContainer && webpageContainer) {
      webpageContainer.remove();
    }
  };

  return {
    app,
    settings,
    webViewerPlugin,
    webpageContainer,
    integration,
    // Helpers for tests that need to inspect vault effects.
    getFile: (path: string): TFile | null => app.vault.getAbstractFileByPath(path) as any,
    cleanup,
  };
}
