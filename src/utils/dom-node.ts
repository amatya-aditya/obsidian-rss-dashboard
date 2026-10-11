/**
 * True when a value is a DOM Node, detected through the cross-window
 * `instanceOf` helper Obsidian adds to `Node.prototype` (mirrored by the test
 * polyfill). It guards a `.instanceOf(...)` call on an `EventTarget` that may
 * not be a Node: a window or `XMLHttpRequest` target has no `instanceOf` and
 * would throw.
 */
export function isDomNode(value: unknown): value is Node {
  return typeof (value as Partial<Node> | null)?.instanceOf === "function";
}
