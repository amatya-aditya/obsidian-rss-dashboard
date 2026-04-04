import { Setting } from "obsidian";
import type { ReaderFormatSettings } from "../types/types";

export type ReaderFormatPortalOptions = {
  anchor: HTMLElement;
  format: ReaderFormatSettings;
  defaults: ReaderFormatSettings;
  applyFormat: () => void;
  scheduleSave: () => void;
  flushSave: () => Promise<void> | void;
  onClosed?: () => void;
};

export function createReaderFormatPortal(options: ReaderFormatPortalOptions): {
  close: (flushSave: boolean) => void;
} {
  const {
    anchor,
    format,
    defaults,
    applyFormat,
    scheduleSave,
    flushSave,
    onClosed,
  } = options;

  const targetDocument = anchor.ownerDocument;
  const targetBody = targetDocument.body;
  const targetWindow = targetDocument.defaultView || window;
  const isMobile = targetWindow.matchMedia("(max-width: 768px)").matches;

  targetDocument
    .querySelectorAll(
      ".rss-reader-format-dropdown-portal, .rss-reader-format-sheet-backdrop",
    )
    .forEach((el) => {
      (el as HTMLElement).parentNode?.removeChild(el);
    });

  let backdrop: HTMLElement | null = null;
  if (isMobile) {
    backdrop = targetBody.createDiv({
      cls: "rss-reader-format-sheet-backdrop",
    });
  }

  const portalDropdown = targetBody.createDiv({
    cls: "rss-dashboard-tags-dropdown-content-portal rss-reader-format-dropdown-portal",
  });
  if (isMobile) {
    portalDropdown.addClass("rss-reader-format-mobile-sheet");
  }

  const controlsContainer = portalDropdown.createDiv({
    cls: "rss-reader-format-controls",
  });

  const onFormatMutated = () => {
    applyFormat();
    scheduleSave();
  };

  const parsePct = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  let alignDropdown: { setValue: (value: string) => void } | null = null;
  new Setting(controlsContainer)
    .setName("Alignment")
    .addDropdown((dropdown) => {
      alignDropdown = dropdown;
      dropdown
        .addOption("justify", "Justify")
        .addOption("left", "Left")
        .setValue(format.textAlign)
        .onChange((value: string) => {
          format.textAlign = value as ReaderFormatSettings["textAlign"];
          onFormatMutated();
        });
    });

  let widthDropdown: { setValue: (value: string) => void } | null = null;
  new Setting(controlsContainer)
    .setName("Paragraph width")
    .addDropdown((dropdown) => {
      widthDropdown = dropdown;
      dropdown
        .addOption("100", "100%")
        .addOption("75", "75%")
        .addOption("50", "50%")
        .addOption("25", "25%")
        .setValue(String(format.paragraphWidth))
        .onChange((value: string) => {
          format.paragraphWidth = parsePct(value, format.paragraphWidth);
          onFormatMutated();
        });
    });

  let fontSizeDropdown: { setValue: (value: string) => void } | null = null;
  new Setting(controlsContainer)
    .setName("Font size")
    .addDropdown((dropdown) => {
      fontSizeDropdown = dropdown;
      dropdown
        .addOption("80", "80%")
        .addOption("90", "90%")
        .addOption("100", "100%")
        .addOption("110", "110%")
        .addOption("120", "120%")
        .addOption("130", "130%")
        .addOption("150", "150%")
        .addOption("175", "175%")
        .addOption("200", "200%")
        .setValue(String(format.fontScalePct))
        .onChange((value: string) => {
          format.fontScalePct = parsePct(value, format.fontScalePct);
          onFormatMutated();
        });
    });

  let lineHeightDropdown: { setValue: (value: string) => void } | null = null;
  new Setting(controlsContainer)
    .setName("Line height")
    .addDropdown((dropdown) => {
      lineHeightDropdown = dropdown;
      dropdown
        .addOption("100", "100%")
        .addOption("110", "110%")
        .addOption("120", "120%")
        .addOption("130", "130%")
        .addOption("140", "140%")
        .addOption("150", "150%")
        .addOption("160", "160%")
        .addOption("180", "180%")
        .addOption("200", "200%")
        .setValue(String(format.lineHeightPct))
        .onChange((value: string) => {
          format.lineHeightPct = parsePct(value, format.lineHeightPct);
          onFormatMutated();
        });
    });

  let fontDropdown: { setValue: (value: string) => void } | null = null;
  new Setting(controlsContainer).setName("Font").addDropdown((dropdown) => {
    fontDropdown = dropdown;
    dropdown
      .addOption("default", "Theme default")
      .addOption("serif", "Serif")
      .addOption("sans", "Sans")
      .addOption("mono", "Mono")
      .setValue(format.fontFamily)
      .onChange((value: string) => {
        format.fontFamily = value as ReaderFormatSettings["fontFamily"];
        onFormatMutated();
      });
  });

  let paragraphDropdown: { setValue: (value: string) => void } | null = null;
  new Setting(controlsContainer)
    .setName("Paragraph spacing")
    .addDropdown((dropdown) => {
      paragraphDropdown = dropdown;
      dropdown
        .addOption("default", "Theme default")
        .addOption("tight", "Tight")
        .addOption("normal", "Normal")
        .addOption("loose", "Loose")
        .setValue(format.paragraphSpacing)
        .onChange((value: string) => {
          format.paragraphSpacing =
            value as ReaderFormatSettings["paragraphSpacing"];
          onFormatMutated();
        });
    });

  let closed = false;
  let outsideHandler: ((event: MouseEvent) => void) | null = null;
  let viewportCleanup: (() => void) | null = null;

  const close = (shouldFlushSave: boolean) => {
    if (closed) return;
    closed = true;

    backdrop?.remove();
    portalDropdown.remove();

    if (outsideHandler) {
      targetDocument.removeEventListener("mousedown", outsideHandler);
      outsideHandler = null;
    }

    if (viewportCleanup) {
      viewportCleanup();
      viewportCleanup = null;
    }

    if (shouldFlushSave) {
      const result = flushSave();
      if (result instanceof Promise) {
        void result;
      }
    }

    onClosed?.();
  };

  new Setting(controlsContainer).addButton((btn) => {
    btn.setButtonText("Reset").onClick((evt: MouseEvent) => {
      evt.preventDefault();
      evt.stopPropagation();

      Object.assign(format, defaults);

      alignDropdown?.setValue(format.textAlign);
      widthDropdown?.setValue(String(format.paragraphWidth));
      fontSizeDropdown?.setValue(String(format.fontScalePct));
      lineHeightDropdown?.setValue(String(format.lineHeightPct));
      fontDropdown?.setValue(format.fontFamily);
      paragraphDropdown?.setValue(format.paragraphSpacing);

      onFormatMutated();
    });
  });

  if (isMobile) {
    new Setting(controlsContainer).addButton((btn) => {
      btn.setButtonText("Done");
      const maybeCta = btn as unknown as { setCta?: () => void };
      maybeCta.setCta?.();
      btn.buttonEl?.addClass?.("mod-cta");
      btn.buttonEl?.addClass?.("rss-reader-format-done-cta");
      btn.onClick((evt: MouseEvent) => {
        evt.preventDefault();
        evt.stopPropagation();
        close(true);
      });
    });
  }

  if (isMobile) {
    const syncMobileViewportHeight = () => {
      const vvp = targetWindow.visualViewport;
      const viewportHeight = vvp?.height ?? targetWindow.innerHeight;
      const computed = targetWindow.getComputedStyle(portalDropdown);
      const bottomOffset = Number.parseFloat(computed.bottom || "0") || 0;
      const maxHeight = Math.min(
        Math.floor(viewportHeight * 0.8),
        Math.max(220, Math.floor(viewportHeight - bottomOffset - 8)),
      );
      portalDropdown.style.setProperty(
        "max-height",
        `${maxHeight}px`,
        "important",
      );
    };

    syncMobileViewportHeight();

    const visualViewport = targetWindow.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener("resize", syncMobileViewportHeight);
      visualViewport.addEventListener("scroll", syncMobileViewportHeight);
      viewportCleanup = () => {
        visualViewport.removeEventListener("resize", syncMobileViewportHeight);
        visualViewport.removeEventListener("scroll", syncMobileViewportHeight);
      };
    } else {
      targetWindow.addEventListener("resize", syncMobileViewportHeight);
      viewportCleanup = () => {
        targetWindow.removeEventListener("resize", syncMobileViewportHeight);
      };
    }

    backdrop?.addEventListener("click", () => close(true));
    return { close };
  }

  const rect = anchor.getBoundingClientRect();
  const dropdownRect = portalDropdown.getBoundingClientRect();
  const appContainer = anchor.closest(".workspace-leaf-content") || targetBody;
  const appContainerRect = (
    appContainer as HTMLElement
  ).getBoundingClientRect();

  let left = rect.right;
  let top = rect.top;

  if (left + dropdownRect.width > appContainerRect.right) {
    left = rect.left - dropdownRect.width;
  }

  if (left < appContainerRect.left) {
    left = appContainerRect.left;
  }

  if (top + dropdownRect.height > targetWindow.innerHeight) {
    top = targetWindow.innerHeight - dropdownRect.height - 5;
  }

  portalDropdown.style.left = `${left}px`;
  portalDropdown.style.top = `${top}px`;

  targetWindow.setTimeout(() => {
    outsideHandler = (ev: MouseEvent) => {
      if (closed) return;
      if (
        !portalDropdown.contains(ev.target as Node) &&
        !anchor.contains(ev.target as Node)
      ) {
        close(true);
      }
    };
    targetDocument.addEventListener("mousedown", outsideHandler);
  }, 0);

  return { close };
}
