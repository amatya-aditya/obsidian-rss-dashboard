// Stub for obsidian module in tests - currently unused but available for mocking if needed
export async function requestUrl(): Promise<{ status: number; text: string }> {
  throw new Error("requestUrl stub - configure mock in test if needed");
}

export const Platform = {
  isAndroidApp: false,
};
