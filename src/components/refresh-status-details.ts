const POPUP_GUTTER_PX = 8;
const MIN_SIDE_POPUP_WIDTH_PX = 240;
const MANUAL_POPUP_DISMISS_MS = 5000;

// Each document shows at most one refresh-details popup. Opening one closes
// whichever popup is already open in that document.
const openPopupClosers = new WeakMap<Document, () => void>();

function claimRefreshDetailsPopup(
  ownerDocument: Document,
  close: () => void,
): void {
  const previousClose = openPopupClosers.get(ownerDocument);
  if (previousClose && previousClose !== close) previousClose();
  openPopupClosers.set(ownerDocument, close);
}

function releaseRefreshDetailsPopup(
  ownerDocument: Document,
  close: () => void,
): void {
  if (openPopupClosers.get(ownerDocument) === close) {
    openPopupClosers.delete(ownerDocument);
  }
}

/**
 * Positions a refresh-details popup beside `anchor`, or below it across the
 * window when the space beside it is too narrow to read, as on a phone where
 * the sidebar fills most of the screen. When `anchor` sits inside a modal,
 * such as the narrow-layout sidebar drawer, the popup is lifted above the
 * modal layer so the modal does not cover it.
 */
export function positionRefreshDetailsPopup(
  popup: HTMLElement,
  anchor: HTMLElement,
): void {
  popup.toggleClass(
    "rss-dashboard-refresh-details-over-modal",
    anchor.closest(".modal-container") !== null,
  );
  const rect = anchor.getBoundingClientRect();
  const windowWidth = anchor.ownerDocument.defaultView?.innerWidth ?? 0;
  const sideLeft = rect.right + POPUP_GUTTER_PX;
  if (windowWidth - sideLeft - POPUP_GUTTER_PX >= MIN_SIDE_POPUP_WIDTH_PX) {
    popup.style.setProperty("top", `${Math.max(POPUP_GUTTER_PX, rect.top)}px`);
    popup.style.setProperty("left", `${sideLeft}px`);
    return;
  }
  popup.style.setProperty("top", `${rect.bottom + 4}px`);
  popup.style.setProperty("left", `${POPUP_GUTTER_PX}px`);
  popup.style.setProperty("right", `${POPUP_GUTTER_PX}px`);
}

/**
 * Shows the refresh-details popup opened from a context menu. It replaces any
 * other open refresh-details popup and dismisses itself after five seconds or
 * on Escape.
 */
export function showRefreshDetailsPopup(options: {
  anchor: HTMLElement;
  render: (popup: HTMLElement) => void;
}): void {
  const ownerDocument = options.anchor.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  let dismissTimer: number | null = null;
  const popup = ownerDocument.body.createDiv({
    cls: "rss-dashboard-refresh-details rss-dashboard-refresh-details-manual",
    attr: { role: "status" },
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  const close = () => {
    if (dismissTimer !== null) ownerWindow?.clearTimeout(dismissTimer);
    dismissTimer = null;
    popup.remove();
    ownerDocument.removeEventListener("keydown", onKeyDown);
    releaseRefreshDetailsPopup(ownerDocument, close);
  };
  claimRefreshDetailsPopup(ownerDocument, close);
  options.render(popup);
  positionRefreshDetailsPopup(popup, options.anchor);
  ownerDocument.addEventListener("keydown", onKeyDown);
  if (ownerWindow) {
    dismissTimer = ownerWindow.setTimeout(close, MANUAL_POPUP_DISMISS_MS);
  }
}

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
  // Only keyboard focus keeps the popup open after the pointer leaves. Focus
  // from a mouse click must not, or the clicked row's popup never closes.
  let focusFromPointer = false;
  // Hover is tracked from enter/leave events rather than `:hover`, which some
  // DOM implementations also match on a focused element.
  let pointerOverRow = false;
  let pointerOverPopup = false;
  const popupId = `rss-refresh-details-${Math.random().toString(36).slice(2)}`;
  const descriptionId = `${popupId}-description`;
  const previousDescriptionIds = row.getAttribute("aria-describedby");
  const description = ownerDocument.body.createSpan({
    cls: "rss-dashboard-refresh-details-sr-only",
    text: options.description(),
    attr: { id: descriptionId },
  });
  row.setAttribute(
    "aria-describedby",
    [previousDescriptionIds, descriptionId].filter(Boolean).join(" "),
  );

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
    pointerOverPopup = false;
    releaseRefreshDetailsPopup(ownerDocument, close);
  };
  const show = () => {
    if (popup || !row.isConnected) return;
    claimRefreshDetailsPopup(ownerDocument, close);
    popup = ownerDocument.body.createDiv({
      cls: "rss-dashboard-refresh-details",
      attr: { id: popupId, role: "status" },
    });
    options.render(popup);
    positionRefreshDetailsPopup(popup, row);
    popup.addEventListener("mouseenter", () => {
      pointerOverPopup = true;
      clearTimers();
    });
    popup.addEventListener("mouseleave", () => {
      pointerOverPopup = false;
      scheduleClose();
    });
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
    if (showTimer !== null) {
      ownerWindow.clearTimeout(showTimer);
      showTimer = null;
    }
    if (!popup || closeTimer !== null) return;
    closeTimer = ownerWindow.setTimeout(() => {
      const activeElement = ownerDocument.activeElement;
      if (
        !pointerOverRow &&
        !pointerOverPopup &&
        (activeElement !== row || focusFromPointer) &&
        !popup?.contains(activeElement)
      ) {
        close();
      }
    }, 100);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  const onMouseEnter = () => {
    pointerOverRow = true;
    scheduleShow();
  };
  const onMouseLeave = () => {
    pointerOverRow = false;
    scheduleClose();
  };
  const onMouseDown = () => {
    focusFromPointer = true;
  };
  const onFocusOut = () => {
    focusFromPointer = false;
    scheduleClose();
  };

  row.addEventListener("mouseenter", onMouseEnter);
  row.addEventListener("mouseleave", onMouseLeave);
  row.addEventListener("mousedown", onMouseDown);
  row.addEventListener("focusin", scheduleShow);
  row.addEventListener("focusout", onFocusOut);
  ownerDocument.addEventListener("keydown", onKeyDown);

  return () => {
    clearTimers();
    close();
    row.removeEventListener("mouseenter", onMouseEnter);
    row.removeEventListener("mouseleave", onMouseLeave);
    row.removeEventListener("mousedown", onMouseDown);
    row.removeEventListener("focusin", scheduleShow);
    row.removeEventListener("focusout", onFocusOut);
    ownerDocument.removeEventListener("keydown", onKeyDown);
    description.remove();
    if (previousDescriptionIds) {
      row.setAttribute("aria-describedby", previousDescriptionIds);
    } else {
      row.removeAttribute("aria-describedby");
    }
  };
}
