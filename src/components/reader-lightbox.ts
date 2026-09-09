import { Notice, setIcon } from "obsidian";
import type { ResolvedImageSource } from "../utils/full-size-image-resolver";

export interface ReaderLightboxOptions {
  source: ResolvedImageSource;
  doc?: Document;
}

export class ReaderLightbox {
  private readonly source: ResolvedImageSource;
  private readonly doc: Document;
  private readonly win: Window;

  private backdropEl: HTMLElement | null = null;
  private viewportEl: HTMLElement | null = null;
  private stageEl: HTMLElement | null = null;
  private fullImgEl: HTMLImageElement | null = null;
  private previewImgEl: HTMLImageElement | null = null;
  private spinnerEl: HTMLElement | null = null;

  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragInitialPanX = 0;
  private dragInitialPanY = 0;

  // Touch tracking
  private touchStartY = 0;
  private touchStartX = 0;
  private initialPinchDistance = 0;
  private initialPinchScale = 1;
  private isSwipingToDismiss = false;

  private isClosed = false;
  private readonly cleanups: Array<() => void> = [];

  constructor(options: ReaderLightboxOptions) {
    this.source = options.source;
    this.doc = options.doc ?? activeDocument;
    this.win = this.doc.defaultView ?? window;
  }

  open(): void {
    if (this.isClosed) return;

    // Create backdrop
    this.backdropEl = this.doc.body.createDiv({
      cls: "rss-reader-lightbox-backdrop",
    });

    this.renderToolbar();
    this.renderViewport();
    this.attachEventListeners();

    // Trigger opening animation
    this.win.setTimeout(() => {
      if (!this.isClosed && this.backdropEl) {
        this.backdropEl.addClass("is-open");
      }
    }, 10);
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    // Clean up event listeners
    while (this.cleanups.length > 0) {
      const cleanup = this.cleanups.pop();
      cleanup?.();
    }

    if (this.backdropEl) {
      this.backdropEl.removeClass("is-open");
      const elToRemove = this.backdropEl;
      this.win.setTimeout(() => {
        elToRemove.remove();
      }, 200);
      this.backdropEl = null;
    }
  }

  private renderToolbar(): void {
    if (!this.backdropEl) return;

    const toolbar = this.backdropEl.createDiv({
      cls: "rss-reader-lightbox-toolbar",
    });

    // Start of toolbar (External link pill if image is a link to an article)
    const startSection = toolbar.createDiv({
      cls: "rss-reader-lightbox-toolbar-start",
    });

    if (this.source.externalHref) {
      let hostname = "";
      try {
        hostname = new URL(this.source.externalHref).hostname.replace(/^www\./, "");
      } catch {
        hostname = "External link";
      }

      const linkBtn = startSection.createEl("button", {
        cls: "rss-reader-lightbox-btn rss-reader-lightbox-external-link",
        attr: {
          "aria-label": `Open link to ${hostname}`,
          type: "button",
        },
      });
      setIcon(linkBtn, "external-link");
      linkBtn.createSpan({ text: `Visit ${hostname}` });

      const onLinkClick = (e: MouseEvent): void => {
        e.stopPropagation();
        if (this.source.externalHref) {
          this.win.open(this.source.externalHref, "_blank", "noopener,noreferrer");
        }
      };
      linkBtn.addEventListener("click", onLinkClick);
      this.cleanups.push(() => linkBtn.removeEventListener("click", onLinkClick));
    }

    // End of toolbar (actions: Zoom Reset, Open image in browser, Close)
    const endSection = toolbar.createDiv({
      cls: "rss-reader-lightbox-toolbar-end",
    });

    // Zoom reset / fit button
    const zoomFitBtn = endSection.createEl("button", {
      cls: "rss-reader-lightbox-btn rss-reader-lightbox-btn-zoom-fit",
      attr: {
        "aria-label": "Reset zoom",
        type: "button",
      },
    });
    setIcon(zoomFitBtn, "expand");
    const onZoomFitClick = (e: MouseEvent): void => {
      e.stopPropagation();
      this.resetZoom();
    };
    zoomFitBtn.addEventListener("click", onZoomFitClick);
    this.cleanups.push(() => zoomFitBtn.removeEventListener("click", onZoomFitClick));

    // Open image in browser button
    const openImgBtn = endSection.createEl("button", {
      cls: "rss-reader-lightbox-btn rss-reader-lightbox-btn-open-external",
      attr: {
        "aria-label": "Open original image in browser",
        type: "button",
      },
    });
    setIcon(openImgBtn, "globe");
    const onOpenImgClick = (e: MouseEvent): void => {
      e.stopPropagation();
      this.win.open(this.source.fullUrl, "_blank", "noopener,noreferrer");
    };
    openImgBtn.addEventListener("click", onOpenImgClick);
    this.cleanups.push(() => openImgBtn.removeEventListener("click", onOpenImgClick));

    // Close button
    const closeBtn = endSection.createEl("button", {
      cls: "rss-reader-lightbox-btn rss-reader-lightbox-btn-close",
      attr: {
        "aria-label": "Close lightbox",
        type: "button",
      },
    });
    setIcon(closeBtn, "x");
    const onCloseClick = (e: MouseEvent): void => {
      e.stopPropagation();
      this.close();
    };
    closeBtn.addEventListener("click", onCloseClick);
    this.cleanups.push(() => closeBtn.removeEventListener("click", onCloseClick));
  }

