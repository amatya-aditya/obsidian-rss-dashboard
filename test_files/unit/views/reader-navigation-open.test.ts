import { describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";

/**
 * A real ReaderView prototype (so the production methods run) wired to a
 * stub dashboard, which is all the Reader's navigation actions touch.
 */
function makeReaderWithDashboard() {
  const dashboard = {
    actionNavigateNext: vi.fn(),
    actionNavigatePrevious: vi.fn(),
  };
  const reader = Object.create(ReaderView.prototype) as ReaderView;
  Object.assign(reader, { getDashboardView: () => dashboard });
  return { reader, dashboard };
}

describe("Reader article navigation", () => {
  it("opens the next article in the Reader when moving forward", () => {
    const { reader, dashboard } = makeReaderWithDashboard();

    reader.actionNavigateNext();

    expect(dashboard.actionNavigateNext).toHaveBeenCalledWith({ open: true });
    expect(dashboard.actionNavigatePrevious).not.toHaveBeenCalled();
  });

  it("opens the previous article in the Reader when moving back", () => {
    const { reader, dashboard } = makeReaderWithDashboard();

    reader.actionNavigatePrevious();

    expect(dashboard.actionNavigatePrevious).toHaveBeenCalledWith({
      open: true,
    });
    expect(dashboard.actionNavigateNext).not.toHaveBeenCalled();
  });
});
