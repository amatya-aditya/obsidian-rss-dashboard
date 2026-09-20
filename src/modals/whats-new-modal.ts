import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import { ReaderLightbox } from "../components/reader-lightbox";

const FULL_CHANGELOG_URL =
  "https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/CHANGELOG.md";

/**
 * Renders one curated release note. Opened once per release line after an
 * update, and reopenable any time from the About settings tab.
 */
export class WhatsNewModal extends Modal {
  private readonly version: string;
  private readonly note: string;
  // Modal is not a Component, so the markdown renderer gets a component whose
  // lifecycle is loaded and unloaded with this modal.
  private readonly renderComponent = new Component();

  constructor(app: App, version: string, note: string) {
    super(app);
    this.version = version;
    this.note = note;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.renderComponent.load();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");
    this.modalEl.addClass("rss-dashboard-whats-new-modal");

    const body = contentEl.createDiv({
      cls: "rss-dashboard-whats-new-body",
    });

    // A render failure leaves the heading and buttons rather than throwing
    // out of onOpen.
    void MarkdownRenderer.render(
      this.app,
      this.note,
      body,
      "",
      this.renderComponent,
    )
      .then(() => {
        this.prepareImages(body);
      })
      .catch((error: unknown) => {
        console.error(
          `[RSS Dashboard] Failed to render What's New note for v${this.version}`,
          error,
        );
      });

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const changelogLink = buttonContainer.createEl("a", {
      text: "Read full changelog",
      href: FULL_CHANGELOG_URL,
    });
    changelogLink.target = "_blank";
    changelogLink.rel = "noopener noreferrer";

    const closeButton = buttonContainer.createEl("button", {
      text: "Got it",
      cls: "mod-cta",
    });
    closeButton.onclick = () => {
      this.close();
    };
  }

  private prepareImages(body: HTMLElement): void {
    body.querySelectorAll("img").forEach((img) => {
      img.addClass("rss-dashboard-whats-new-image");
      img.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openLightbox(img, body.ownerDocument);
      });
      img.addEventListener("error", () => {
        this.removeFailedImage(img);
      });

      // A cached failure can fire its error event before this listener is
      // attached, so check the already-settled state too.
      if (img.complete && img.naturalWidth === 0) {
        this.removeFailedImage(img);
      }
    });
  }

  private openLightbox(img: HTMLImageElement, doc: Document): void {
    const src = img.getAttribute("src");
    if (!src) {
      return;
    }

    new ReaderLightbox({
      source: {
        previewUrl: src,
        fullUrl: src,
        altText: img.getAttribute("alt") ?? "",
      },
      doc,
      backdropClass: "rss-reader-lightbox-above-modal",
    }).open();
  }

  /**
   * Removes a failed image with no broken icon and no layout gap: a markdown
   * image renders inside its own paragraph, which would otherwise collapse to
   * an empty line.
   */
  private removeFailedImage(img: HTMLImageElement): void {
    const parent = img.parentElement;
    img.remove();
    if (parent && parent.tagName === "P" && parent.childNodes.length === 0) {
      parent.remove();
    }
  }

  onClose(): void {
    this.renderComponent.unload();
    this.contentEl.empty();
  }
}
