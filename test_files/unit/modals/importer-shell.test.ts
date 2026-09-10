import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImporterShell } from "../../../src/modals/importer-shell";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type FakePreviewModel = { value: string; getStats: () => { selected: number } };

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
});

describe("ImporterShell", () => {
  it("runs a format-agnostic validation, preview, and execution lifecycle", async () => {
    const validate = vi.fn((content: string) =>
      content === "valid" ? { valid: true as const } : { valid: false as const, error: "Invalid file" },
    );
    const parse = vi.fn((content: string) => ({ value: content }));
    const execute = vi.fn(async () => {});
    const render = vi.fn();
    const shell = new ImporterShell<{ value: string }, FakePreviewModel>({
      acceptedFileTypes: ".fake",
      validate,
      parse,
      createPreviewModel: (parsed) => ({
        ...parsed,
        getStats: () => ({ selected: 1 }),
      }),
      renderer: { render },
      execute,
      getActionState: (model) => ({
        text: model ? "Import item" : "Import items",
        disabled: !model,
      }),
    });
    const buttons = document.body.createDiv();
    shell.mount(document.body, buttons);

    await shell.handleFileSelection(new File(["invalid"], "bad.fake"));

    expect(shell.state).toBe("error");
    expect(parse).not.toHaveBeenCalled();
    expect(document.querySelector(".import-error-message")?.textContent).toBe("Invalid file");

    await shell.handleFileSelection(new File(["valid"], "good.fake"));

    expect(shell.state).toBe("preview");
    expect(parse).toHaveBeenCalledWith("valid");
    expect(render).toHaveBeenCalledTimes(1);
    expect(buttons.querySelector("button")?.textContent).toBe("Import item");

    await shell.execute();

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ value: "valid" }));
    expect(shell.state).toBe("done");
  });
});
