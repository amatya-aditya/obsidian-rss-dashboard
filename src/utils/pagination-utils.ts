export function computePagination(params: {
  totalItems: number;
  pageSize: number;
  requestedPage: number;
}): {
  totalPages: number;
  currentPage: number;
  startIdx: number;
  endIdx: number;
} {
  const totalItems = Number.isFinite(params.totalItems)
    ? Math.max(0, params.totalItems)
    : 0;
  const pageSize = params.pageSize;
  const requestedPage = Number.isFinite(params.requestedPage)
    ? params.requestedPage
    : 1;

  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return {
      totalPages: 1,
      currentPage: 1,
      startIdx: 0,
      endIdx: totalItems,
    };
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.max(1, Math.min(requestedPage, totalPages));
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  return { totalPages, currentPage, startIdx, endIdx };
}

export function computeResultsRange(params: {
  totalItems: number;
  pageSize: number;
  currentPage: number;
}): { start: number; end: number } {
  const totalItems = Number.isFinite(params.totalItems)
    ? Math.max(0, params.totalItems)
    : 0;
  const pageSize = params.pageSize;
  const currentPage = Number.isFinite(params.currentPage)
    ? Math.max(1, params.currentPage)
    : 1;

  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return { start: totalItems > 0 ? 1 : 0, end: totalItems };
  }

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  return { start, end };
}

