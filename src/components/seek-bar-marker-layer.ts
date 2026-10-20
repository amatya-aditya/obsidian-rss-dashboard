/**
 * Shared seek-bar marker layer (#1374, DEC-015).
 *
 * Renders one button per marker on top of a player's progress wrapper. The
 * layer is marker-agnostic so the media-notes ticket (#1357) can reuse it for
 * note markers: callers supply the position, accessible name and preview
 * text. Chapter-specific wording stays in `PodcastPlayer`.
 *
 * Markers are real `<button>` elements in the tab order (DEC-008). Hover or
 * keyboard focus shows a plain-text preview; activating a marker seeks and
 * leaves play/pause untouched (DEC-006, DEC-007).
 */
import {
  formatChapterTime,
  shortenChapterTitle,
} from "../utils/podcast-chapters";

/** One marker on the bar. */
export interface SeekBarMarker {
  /** Offset in seconds from the start of the media. */
  start: number;
  /** Full accessible name, for example "Chapter 3, 12:30, Title". */
  label: string;
  /** Title shown in the preview; shortened here for display. */
  title: string;
  /** Plain-text detail shown after the title, for example a length. */
  detail?: string;
}

export interface SeekBarMarkerLayerOptions {
  /** Finite media duration, or null while it is unknown. */
  getDuration: () => number | null;
  /** Seeks to a marker. Must not change play or pause state. */
  onSeek: (start: number) => void;
  /** Accessible name for the marker group. Defaults to "Markers". */
  groupLabel?: string;
}

interface RenderedMarker {
  marker: SeekBarMarker;
  button: HTMLButtonElement;
  percent: number;
}

/** How long a touch tap keeps its preview visible. */
const TOUCH_PREVIEW_MS = 1500;

export class SeekBarMarkerLayer {
  private readonly container: HTMLElement;
  private readonly options: SeekBarMarkerLayerOptions;
  private rootEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private rendered: RenderedMarker[] = [];
  private previewTimer: number | null = null;

  constructor(container: HTMLElement, options: SeekBarMarkerLayerOptions) {
    this.container = container;
    this.options = options;
  }

  /** Replace every marker. Positions are fractions of the known duration. */
  setMarkers(markers: SeekBarMarker[]): void {
    this.destroy();
    const duration = this.options.getDuration();
    if (duration === null || markers.length === 0) return;

    const root = this.container.createDiv({
      cls: "seek-bar-marker-layer",
      attr: {
        role: "group",
        "aria-label": this.options.groupLabel ?? "Markers",
      },
    });
    this.rootEl = root;

    this.rendered = markers
      .filter(
        (marker) =>
          Number.isFinite(marker.start) &&
          marker.start >= 0 &&
          marker.start < duration,
      )
      .map((marker) => {
        const percent = (marker.start / duration) * 100;
        const button = root.createEl("button", {
          cls: "seek-bar-marker",
          attr: { type: "button", "aria-label": marker.label },
        });
        button.style.setProperty("--seek-bar-marker-position", `${percent}%`);

        const activate = (): void => {
          this.options.onSeek(marker.start);
          this.showPreview(marker, percent);
          this.schedulePreviewHide();
        };

        button.addEventListener("mousedown", (event) => {
          // A mousedown on a marker must not start the bar's drag (U-004).
          event.stopPropagation();
        });
        button.addEventListener("touchstart", (event) => {
          event.stopPropagation();
        });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          activate();
        });
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          // Cancel the native activation so Enter and Space seek once.
          event.preventDefault();
          event.stopPropagation();
          activate();
        });
        button.addEventListener("mouseenter", () =>
          this.showPreview(marker, percent),
        );
        button.addEventListener("mouseleave", () => this.hidePreview());
        button.addEventListener("focus", () =>
          this.showPreview(marker, percent),
        );
        button.addEventListener("blur", () => this.hidePreview());

        return { marker, button, percent };
      });

    this.previewEl = root.createDiv({
      cls: "seek-bar-marker-preview",
      attr: { role: "tooltip", "aria-hidden": "true" },
    });
    this.previewEl.hidden = true;
  }

  /**
   * Dim the markers the playhead has passed. Keeps them clickable (DEC-010).
   */
  setActiveTime(seconds: number): void {
    for (const { marker, button } of this.rendered) {
      button.classList.toggle("is-passed", seconds >= marker.start);
    }
  }

  /** Remove every marker and the preview. */
  clear(): void {
    this.destroy();
  }

  destroy(): void {
    this.clearPreviewTimer();
    this.rendered = [];
    this.rootEl?.remove();
    this.rootEl = null;
    this.previewEl = null;
  }

  private showPreview(marker: SeekBarMarker, percent: number): void {
    const preview = this.previewEl;
    if (!preview) return;
    this.clearPreviewTimer();
    const time = formatChapterTime(marker.start);
    const title = shortenChapterTitle(marker.title);
    const detail = marker.detail ? ` (${marker.detail})` : "";
    preview.textContent = `${time} — ${title}${detail}`;
    // Keep the floating preview inside the bar's width at the two edges.
    preview.style.setProperty(
      "--seek-bar-marker-position",
      `${Math.min(92, Math.max(8, percent))}%`,
    );
    preview.hidden = false;
    preview.setAttribute("aria-hidden", "false");
  }

  private hidePreview(): void {
    this.clearPreviewTimer();
    if (!this.previewEl) return;
    this.previewEl.hidden = true;
    this.previewEl.setAttribute("aria-hidden", "true");
  }

  private schedulePreviewHide(): void {
    this.clearPreviewTimer();
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      this.hidePreview();
    }, TOUCH_PREVIEW_MS);
  }

  private clearPreviewTimer(): void {
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
  }
}
