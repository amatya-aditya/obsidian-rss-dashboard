import { beforeEach, describe, expect, it, vi } from "vitest";
import { addTagColorPaletteControl } from "../../../src/components/tag-color-palette-control";
import { TAG_COLOR_PALETTES } from "../../../src/utils/tag-color-palettes";
import { DEFAULT_TAG_COLOR } from "../../../src/utils/tag-colors";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("tag color palette controls", () => {
  it("contains the exact four named 11-color palettes", () => {
    expect(TAG_COLOR_PALETTES.map(({ name }) => name)).toEqual([
      "System",
      "Vintage",
      "Pastel",
      "High Contrast",
    ]);
    expect(TAG_COLOR_PALETTES.map(({ colors }) => colors.length)).toEqual([
      11, 11, 11, 11,
    ]);
    expect(
      TAG_COLOR_PALETTES.map(({ colors }) =>
        colors.map(({ name, hex }) => `${name} ${hex}`),
      ),
    ).toEqual([
      [
        "Red #FF383C",
        "Orange #FF8D28",
        "Yellow #FFCC00",
        "Green #34C759",
        "Mint #00C8B3",
        "Teal #00C3D0",
        "Cyan #00C0E8",
        "Blue #0088FF",
        "Purple #8A5CF5",
        "Pink #FF2D55",
        "Brown #AC7F5E",
      ],
      [
        "Red #C65B50",
        "Orange #D88745",
        "Yellow #D6B94C",
        "Green #72966A",
        "Mint #80B7A5",
        "Teal #579B9A",
        "Cyan #78B7C4",
        "Blue #547CA5",
        "Purple #7E6AA8",
        "Pink #D77991",
        "Brown #A98263",
      ],
      [
        "Red #D77F86",
        "Orange #E6AC7C",
        "Yellow #E6D27C",
        "Green #9DBB91",
        "Mint #8FC9BD",
        "Teal #72B4B8",
        "Cyan #8DC5D4",
        "Blue #86A9D3",
        "Purple #B5A3DC",
        "Pink #DEA0B5",
        "Brown #BDA18A",
      ],
      [
        "Red #FF0022",
        "Orange #FF6200",
        "Yellow #FFE600",
        "Green #00FF2A",
        "Mint #00FFA2",
        "Teal #00FFF7",
        "Cyan #00CCFF",
        "Blue #004CFF",
        "Purple #7700FF",
        "Pink #FF00A2",
        "Brown #803000",
      ],
    ]);
  });

  it("has no Indigo, so Purple stays distinct, and System Purple is Obsidian purple", () => {
    for (const { colors } of TAG_COLOR_PALETTES) {
      expect(colors.map(({ name }) => name)).not.toContain("Indigo");
    }
    expect(
      TAG_COLOR_PALETTES[0]?.colors.find(({ name }) => name === "Purple")?.hex,
    ).toBe(DEFAULT_TAG_COLOR.toUpperCase());
  });

  it("makes every High Contrast color the extreme of its hue", () => {
    const highContrast = TAG_COLOR_PALETTES.find(
      ({ name }) => name === "High Contrast",
    );
    expect(highContrast).toBeDefined();
    for (const { name, hex } of highContrast?.colors ?? []) {
      const channels = [1, 3, 5].map((offset) =>
        parseInt(hex.slice(offset, offset + 2), 16),
      );
      // Top-right of the RGB picker: a channel at 0 ...
      expect(Math.min(...channels), `${name} ${hex}`).toBe(0);
      // ... and a channel at 255. Brown is the dark end of its hue, because
      // full brightness would just be orange.
      if (name !== "Brown") {
        expect(Math.max(...channels), `${name} ${hex}`).toBe(255);
      }
    }
  });

  it("marks the Color trigger as a dropdown with a decorative up/down chevron", () => {
    const field = createField("Background", "#123456");
    const trigger = field.querySelector<HTMLButtonElement>(
      ".rss-dashboard-tag-color-palette-control-color-trigger",
    )!;

    const chevron = trigger.querySelector<HTMLElement>(
      ".rss-dashboard-tag-color-palette-control-chevron",
    );
    expect(chevron).not.toBeNull();
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
    expect(chevron?.querySelector("svg")).not.toBeNull();
    // The icon is an svg, so the visible label text is unchanged.
    expect(trigger.textContent).toBe("Custom #123456");
    // The chevron sits after the label so it lands at the trigger's right edge.
    expect(trigger.lastElementChild).toBe(chevron);
  });

  it("gives the Palette select the same decorative chevron, beside its native arrow reset", () => {
    const field = createField("Background", "#123456");
    const select = field.querySelector<HTMLSelectElement>("select")!;

    const chevron = select.parentElement?.querySelector<HTMLElement>(
      ".rss-dashboard-tag-color-palette-control-select-chevron",
    );
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
    expect(chevron?.querySelector("svg")).not.toBeNull();
    expect(select.getAttribute("aria-label")).toBe("Palette for Background");
    expect(
      field.querySelector(".rss-dashboard-tag-color-palette-control-select"),
    ).toBe(select.parentElement);
  });

  it("shows the Palette and Color captions unless a row turns them off", () => {
    const labelsOf = (host: HTMLElement) =>
      Array.from(
        host.querySelectorAll(".rss-dashboard-tag-color-palette-control-label"),
      ).map((label) => label.textContent);

    expect(labelsOf(createField("Background", "#123456"))).toEqual([
      "Palette",
      "Color",
    ]);

    const quiet = createDiv();
    document.body.appendChild(quiet);
    addTagColorPaletteControl({
      container: quiet,
      input: quiet.createEl("input", {
        attr: { type: "color", value: "#123456" },
      }),
      fieldName: "Text",
      showFieldLabels: false,
    });
    expect(labelsOf(quiet)).toEqual([]);
    expect(quiet.querySelector("select")?.getAttribute("aria-label")).toBe(
      "Palette for Text",
    );
    expect(
      quiet
        .querySelector(".rss-dashboard-tag-color-palette-control-color-trigger")
        ?.getAttribute("aria-label"),
    ).toContain("Color for Text");
  });

  it("keeps the hex readout by default and never attaches it when turned off", () => {
    const readoutIn = (host: HTMLElement) =>
      host.querySelector(
        ".rss-dashboard-tag-color-palette-control-value-readout",
      );

    expect(readoutIn(createField("Background", "#123456"))?.textContent).toBe(
      "#123456",
    );

    const quiet = createDiv();
    document.body.appendChild(quiet);
    addTagColorPaletteControl({
      container: quiet,
      input: quiet.createEl("input", {
        attr: { type: "color", value: "#123456" },
      }),
      fieldName: "Text",
      showValueReadout: false,
    });
    expect(readoutIn(quiet)).toBeNull();
    expect(
      quiet.querySelector(
        ".rss-dashboard-tag-color-palette-control-selected-label",
      )?.textContent,
    ).toBe("Custom #123456");
  });

  it("preserves custom values on palette switches and selects a named preset", () => {
    const field = createField("Background", "#123456");
    const input = field.querySelector<HTMLInputElement>("input[type=color]")!;
    const palette = field.querySelector<HTMLSelectElement>("select")!;
    const trigger = field.querySelector<HTMLButtonElement>(
      ".rss-dashboard-tag-color-palette-control-color-trigger",
    )!;
    const inputChanges = vi.fn();
    input.addEventListener("change", inputChanges);

    expect(palette.getAttribute("aria-label")).toBe("Palette for Background");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.textContent).toContain("Custom #123456");

    palette.value = "Vintage";
    palette.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("#123456");
    expect(inputChanges).not.toHaveBeenCalled();

    trigger.click();
    const options =
      field.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options).toHaveLength(11);
    const blue = Array.from(options).find(
      (option) => option.getAttribute("aria-label") === "Blue #547CA5",
    )!;
    expect(blue.textContent).toContain("Blue");
    expect(blue.textContent).toContain("#547CA5");
    expect(
      blue
        .querySelector<HTMLElement>(
          ".rss-dashboard-tag-color-palette-control-swatch",
        )
        ?.style.getPropertyValue("--tag-color-swatch"),
    ).toBe("#547CA5");
    blue.click();

    expect(input.value).toBe("#547ca5");
    expect(inputChanges).toHaveBeenCalledOnce();
    expect(trigger.textContent).toContain("Blue #547CA5");
  });

  it("keeps palette choices independent per color field", () => {
    const field = createDiv();
    document.body.appendChild(field);
    const background = field.createDiv();
    background.createEl("input", {
      attr: { type: "color", value: "#112233" },
    });
    addTagColorPaletteControl({
      container: background,
      input: background.querySelector("input")!,
      fieldName: "Background",
    });
    const text = field.createDiv();
    text.createEl("input", { attr: { type: "color", value: "#445566" } });
    addTagColorPaletteControl({
      container: text,
      input: text.querySelector("input")!,
      fieldName: "Text",
    });

    const backgroundPalette = background.querySelector("select")!;
    const textPalette = text.querySelector("select")!;
    backgroundPalette.value = "High Contrast";
    backgroundPalette.dispatchEvent(new Event("change", { bubbles: true }));

    expect(backgroundPalette.value).toBe("High Contrast");
    expect(textPalette.value).toBe("System");
  });

  it("disconnects the old detached-field observer when switching an open palette", () => {
    const field = createField("Background", "#112233");
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const palette = field.querySelector<HTMLSelectElement>("select")!;
    field
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-tag-color-palette-control-color-trigger",
      )!
      .click();

    palette.value = "Vintage";
    palette.dispatchEvent(new Event("change", { bubbles: true }));

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("closes an open listbox when its owning field is removed", async () => {
    const field = createField("Text", "#ffffff");
    const trigger = field.querySelector<HTMLButtonElement>(
      ".rss-dashboard-tag-color-palette-control-color-trigger",
    )!;
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    field.remove();
    await Promise.resolve();

    expect(field.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

function createField(fieldName: string, value: string): HTMLElement {
  const field = createDiv();
  document.body.appendChild(field);
  const input = field.createEl("input", {
    attr: { type: "color", value },
  });
  addTagColorPaletteControl({
    container: field,
    input,
    fieldName,
  });
  return field;
}