  private renderViewport(): void {
    if (!this.backdropEl) return;

    this.viewportEl = this.backdropEl.createDiv({
      cls: "rss-reader-lightbox-viewport",
    });

    this.stageEl = this.viewportEl.createDiv({
      cls: "rss-reader-lightbox-stage",
    });

    // 1. Preview image (instant low-res placeholder)
    if (this.source.previewUrl) {
      this.previewImgEl = this.stageEl.createEl("img", {
        cls: "rss-reader-lightbox-img rss-reader-lightbox-preview-img",
        attr: {
          src: this.source.previewUrl,
          alt: this.source.altText,
          draggable: "false",
        },
      });
    }

    // 2. Full-resolution image (loaded asynchronously)
    this.fullImgEl = this.stageEl.createEl("img", {
      cls: "rss-reader-lightbox-img rss-reader-lightbox-full-img",
      attr: {
        src: this.source.fullUrl,
        alt: this.source.altText,
        draggable: "false",
      },
    });

    // 3. Loading spinner
    this.spinnerEl = this.stageEl.createDiv({
      cls: "rss-reader-lightbox-spinner",
    });

    const onFullImageLoad = (): void => {
      if (this.isClosed) return;
      this.spinnerEl?.addClass("is-hidden");
      this.fullImgEl?.addClass("is-loaded");
      this.previewImgEl?.addClass("is-hidden");
    };

    const onFullImageError = (): void => {
      if (this.isClosed) return;
      this.spinnerEl?.addClass("is-hidden");
      new Notice("Could not load full-size image. Displaying preview.");
      if (this.previewImgEl) {
        this.previewImgEl.removeClass("is-hidden");
      }
    };

    this.fullImgEl.addEventListener("load", onFullImageLoad);
    this.fullImgEl.addEventListener("error", onFullImageError);
    this.cleanups.push(() => {
      this.fullImgEl?.removeEventListener("load", onFullImageLoad);
      this.fullImgEl?.removeEventListener("error", onFullImageError);
    });

    // 4. Caption if altText is present
    if (this.source.altText.trim()) {
      this.viewportEl.createDiv({
        cls: "rss-reader-lightbox-caption",
        text: this.source.altText.trim(),
      });
    }
  }

  private attachEventListeners(): void {
    if (!this.viewportEl || !this.stageEl) return;

    // Click on viewport background to close
    const onViewportClick = (e: MouseEvent): void => {
      if (e.target === this.viewportEl && !this.isDragging) {
        this.close();
      }
    };
    this.viewportEl.addEventListener("click", onViewportClick);
    this.cleanups.push(() =>
      this.viewportEl?.removeEventListener("click", onViewportClick),
    );

    // Double-click to toggle zoom between fit (1x) and 2.5x
    const onStageDoubleClick = (e: MouseEvent): void => {
      e.stopPropagation();
      if (this.scale === 1) {
        this.zoomTo(2.5, e.clientX, e.clientY);
      } else {
        this.resetZoom();
      }
    };
    this.stageEl.addEventListener("dblclick", onStageDoubleClick);
    this.cleanups.push(() =>
      this.stageEl?.removeEventListener("dblclick", onStageDoubleClick),
    );

    // Mouse wheel zoom
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newScale = Math.min(Math.max(this.scale * zoomFactor, 1), 4);
      if (newScale === 1) {
        this.resetZoom();
      } else {
        this.zoomTo(newScale, e.clientX, e.clientY);
      }
    };
    this.viewportEl.addEventListener("wheel", onWheel, { passive: false });
    this.cleanups.push(() =>
      this.viewportEl?.removeEventListener("wheel", onWheel),
    );

