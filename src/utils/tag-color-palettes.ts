export interface TagColorPaletteEntry {
  name: string;
  hex: string;
}

export interface TagColorPalette {
  name: string;
  colors: readonly TagColorPaletteEntry[];
}

export const TAG_COLOR_PALETTES: readonly TagColorPalette[] = [
  {
    name: "System",
    colors: [
      { name: "Red", hex: "#FF383C" },
      { name: "Orange", hex: "#FF8D28" },
      { name: "Yellow", hex: "#FFCC00" },
      { name: "Green", hex: "#34C759" },
      { name: "Mint", hex: "#00C8B3" },
      { name: "Teal", hex: "#00C3D0" },
      { name: "Cyan", hex: "#00C0E8" },
      { name: "Blue", hex: "#0088FF" },
      { name: "Purple", hex: "#8A5CF5" },
      { name: "Pink", hex: "#FF2D55" },
      { name: "Brown", hex: "#AC7F5E" },
    ],
  },
  {
    name: "Vintage",
    colors: [
      { name: "Red", hex: "#C65B50" },
      { name: "Orange", hex: "#D88745" },
      { name: "Yellow", hex: "#D6B94C" },
      { name: "Green", hex: "#72966A" },
      { name: "Mint", hex: "#80B7A5" },
      { name: "Teal", hex: "#579B9A" },
      { name: "Cyan", hex: "#78B7C4" },
      { name: "Blue", hex: "#547CA5" },
      { name: "Purple", hex: "#7E6AA8" },
      { name: "Pink", hex: "#D77991" },
      { name: "Brown", hex: "#A98263" },
    ],
  },
  {
    name: "Pastel",
    colors: [
      { name: "Red", hex: "#D77F86" },
      { name: "Orange", hex: "#E6AC7C" },
      { name: "Yellow", hex: "#E6D27C" },
      { name: "Green", hex: "#9DBB91" },
      { name: "Mint", hex: "#8FC9BD" },
      { name: "Teal", hex: "#72B4B8" },
      { name: "Cyan", hex: "#8DC5D4" },
      { name: "Blue", hex: "#86A9D3" },
      { name: "Purple", hex: "#B5A3DC" },
      { name: "Pink", hex: "#DEA0B5" },
      { name: "Brown", hex: "#BDA18A" },
    ],
  },
  {
    // The extreme of each hue, top-right of the RGB picker: one channel at
    // FF and one at 00 (Brown is the dark end of its hue, since full
    // brightness would just be orange). Loud on purpose, not tuned for text.
    name: "High Contrast",
    colors: [
      { name: "Red", hex: "#FF0022" },
      { name: "Orange", hex: "#FF6200" },
      { name: "Yellow", hex: "#FFE600" },
      { name: "Green", hex: "#00FF2A" },
      { name: "Mint", hex: "#00FFA2" },
      { name: "Teal", hex: "#00FFF7" },
      { name: "Cyan", hex: "#00CCFF" },
      { name: "Blue", hex: "#004CFF" },
      { name: "Purple", hex: "#7700FF" },
      { name: "Pink", hex: "#FF00A2" },
      { name: "Brown", hex: "#803000" },
    ],
  },
];
