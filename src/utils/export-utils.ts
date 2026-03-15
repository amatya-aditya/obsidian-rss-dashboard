export type ExportBlobResult =
  | "shared"
  | "downloaded"
  | "opened"
  | "canceled"
  | "failed";

export async function exportBlob(args: {
  blob: Blob;
  filename: string;
  isMobile: boolean;
}): Promise<ExportBlobResult> {
  const { blob, filename, isMobile } = args;

  if (isMobile) {
    const canShareFn = (navigator as unknown as { canShare?: unknown }).canShare;
    const shareFn = (navigator as unknown as { share?: unknown }).share;

    if (typeof shareFn === "function" && typeof File !== "undefined") {
      try {
        const file = new File([blob], filename, {
          type: blob.type || "application/octet-stream",
        });

        if (typeof canShareFn === "function") {
          const canShare = (navigator as unknown as {
            canShare: (data: unknown) => boolean;
          }).canShare;
          if (!canShare({ files: [file] })) {
            throw new Error("navigator.canShare returned false");
          }
        }

        await (navigator as unknown as {
          share: (data: unknown) => Promise<void>;
        }).share({
          files: [file],
          title: filename,
        });

        return "shared";
      } catch (error) {
        const errorName =
          error && typeof error === "object" && "name" in error
            ? String((error as { name?: unknown }).name)
            : "";

        if (errorName === "AbortError") {
          return "canceled";
        }
      }
    }

    try {
      const url = URL.createObjectURL(blob);
      try {
        const opened = window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return opened ? "opened" : "failed";
      } catch {
        URL.revokeObjectURL(url);
        return "failed";
      }
    } catch {
      return "failed";
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "downloaded";
    } catch {
      URL.revokeObjectURL(url);
      return "failed";
    }
  } catch {
    return "failed";
  }
}

export type CopyToClipboardResult = "copied" | "failed";

export async function copyTextToClipboard(
  text: string,
): Promise<CopyToClipboardResult> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    // fall through to legacy fallback
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.classList.add("rss-dashboard-clipboard-textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const ok = document.execCommand("copy");
      return ok ? "copied" : "failed";
    } finally {
      textarea.remove();
    }
  } catch {
    return "failed";
  }
}
