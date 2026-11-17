import { describe, it, expect, vi, beforeEach } from "vitest";
import { navigateAfterSubmit } from "../afterSubmit";

// Mock markTaskCompleted
vi.mock("../completedTasks", () => ({
  markTaskCompleted: vi.fn(),
}));
import { markTaskCompleted } from "../completedTasks";

function makeRouter() {
  return { push: vi.fn() } as unknown as import("next/dist/shared/lib/app-router-context.shared-runtime").AppRouterInstance;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("navigateAfterSubmit", () => {
  it("calls router.push with the destination", () => {
    const router = makeRouter();
    navigateAfterSubmit(router, null, "/some/path");
    expect(router.push).toHaveBeenCalledWith("/some/path");
  });

  it("calls markTaskCompleted when instanceId is provided", () => {
    const router = makeRouter();
    navigateAfterSubmit(router, "inst-abc", "/some/path");
    expect(markTaskCompleted).toHaveBeenCalledWith("inst-abc");
    expect(router.push).toHaveBeenCalledWith("/some/path");
  });

  it("does not call markTaskCompleted when instanceId is null", () => {
    const router = makeRouter();
    navigateAfterSubmit(router, null, "/some/path");
    expect(markTaskCompleted).not.toHaveBeenCalled();
  });

  it("does not call markTaskCompleted when instanceId is undefined", () => {
    const router = makeRouter();
    navigateAfterSubmit(router, undefined, "/some/path");
    expect(markTaskCompleted).not.toHaveBeenCalled();
  });
});
