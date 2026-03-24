export const PAGE_SIZE_OPTIONS = [10, 20, 40, 50, 60, 80, 100] as const;

export function getPageSizeOptions(currentPageSize: number): number[] {
  const options = [...PAGE_SIZE_OPTIONS] as number[];
  if (
    Number.isFinite(currentPageSize) &&
    currentPageSize > 0 &&
    !options.includes(currentPageSize)
  ) {
    options.push(currentPageSize);
  }
  options.sort((a, b) => a - b);
  return options;
}

