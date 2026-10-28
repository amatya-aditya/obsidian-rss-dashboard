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
      { name: "Indigo", hex: "#6155F5" },
      { name: "Purple", hex: "#CB30E0" },
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
      { name: "Indigo", hex: "#7775AA" },
      { name: "Purple", hex: "#A36A9B" },
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
      { name: "Indigo", hex: "#A6A0D3" },
      { name: "Purple", hex: "#C49BC4" },
      { name: "Pink", hex: "#DEA0B5" },
      { name: "Brown", hex: "#BDA18A" },
    ],
  },
  {
    name: "Neon/Synthwave",
    colors: [
      { name: "Red", hex: "#FF4D6D" },
      { name: "Orange", hex: "#FF8A24" },
      { name: "Yellow", hex: "#FFD447" },
      { name: "Green", hex: "#4ADE80" },
      { name: "Mint", hex: "#22D3C5" },
      { name: "Teal", hex: "#14B8D4" },
      { name: "Cyan", hex: "#38BDF8" },
      { name: "Blue", hex: "#3B82F6" },
      { name: "Indigo", hex: "#6366F1" },
      { name: "Purple", hex: "#D946EF" },
      { name: "Pink", hex: "#F472B6" },
      { name: "Violet", hex: "#A78BFA" },
    ],
  },
];
