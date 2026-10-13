import { createLiveRegion, type LiveRegion } from "../utils/live-region";
import type { FullArticleFetchResult } from "../utils/fetch-helpers";

export type ReaderContentVersion = "rss" | "full";

/** One display's cached DOM and scroll positions. Fetch completion never swaps text. */
export class ReaderContentVersions {
  private readonly controls: HTMLElement;
  private readonly status: LiveRegion;
  private readonly rss: HTMLElement;
  private full?: HTMLElement;
  private placeholder?: HTMLElement;
  private button?: HTMLButtonElement;
  private selected: ReaderContentVersion = "rss";
  private readonly positions = { rss: 0, full: 0 };
  private readonly parent: HTMLElement | null;
  private active = true;

  constructor(
    private readonly container: HTMLElement,
    private readonly renderVersion: (
      parent: HTMLElement,
      version: ReaderContentVersion,
    ) => void,
    private readonly selectVersion: (version: ReaderContentVersion) => void,
    shortFeed: boolean,
  ) {
    this.parent = container.parentElement;
    this.controls = container.createDiv({ cls: "rss-reader-content-progress" });
    this.status = createLiveRegion(this.controls, "rss-reader-fetch-status");
    this.status.announce("Fetching article content…");
    this.rss = container.createDiv({ cls: "rss-reader-content-version" });
    renderVersion(this.rss, "rss");
    if (shortFeed) {
      this.placeholder = this.rss.createDiv({
        cls: "rss-reader-content-placeholder",
        attr: { "aria-hidden": "true" },
      });
      for (let line = 0; line < 3; line++) this.placeholder.createDiv();
    }
  }

  isActive(): boolean {
    return this.active && this.container.parentElement === this.parent;
  }

  dispose(): void {
    this.active = false;
  }

  visitVersions(visitor: (container: HTMLElement) => void): void {
    visitor(this.rss);
    if (this.full) visitor(this.full);
  }

  ready(): void {
    if (!this.isActive()) return;
    this.placeholder?.remove();
    this.container
      .querySelectorAll(".rss-reader-paywall-banner")
      .forEach((banner) => banner.remove());
    this.status.announce("Fetched content ready. RSS content is still shown.");
    this.button = this.controls.createEl("button", {
      cls: "rss-reader-content-toggle",
      text: "Show fetched content",
      attr: { type: "button" },
    });
    this.button.addEventListener("click", () => this.toggle());
  }

  failed(result: FullArticleFetchResult): void {
    if (!this.isActive()) return;
    this.placeholder?.remove();
    const message =
      result.failureType === "restricted"
        ? "Fetched content is restricted. Showing available RSS content."
        : result.failureReason === "timeout"
          ? "Could not fetch article content within the fetch timeout. Showing available RSS content."
          : "Could not fetch article content. Showing available RSS content.";
    this.status.announce(message);
  }

  private toggle(): void {
    if (!this.isActive() || !this.button) return;
    this.positions[this.selected] = this.container.scrollTop;
    const next = this.selected === "rss" ? "full" : "rss";
    this.selectVersion(next);
    if (next === "full" && !this.full) {
      this.full = this.container.createDiv({
        cls: "rss-reader-content-version",
      });
      this.renderVersion(this.full, "full");
    }
    (this.selected === "rss" ? this.rss : this.full)?.remove();
    const content = next === "rss" ? this.rss : this.full;
    if (content) this.container.append(content);
    this.selected = next;
    this.button.setText(
      next === "rss" ? "Show fetched content" : "Show RSS content",
    );
    this.status.announce(
      next === "rss" ? "Showing RSS content." : "Showing fetched content.",
    );
    this.container.scrollTop = this.positions[next];
  }
}
