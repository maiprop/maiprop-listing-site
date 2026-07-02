import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordUserAuthActivity, shouldLogAuthActivityWarning } from "@/lib/authActivity";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => mocks.warn(...args) },
}));

describe("recordUserAuthActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: "event-1", error: null });
  });

  it("records app auth events through the narrow RPC", async () => {
    await expect(recordUserAuthActivity({
      eventType: "sign_in",
      route: "/dashboard",
      metadata: { source: "test" },
    })).resolves.toBe("event-1");

    expect(mocks.rpc).toHaveBeenCalledWith("record_user_auth_activity", {
      p_event_type: "sign_in",
      p_route: "/dashboard",
      p_metadata: { source: "test" },
    });
  });

  it("logs RPC failures without breaking auth flow", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });

    await expect(recordUserAuthActivity({
      eventType: "session_restored",
      route: "/admin",
    })).resolves.toBeNull();

    expect(mocks.warn).toHaveBeenCalledWith("[auth activity] record_user_auth_activity failed", "permission denied");
  });

  it("keeps transient dev network telemetry failures out of the console noise", () => {
    expect(shouldLogAuthActivityWarning(new TypeError("Failed to fetch"))).toBe(false);
    expect(shouldLogAuthActivityWarning(new DOMException("Request aborted", "AbortError"))).toBe(false);
    expect(shouldLogAuthActivityWarning("permission denied")).toBe(true);
  });
});