    // Mouse drag pan when zoomed
    const onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 0 || this.scale <= 1) return;
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragInitialPanX = this.panX;
      this.dragInitialPanY = this.panY;
      this.viewportEl?.addClass("is-dragging");
      this.stageEl?.addClass("is-panning");
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent): void => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      this.panX = this.dragInitialPanX + deltaX;
      this.panY = this.dragInitialPanY + deltaY;
      this.updateTransform();
    };

    const onMouseUp = (): void => {
      if (this.isDragging) {
        this.isDragging = false;
        this.viewportEl?.removeClass("is-dragging");
        this.stageEl?.removeClass("is-panning");
      }
    };

    this.viewportEl.addEventListener("mousedown", onMouseDown);
    this.win.addEventListener("mousemove", onMouseMove);
    this.win.addEventListener("mouseup", onMouseUp);
    this.cleanups.push(() => {
      this.viewportEl?.removeEventListener("mousedown", onMouseDown);
      this.win.removeEventListener("mousemove", onMouseMove);
      this.win.removeEventListener("mouseup", onMouseUp);
    });

    // Touch events for mobile
    const onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 1) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.isSwipingToDismiss = this.scale === 1;

        if (this.scale > 1) {
          this.isDragging = true;
          this.dragStartX = e.touches[0].clientX;
          this.dragStartY = e.touches[0].clientY;
          this.dragInitialPanX = this.panX;
          this.dragInitialPanY = this.panY;
          this.stageEl?.addClass("is-panning");
        }
      } else if (e.touches.length === 2) {
        this.isSwipingToDismiss = false;
        this.isDragging = false;
        this.initialPinchDistance = this.getTouchDistance(e.touches);
        this.initialPinchScale = this.scale;
      }
    };

    const onTouchMove = (e: TouchEvent): void => {
      if (e.touches.length === 1) {
        if (this.isDragging && this.scale > 1) {
          const deltaX = e.touches[0].clientX - this.dragStartX;
          const deltaY = e.touches[0].clientY - this.dragStartY;
          this.panX = this.dragInitialPanX + deltaX;
          this.panY = this.dragInitialPanY + deltaY;
          this.updateTransform();
        } else if (this.isSwipingToDismiss && this.scale === 1) {
          const deltaY = e.touches[0].clientY - this.touchStartY;
          if (deltaY > 0) {
            this.panY = deltaY * 0.7;
            this.updateTransform();
          }
        }
      } else if (e.touches.length === 2 && this.initialPinchDistance > 0) {
        const currentDistance = this.getTouchDistance(e.touches);
        const ratio = currentDistance / this.initialPinchDistance;
        this.scale = Math.min(Math.max(this.initialPinchScale * ratio, 1), 4);
        this.updateTransform();
      }
    };

    const onTouchEnd = (_e: TouchEvent): void => {
      if (this.isSwipingToDismiss && this.scale === 1) {
        const deltaY = this.panY;
        if (deltaY > 75) {
          this.close();
          return;
        }
        this.resetZoom();
      }

      if (this.scale <= 1) {
        this.resetZoom();
      }

      this.isDragging = false;
      this.isSwipingToDismiss = false;
      this.stageEl?.removeClass("is-panning");
    };

    this.viewportEl.addEventListener("touchstart", onTouchStart, { passive: true });
    this.viewportEl.addEventListener("touchmove", onTouchMove, { passive: true });
    this.viewportEl.addEventListener("touchend", onTouchEnd, { passive: true });
    this.cleanups.push(() => {
      this.viewportEl?.removeEventListener("touchstart", onTouchStart);
      this.viewportEl?.removeEventListener("touchmove", onTouchMove);
      this.viewportEl?.removeEventListener("touchend", onTouchEnd);
    });

    // Keyboard navigation (Escape key to dismiss)
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    };
    this.win.addEventListener("keydown", onKeyDown);
    this.cleanups.push(() => this.win.removeEventListener("keydown", onKeyDown));
  }

  private zoomTo(targetScale: number, clientX?: number, clientY?: number): void {
    this.scale = targetScale;
    if (this.scale <= 1) {
      this.panX = 0;
      this.panY = 0;
      this.viewportEl?.removeClass("is-zoomed");
    } else {
      this.viewportEl?.addClass("is-zoomed");
      if (clientX !== undefined && clientY !== undefined && this.viewportEl) {
        const rect = this.viewportEl.getBoundingClientRect();
        const offsetX = clientX - (rect.left + rect.width / 2);
        const offsetY = clientY - (rect.top + rect.height / 2);
        this.panX = -offsetX * 0.5;
        this.panY = -offsetY * 0.5;
      }
    }
    this.updateTransform();
  }

  private resetZoom(): void {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.viewportEl?.removeClass("is-zoomed");
    this.updateTransform();
  }

  private updateTransform(): void {
    if (!this.stageEl) return;
    this.stageEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  private getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
