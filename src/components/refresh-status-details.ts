/**
 * Lightweight, owning-document detail popup for sidebar refresh status.
 * It uses no timers other than the interaction delay and never polls time.
 */
export function attachRefreshStatusDetails(options: {
  row: HTMLElement;
  description: () => string;
  render: (popup: HTMLElement) => void;
}): () => void {
  const { row } = options;
  const ownerDocument = row.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) return () => undefined;

  let popup: HTMLElement | null = null;
  let showTimer: number | null = null;
  let closeTimer: number | null = null;
  const popupId = `rss-refresh-details-${Math.random().toString(36).slice(2)}`;
  row.setAttribute("aria-label", options.description());

  const clearTimers = () => {
    if (showTimer !== null) ownerWindow.clearTimeout(showTimer);
    if (closeTimer !== null) ownerWindow.clearTimeout(closeTimer);
    showTimer = null;
    closeTimer = null;
  };
  const close = () => {
    clearTimers();
    popup?.remove();
    popup = null;
    row.removeAttribute("aria-describedby");
  };
  const show = () => {
    if (popup || !row.isConnected) return;
    popup = ownerDocument.body.createDiv({
      cls: "rss-dashboard-refresh-details",
      attr: { id: popupId, role: "status" },
    });
    options.render(popup);
    const rect = row.getBoundingClientRect();
    popup.style.setProperty("top", `${Math.max(8, rect.top)}px`);
    popup.style.setProperty("left", `${Math.max(8, rect.right + 8)}px`);
    row.setAttribute("aria-describedby", popupId);
    popup.addEventListener("mouseenter", clearTimers);
    popup.addEventListener("mouseleave", scheduleClose);
    popup.addEventListener("focusin", clearTimers);
    popup.addEventListener("focusout", scheduleClose);
  };
  const scheduleShow = () => {
    if (popup || showTimer !== null) return;
    if (closeTimer !== null) ownerWindow.clearTimeout(closeTimer);
    closeTimer = null;
    showTimer = ownerWindow.setTimeout(() => {
      showTimer = null;
      show();
    }, 350);
  };
  const scheduleClose = () => {
    if (!popup || closeTimer !== null) return;
    closeTimer = ownerWindow.setTimeout(() => {
      const activeElement = ownerDocument.activeElement;
      if (
        !row.matches(":hover") &&
        !popup?.matches(":hover") &&
        activeElement !== row &&
        !popup?.contains(activeElement)
      ) {
        close();
      }
    }, 100);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  row.addEventListener("mouseenter", scheduleShow);
  row.addEventListener("mouseleave", scheduleClose);
  row.addEventListener("focusin", scheduleShow);
  row.addEventListener("focusout", scheduleClose);
  ownerDocument.addEventListener("keydown", onKeyDown);

  return () => {
    clearTimers();
    close();
    row.removeEventListener("mouseenter", scheduleShow);
    row.removeEventListener("mouseleave", scheduleClose);
    row.removeEventListener("focusin", scheduleShow);
    row.removeEventListener("focusout", scheduleClose);
    ownerDocument.removeEventListener("keydown", onKeyDown);
  };
}
