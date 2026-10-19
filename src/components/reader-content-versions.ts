import { createLiveRegion, type LiveRegion } from "../utils/live-region";
import type { FullArticleFetchResult } from "../utils/fetch-helpers";

export type ReaderContentVersion = "rss" | "full";

const SHOW_FETCHED = "Show fetched content";
const SHOW_RSS = "Show RSS content";

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
  private onRequestFetchedContent?: () => void;
  private fetching = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly renderVersion: (
      parent: HTMLElement,
      version: ReaderContentVersion,
    ) => void,
    private readonly selectVersion: (version: ReaderContentVersion) => void,
    shortFeed: boolean,
    /**
     * On-demand mode: no fetch is running yet. The caller offers the fetched
     * version through `offerFetchedContent` and runs the fetch on first request.
     */
    private readonly onDemand = false,
  ) {
    this.parent = container.parentElement;
    this.controls = container.createDiv({ cls: "rss-reader-content-progress" });
    this.status = createLiveRegion(this.controls, "rss-reader-fetch-status");
    if (!onDemand) this.status.announce("Fetching article content…");
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

  /** Eager fetch succeeded: offer the fetched version. */
  ready(): void {
    if (!this.isActive()) return;
    this.placeholder?.remove();
    this.removeFetchBanners();
    this.status.announce("Fetched content ready. RSS content is still shown.");
    if (!this.button) this.button = this.createToggle();
  }

  /**
   * On-demand mode: offer the fetched version before any fetch, and run
   * `onRequest` the first time the reader picks it. A failed request clears the
   * busy state, so the reader can try again.
   */
  offerFetchedContent(onRequest: () => void): void {
    if (!this.isActive() || this.button) return;
    this.onRequestFetchedContent = onRequest;
    this.button = this.createToggle();
  }

  /** On-demand request succeeded: render the fetched version and show it. */
  showFetchedContent(): void {
    if (!this.isActive()) return;
    this.fetching = false;
    this.placeholder?.remove();
    this.removeFetchBanners();
    this.showFull();
  }

  failed(result: FullArticleFetchResult): void {
    if (!this.isActive()) return;
    this.placeholder?.remove();
    this.fetching = false;
    if (this.button) {
      this.button.removeAttribute("aria-busy");
      this.button.removeAttribute("aria-disabled");
      this.button.setText(SHOW_FETCHED);
    }
    const message =
      result.failureType === "restricted"
        ? "Fetched content is restricted. Showing available RSS content."
        : result.failureReason === "timeout"
          ? "Could not fetch article content within the fetch timeout. Showing available RSS content."
          : result.failureReason === "blocked"
            ? "The site refused the request. Showing available RSS content."
            : "Could not fetch article content. Showing available RSS content.";
    this.status.announce(message);
  }

  private createToggle(): HTMLButtonElement {
    const button = this.controls.createEl("button", {
      cls: "rss-reader-content-toggle",
      text: SHOW_FETCHED,
      attr: { type: "button" },
    });
    button.addEventListener("click", () => this.toggle());
    return button;
  }

  private removeFetchBanners(): void {
    this.container
      .querySelectorAll(
        ".rss-reader-paywall-banner, .rss-reader-fetch-failure-banner",
      )
      .forEach((banner) => banner.remove());
  }

  private toggle(): void {
    if (!this.isActive() || !this.button || this.fetching) return;
    if (this.selected === "full") {
      this.showRss();
      return;
    }
    if (!this.full && this.onRequestFetchedContent) {
      this.requestFetchedContent();
      return;
    }
    this.showFull();
  }

  private requestFetchedContent(): void {
    if (!this.onRequestFetchedContent || this.fetching) return;
    this.fetching = true;
    // Keep the purpose name and focus; expose the in-flight state instead.
    this.button?.setAttribute("aria-busy", "true");
    this.button?.setAttribute("aria-disabled", "true");
    this.status.announce("Fetching article content…");
    this.onRequestFetchedContent();
  }

  private showFull(): void {
    if (!this.isActive() || !this.button) return;
    this.positions[this.selected] = this.container.scrollTop;
    this.selectVersion("full");
    if (!this.full) {
      this.full = this.container.createDiv({
        cls: "rss-reader-content-version",
      });
      this.renderVersion(this.full, "full");
    }
    this.rss.remove();
    this.container.append(this.full);
    this.selected = "full";
    this.button.removeAttribute("aria-busy");
    this.button.removeAttribute("aria-disabled");
    this.button.setText(SHOW_RSS);
    this.status.announce("Showing fetched content.");
    this.container.scrollTop = this.positions.full;
  }

  private showRss(): void {
    if (!this.isActive() || !this.button) return;
    this.positions[this.selected] = this.container.scrollTop;
    this.selectVersion("rss");
    this.full?.remove();
    this.container.append(this.rss);
    this.selected = "rss";
    this.button.removeAttribute("aria-busy");
    this.button.removeAttribute("aria-disabled");
    this.button.setText(SHOW_FETCHED);
    this.status.announce("Showing RSS content.");
    this.container.scrollTop = this.positions.rss;
  }
}
