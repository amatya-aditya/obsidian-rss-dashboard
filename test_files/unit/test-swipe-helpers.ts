/** Fires a touchstart/touchend pair `dx`,`dy` apart on `target`. */
export function swipeOn(
  target: Element,
  dx: number,
  dy = 0,
): { endEvent: Event } {
  const point = (x: number, y: number) => [{ clientX: x, clientY: y }];
  const start = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(start, "touches", { value: point(200, 300) });
  target.dispatchEvent(start);
  const end = new Event("touchend", { bubbles: true, cancelable: true });
  Object.defineProperty(end, "touches", { value: [] });
  Object.defineProperty(end, "changedTouches", {
    value: point(200 + dx, 300 + dy),
  });
  target.dispatchEvent(end);
  return { endEvent: end };
}
