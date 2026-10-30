import { Platform } from "obsidian";
import { shouldUseMobileSidebarLayout } from "./platform-utils";

export type SwipeDirection = "left" | "right";

export interface SwipePoint {
  x: number;
  y: number;
  /** Timestamp in milliseconds. */
  t: number;
}

/** A swipe must stay within this angle of horizontal (30 degrees). */
const MAX_ANGLE_TANGENT = Math.tan((30 * Math.PI) / 180);
/** Horizontal travel that counts as a swipe on its own. */
export const SWIPE_MIN_DISTANCE_PX = 60;
/** A faster move counts as a flick once it travels at least this far. */
export const SWIPE_FLICK_MIN_DISTANCE_PX = 30;
/** Flick speed in pixels per millisecond. */
export const SWIPE_FLICK_MIN_SPEED = 0.5;

/**
 * Classifies a touch move as a horizontal swipe. Pure: no DOM access.
 * "right" means the finger moved right. Returns null for short, diagonal,
 * and vertical moves so vertical scrolling is never taken over.
 */
export function recognizeSwipe(
  start: SwipePoint,
  end: SwipePoint,
): SwipeDirection | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  if (absX === 0) return null;
  if (Math.abs(dy) > absX * MAX_ANGLE_TANGENT) return null;

  const elapsed = end.t - start.t;
  const isFlick =
    absX >= SWIPE_FLICK_MIN_DISTANCE_PX &&
    elapsed > 0 &&
    absX / elapsed >= SWIPE_FLICK_MIN_SPEED;
  if (absX < SWIPE_MIN_DISTANCE_PX && !isFlick) return null;

  return dx > 0 ? "right" : "left";
}

/** Controls that own horizontal touch movement themselves. */
const IGNORED_START_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[role="slider"]',
  ".podcast-seekbar-row",
  ".rss-dashboard-header-icon-row",
  ".rss-reader-lightbox-backdrop",
].join(", ");

function isHorizontallyScrollable(el: HTMLElement): boolean {
  if (el.scrollWidth <= el.clientWidth) return false;
  const view = el.ownerDocument.defaultView;
  const overflowX = view?.getComputedStyle(el).overflowX;
  return overflowX === "auto" || overflowX === "scroll";
}

/**
 * True when a touch that begins on `target` belongs to the element under the
 * finger rather than to panel navigation. Walks up to `boundary` (exclusive).
 */
export function shouldIgnoreSwipeStart(
  target: EventTarget | null,
  boundary?: Element | null,
): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== boundary) {
    if (el.matches(IGNORED_START_SELECTOR)) return true;
    if (el.instanceOf(HTMLElement) && isHorizontallyScrollable(el)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * True when swipe navigation should be active: the setting is on, Obsidian is
 * running on mobile, and the viewport uses the phone/tablet layout.
 */
export function areSwipePanelsEnabled(settings: {
  display: { swipeBetweenPanels: boolean };
}): boolean {
  return (
    settings.display.swipeBetweenPanels === true &&
    Platform.isMobile &&
    shouldUseMobileSidebarLayout()
  );
}
