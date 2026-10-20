/**
 * Shared seek-bar marker layer (#1374, DEC-015).
 *
 * Renders one button per marker on top of a player's progress wrapper. The
 * layer is marker-agnostic so the media-notes ticket (#1357) can reuse it for
 * note markers: callers supply the position, accessible name and preview text.
 * Chapter-specific wording stays in `PodcastPlayer`.
 *
 * Markers are real `<button>` elements in the tab order (DEC-008), so Enter
 * and Space activate them natively. Hover or keyboard focus shows the
 * plain-text preview; activating a marker seeks and leaves play/pause
 * untouched (DEC-006, DEC-007). When markers overlap, the click goes to the
 * marker nearest the pointer rather than the last one painted (DEC-012).
 */
import { windowInstanceOf } from "../utils/platform-utils";

/** One marker on the bar. */
export interface SeekBarMarker {
  /** Offset in seconds from the start of the media. */
  start: number;
  /** Full accessible name, for example "Chapter 3, 12:30, Title". */
  label: string;
  /** Plain-text preview, for example "12:30 — Title (4:21)". */
  preview: string;
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
        const button = root.createEl("button", {
          cls: "seek-bar-marker",
          attr: { type: "button", "aria-label": marker.label },
        });
        const percent = (marker.start / duration) * 100;
        button.style.setProperty("--seek-bar-marker-position", `${percent}%`);

        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.activate(marker, event);
        });
        button.addEventListener("mouseenter", () =>
          this.showPreview(marker, percent),
        );
        button.addEventListener("mouseleave", () => this.hidePreview());
        button.addEventListener("focus", () =>
          this.showPreview(marker, percent),
        );
        button.addEventListener("blur", () => this.hidePreview());

        return { marker, button };
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

  destroy(): void {
    this.clearPreviewTimer();
    this.rendered = [];
    this.rootEl?.remove();
    this.rootEl = null;
    this.previewEl = null;
  }

  /**
   * Seek to the activated marker. A pointer click resolves to the marker
   * nearest the pointer, so a dense list still picks the tick the reader
   * aimed at when 32 px targets overlap (DEC-012); keyboard activation keeps
   * the focused marker.
   */
  private activate(marker: SeekBarMarker, event: MouseEvent): void {
    const target = this.nearestMarker(marker, event);
    this.options.onSeek(target.start);
    this.showPreview(target, this.percentOf(target));
    this.schedulePreviewHide();
  }

  private nearestMarker(
    fallback: SeekBarMarker,
    event: MouseEvent,
  ): SeekBarMarker {
    const root = this.rootEl;
    const duration = this.options.getDuration();
    if (!root || duration === null || !windowInstanceOf(event, MouseEvent)) {
      return fallback;
    }
    // A keyboard or assistive-technology activation dispatches a click with
    // detail 0 and no pointer coordinates, and so does a programmatic
    // `click()`. Treating clientX 0 as the far left of the bar would jump to
    // the first chapter instead of the focused one, so only pointer input
    // resolves the nearest tick.
    if (event.detail === 0) return fallback;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0) return fallback;

    const percent = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const seconds = percent * duration;
    let nearest = fallback;
    let distance = Number.POSITIVE_INFINITY;
    for (const { marker } of this.rendered) {
      const candidate = Math.abs(marker.start - seconds);
      if (candidate < distance) {
        distance = candidate;
        nearest = marker;
      }
    }
    return nearest;
  }

  private percentOf(marker: SeekBarMarker): number {
    const duration = this.options.getDuration();
    return duration === null ? 0 : (marker.start / duration) * 100;
  }

  private showPreview(marker: SeekBarMarker, percent: number): void {
    const preview = this.previewEl;
    if (!preview) return;
    this.clearPreviewTimer();
    preview.textContent = marker.preview;
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
