// Safe windowInstanceOf helper for robust instanceof checks across window contexts
// Usage: windowInstanceOf(obj, Constructor)

export function windowInstanceOf(
  obj: unknown,
  Constructor: new (...args: unknown[]) => unknown,
): boolean {
  if (typeof window === "undefined" || !obj || !Constructor) return false;
  try {
    // Standard instanceof, but fallback to constructor name if cross-frame
    if (obj instanceof Constructor) return true;
    const objWithCtor = obj as { constructor?: { name?: string } };
    if (
      objWithCtor.constructor &&
      Constructor.name &&
      objWithCtor.constructor.name === Constructor.name
    )
      return true;
  } catch (_e) {
    // Defensive: cross-realm or revoked proxy
  }
  return false;
}
