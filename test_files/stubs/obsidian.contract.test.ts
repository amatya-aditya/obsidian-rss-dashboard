/**
 * Obsidian stub contract (ADR 0014).
 *
 * Each expectation records a behavior observed in real Obsidian, and the
 * version it was observed on. The stub (`obsidian.ts`) and the DOM polyfills
 * (`../unit/test-dom-polyfills.ts`) must pass every expectation here.
 *
 * Add the expectation before changing the stub. Use the console probes in
 * `obsidian-console-probes.md` to observe the behavior, and name the version.
 */
import { afterEach, describe, expect, it } from "vitest";
import { App, Modal, Scope, requestUrl, setRequestUrlHandler } from "obsidian";

describe("Obsidian stub contract", () => {
  describe("globals", () => {
    // Observed on Obsidian 1.13.7 desktop: in the main window,
    // `activeDocument === document` is true.
    it("activeDocument is the main window's document", () => {
      expect(activeDocument).toBe(document);
    });
  });

  describe("requestUrl", () => {
    afterEach(() => {
      setRequestUrlHandler(null);
    });

    // Observed on Obsidian 1.13.7 desktop: a response with status 400 or above
    // rejects with an Error whose message is "Request failed, status <n>" and
    // whose own keys are exactly ["status", "headers"].
    it.each([403, 404, 500])("throws on status %i", async (status) => {
      setRequestUrlHandler(() => ({ status, headers: { "x-probe": "1" } }));

      const error: unknown = await requestUrl({
        url: `https://httpbin.org/status/${status}`,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`Request failed, status ${status}`);
      expect(Object.keys(error as object)).toEqual(["status", "headers"]);
      expect(error).toMatchObject({ status, headers: { "x-probe": "1" } });
    });

    // Observed on Obsidian 1.13.7 desktop: with `throw: false`, a 403 response
    // is returned instead of thrown.
    it("returns the response when throw is false", async () => {
      setRequestUrlHandler(() => ({ status: 403, text: "Forbidden" }));

      const response = await requestUrl({
        url: "https://httpbin.org/status/403",
        throw: false,
      });

      expect(response.status).toBe(403);
      expect(response.text).toBe("Forbidden");
    });

    it("returns responses below 400", async () => {
      setRequestUrlHandler(() => ({ status: 200, text: "ok" }));

      const response = await requestUrl({ url: "https://example.com/" });

      expect(response.status).toBe(200);
      expect(response.text).toBe("ok");
    });
  });

  describe("vault: hidden paths", () => {
    // Observed on Obsidian 1.13.7 desktop: `getAbstractFileByPath` returns
    // `null` for anything under a dot-prefixed folder (including `configDir`),
    // even when `adapter.exists` reports it on disk.
    it("leaves files and folders under a dot folder out of the vault index", async () => {
      const { vault } = new App();
      await vault.createFolder(".rss-meta");
      await vault.create(".rss-meta/data.json", "{}");

      expect(vault.getAbstractFileByPath(".rss-meta")).toBeNull();
      expect(vault.getAbstractFileByPath(".rss-meta/data.json")).toBeNull();
      expect(vault.getFiles().map((file) => file.path)).not.toContain(
        ".rss-meta/data.json",
      );
      expect(await vault.adapter.exists(".rss-meta")).toBe(true);
      expect(await vault.adapter.exists(".rss-meta/data.json")).toBe(true);
    });

    // Observed on Obsidian 1.13.7 desktop: `configDir` is a dot folder, so
    // the plugin's own folder is hidden from the vault index too.
    it("keeps the config folder, a dot folder, out of the vault index", async () => {
      const { vault } = new App();
      const pluginDir = `${vault.configDir}/plugins/rss-dashboard`;
      const manifestPath = `${pluginDir}/manifest.json`;
      await vault.adapter.mkdir(pluginDir);
      await vault.adapter.write(manifestPath, "{}");

      expect(vault.configDir.startsWith(".")).toBe(true);
      expect(vault.getAbstractFileByPath(manifestPath)).toBeNull();
      expect(await vault.adapter.exists(manifestPath)).toBe(true);
    });
  });

  describe("DOM helpers on a Document", () => {
    // Observed on Obsidian 1.13.7 desktop: `activeDocument.createDiv()` throws
    // `HierarchyRequestError` ("Only one element on document allowed"). The
    // Node helpers append the new element to their receiver, and the document
    // already has its <html> element. The stack trace shows createDiv going
    // through createEl; createSpan is the same Node helper (#409).
    it.each([
      ["createDiv", () => activeDocument.createDiv()],
      ["createSpan", () => activeDocument.createSpan()],
      ["createEl", () => activeDocument.createEl("p")],
    ])(
      "%s throws HierarchyRequestError on a document that has a root",
      (_name, create) => {
        expect(create).toThrow(
          expect.objectContaining({ name: "HierarchyRequestError" }),
        );
        expect(activeDocument.childElementCount).toBe(1);
      },
    );
  });

  describe("vault: existing paths and case", () => {
    // Observed on Obsidian 1.13.7 desktop (Windows): `createFolder` throws
    // `Folder already exists.` for an existing path and for a case variant.
    it("createFolder throws for an existing folder and its case variant", async () => {
      const { vault } = new App();
      await vault.createFolder("probe-folder");

      await expect(vault.createFolder("probe-folder")).rejects.toThrow(
        "Folder already exists.",
      );
      await expect(vault.createFolder("PROBE-Folder")).rejects.toThrow(
        "Folder already exists.",
      );
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): `create` throws
    // `File already exists.` for an existing path and for a case variant.
    it("create throws for an existing file and its case variant", async () => {
      const { vault } = new App();
      await vault.create("probe.md", "");

      await expect(vault.create("probe.md", "")).rejects.toThrow(
        "File already exists.",
      );
      await expect(vault.create("PROBE.md", "")).rejects.toThrow(
        "File already exists.",
      );
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): the vault index is
    // case-sensitive, but the file system is not, so a case variant has no
    // indexed entry while `adapter.exists` reports it on disk.
    it("looks paths up case-sensitively while the adapter sees case variants", async () => {
      const { vault } = new App();
      await vault.createFolder("probe-folder");

      expect(vault.getAbstractFileByPath("probe-folder")).not.toBeNull();
      expect(vault.getAbstractFileByPath("PROBE-Folder")).toBeNull();
      expect(await vault.adapter.exists("PROBE-Folder")).toBe(true);
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): `create` under a missing
    // parent folder throws Node's `ENOENT` error rather than creating it.
    it("create throws ENOENT when the parent folder is missing", async () => {
      const { vault } = new App();

      await expect(vault.create("probe-missing/x.md", "")).rejects.toThrow(
        /^ENOENT: no such file or directory, open '.*probe-missing\/x\.md'$/,
      );
    });

    // Not observed: Linux file systems are case-sensitive, so there a case
    // variant is a different path. The stub defaults to Windows and macOS
    // behavior; set `caseSensitiveFileSystem` to model Linux.
    it("treats case variants as different paths on a case-sensitive file system", async () => {
      const { vault } = new App();
      vault.caseSensitiveFileSystem = true;
      await vault.createFolder("probe-folder");

      expect(await vault.adapter.exists("PROBE-Folder")).toBe(false);
      await expect(vault.createFolder("PROBE-Folder")).resolves.toBeDefined();
    });
  });

  describe("vault adapter: file system model", () => {
    // Observed on Obsidian 1.13.7 desktop (Windows): `adapter.write` under a
    // missing parent folder throws Node's ENOENT error (with `code`) rather
    // than creating the folder.
    it("write throws ENOENT when the parent folder is missing", async () => {
      const { vault } = new App();

      const error: unknown = await vault.adapter
        .write("probe-missing/x.md", "")
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ code: "ENOENT" });
      expect((error as Error).message).toMatch(
        /^ENOENT: no such file or directory, open '.*probe-missing\/x\.md'$/,
      );
      expect(await vault.adapter.exists("probe-missing")).toBe(false);
      expect(await vault.adapter.exists("probe-missing/x.md")).toBe(false);
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): `adapter.mkdir` creates
    // nested folders and resolves `undefined`; `exists` then reports them.
    it("mkdir creates nested folders", async () => {
      const { vault } = new App();

      await expect(vault.adapter.mkdir("probe/m1/m2")).resolves.toBeUndefined();

      expect(await vault.adapter.exists("probe")).toBe(true);
      expect(await vault.adapter.exists("probe/m1")).toBe(true);
      expect(await vault.adapter.exists("probe/m1/m2")).toBe(true);
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): `adapter.list` sees
    // folders made by `adapter.mkdir` and files written by `adapter.write`,
    // and returns the full vault paths of the direct children only.
    it("list returns the direct children the adapter created", async () => {
      const { vault } = new App();
      await vault.adapter.mkdir("probe/m1/m2");
      await vault.adapter.write("probe/w.md", "hello");

      expect(await vault.adapter.list("probe")).toEqual({
        folders: ["probe/m1"],
        files: ["probe/w.md"],
      });
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): after `adapter.write` of
    // a path outside dot folders, `exists` is true and the vault index
    // returns the file.
    it("indexes a file written through the adapter", async () => {
      const { vault } = new App();
      await vault.adapter.mkdir("probe");
      await vault.adapter.write("probe/w.md", "hello");

      expect(await vault.adapter.exists("probe/w.md")).toBe(true);
      expect(vault.getAbstractFileByPath("probe/w.md")).toMatchObject({
        path: "probe/w.md",
      });
      expect(await vault.adapter.read("probe/w.md")).toBe("hello");
    });
  });

  describe("Modal", () => {
    afterEach(() => {
      document.body.empty();
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): `onOpen` runs with
    // `containerEl.isConnected === true`.
    it("runs onOpen with the container attached", () => {
      const modal = new Modal(new App());
      let connectedInOnOpen: boolean | null = null;
      modal.onOpen = () => {
        connectedInOnOpen = modal.containerEl.isConnected;
      };

      modal.open();

      expect(connectedInOnOpen).toBe(true);
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): `close()` detaches
    // `containerEl` first, then runs `onClose` (so `isConnected` is false
    // inside it), synchronously before `close()` returns.
    it("detaches the container before onClose, synchronously", () => {
      const modal = new Modal(new App());
      const log: string[] = [];
      modal.onClose = () => {
        log.push(`onClose connected=${modal.containerEl.isConnected}`);
      };
      modal.open();

      modal.close();
      log.push("close returned");

      expect(log).toEqual(["onClose connected=false", "close returned"]);
      expect(modal.containerEl.isConnected).toBe(false);
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): `scope` is a Scope,
    // `headerEl` has class `modal-header`, and `titleEl` is inside `headerEl`.
    it("has a scope and a header that holds the title", () => {
      const modal = new Modal(new App());
      // `headerEl` isn't in obsidian.d.ts (1.13.1).
      const { headerEl } = modal as Modal & { headerEl: HTMLElement };

      expect(modal.scope).toBeInstanceOf(Scope);
      expect(headerEl.className).toBe("modal-header");
      expect(modal.titleEl.parentElement).toBe(headerEl);
    });

    // Observed on Obsidian 1.13.7 desktop (Windows): `modalEl`'s children
    // are, in order, the close button, the header, and the content. There
    // is no `.modal-close-button` element, and `containerEl`'s class is
    // `modal-container mod-dim`.
    it("builds the 1.13.7 modal DOM", () => {
      const modal = new Modal(new App());

      expect(modal.containerEl.className).toBe("modal-container mod-dim");
      expect(
        Array.from(modal.modalEl.children).map((el) => el.className),
      ).toEqual([
        "modal-header-button mod-raised clickable-icon",
        "modal-header",
        "modal-content",
      ]);
      expect(modal.modalEl.children[1]).toBe(modal.titleEl.parentElement);
      expect(modal.modalEl.children[2]).toBe(modal.contentEl);
      expect(modal.containerEl.querySelector(".modal-close-button")).toBeNull();
    });

    // Not probed: clicking the close button closes the modal (standard
    // Obsidian behavior).
    it("closes when the close button is clicked", () => {
      const modal = new Modal(new App());
      let closed = false;
      modal.onClose = () => {
        closed = true;
      };
      modal.open();

      const closeButton = modal.modalEl.querySelector<HTMLElement>(
        ".modal-header-button",
      );
      closeButton?.click();

      expect(closed).toBe(true);
      expect(modal.containerEl.isConnected).toBe(false);
    });
  });
});
