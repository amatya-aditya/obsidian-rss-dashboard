export type RectLike = {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
};

export type ViewportLike = { width: number; height: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computePopoverPosition(options: {
  anchorRect: RectLike;
  popoverRect: Pick<RectLike, "width" | "height">;
  viewport: ViewportLike;
  margin: number;
}): {
  top: number;
  left: number;
  placement: "top" | "bottom";
  maxHeight?: number;
} {
  const { anchorRect, popoverRect, viewport, margin } = options;

  const spaceBelow = viewport.height - anchorRect.bottom - margin;
  const spaceAbove = anchorRect.top - margin;

  const fitsBelow = spaceBelow >= popoverRect.height;
  const fitsAbove = spaceAbove >= popoverRect.height;

  let placement: "top" | "bottom" = "bottom";
  if (!fitsBelow && fitsAbove) {
    placement = "top";
  } else if (!fitsBelow && !fitsAbove) {
    placement = spaceAbove >= spaceBelow ? "top" : "bottom";
  }

  let top =
    placement === "bottom"
      ? anchorRect.bottom + margin
      : anchorRect.top - popoverRect.height - margin;

  let maxHeight: number | undefined;
  if (!fitsBelow && !fitsAbove) {
    maxHeight = Math.max(spaceAbove, spaceBelow);
  }

  const minTop = margin;
  const maxTop = Math.max(margin, viewport.height - popoverRect.height - margin);
  top = clamp(top, minTop, maxTop);

  let left = anchorRect.left;
  const minLeft = margin;
  const maxLeft = Math.max(margin, viewport.width - popoverRect.width - margin);
  left = clamp(left, minLeft, maxLeft);

  return {
    top,
    left,
    placement,
    ...(maxHeight !== undefined ? { maxHeight } : {}),
  };
}

export function computeSubmenuPosition(options: {
  parentItemRect: RectLike;
  parentMenuRect: RectLike;
  submenuRect: Pick<RectLike, "width" | "height">;
  viewport: ViewportLike;
  margin: number;
}): {
  top: number;
  left: number;
  side: "left" | "right";
  maxHeight?: number;
} {
  const { parentItemRect, parentMenuRect, submenuRect, viewport, margin } =
    options;

  const rightLeft = parentMenuRect.right + 4;
  const leftLeft = parentMenuRect.left - submenuRect.width - 4;

  let side: "left" | "right" = "right";
  let left = rightLeft;
  if (rightLeft + submenuRect.width > viewport.width - margin) {
    side = "left";
    left = leftLeft;
  }

  const minLeft = margin;
  const maxLeft = Math.max(margin, viewport.width - submenuRect.width - margin);
  left = clamp(left, minLeft, maxLeft);

  let top = parentItemRect.top;
  let maxHeight: number | undefined;
  const availableHeight = viewport.height - margin * 2;
  if (submenuRect.height > availableHeight) {
    top = margin;
    maxHeight = availableHeight;
  } else {
    const minTop = margin;
    const maxTop = Math.max(margin, viewport.height - submenuRect.height - margin);
    top = clamp(top, minTop, maxTop);
  }

  return {
    top,
    left,
    side,
    ...(maxHeight !== undefined ? { maxHeight } : {}),
  };
}

