/**
 * Make a non-native control (a `div` with `role="button"`) respond to a click
 * and to Enter or Space, the way a native `<button>` does. WCAG 2.2 SC 2.1.1.
 * Space is prevented from scrolling the page. The handler gets the original
 * event, so a caller can tell a keyboard activation (`type === "keydown"`)
 * from a click.
 */
export function onActivate(
  el: HTMLElement,
  handler: (event: MouseEvent | KeyboardEvent) => void,
): void {
  el.addEventListener("click", handler);
  el.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler(event);
    }
  });
}
