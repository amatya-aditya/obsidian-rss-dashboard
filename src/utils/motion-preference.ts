/**
 * The user's reduced-motion preference (#867).
 *
 * Stylesheets answer it with `@media (prefers-reduced-motion: reduce)` (see
 * `src/styles/reduced-motion.css`). Motion that script drives has no media
 * query to hang on: an inline style or a smooth `scrollIntoView` ignores the
 * stylesheet, so that code asks here instead.
 */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * True when the operating system asks apps to reduce motion. Pass the window
 * that owns the element being animated so a popout window answers for itself.
 */
export function prefersReducedMotion(win: Window = activeWindow): boolean {
  return win.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** The `scrollIntoView` behavior to use for a scroll that would animate. */
export function smoothScrollBehavior(
  win: Window = activeWindow,
): ScrollBehavior {
  return prefersReducedMotion(win) ? "auto" : "smooth";
}
