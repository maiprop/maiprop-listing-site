import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, refreshSessionMock, invokeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";

const futureExpiry = () => Math.floor(Date.now() / 1000) + 3_600;

beforeEach(() => {
  getSessionMock.mockReset();
  refreshSessionMock.mockReset();
  invokeMock.mockReset();
  getSessionMock.mockResolvedValue({
    data: { session: { access_token: "fresh-token", expires_at: futureExpiry() } },
  });
  refreshSessionMock.mockResolvedValue({
    data: { session: { access_token: "refreshed-token", expires_at: futureExpiry() } },
  });
  invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("invokeAuthenticatedFunction", () => {
  it("adds the current access token to Edge Function calls", async () => {
    await invokeAuthenticatedFunction("property-valuation", { body: { listingId: "l-1" } });

    expect(invokeMock).toHaveBeenCalledWith("property-valuation", {
      body: { listingId: "l-1" },
      headers: { Authorization: "Bearer fresh-token" },
    });
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("refreshes the session and retries once when the function rejects an expired token", async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { error: "Invalid or expired token" }, error: null })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    const result = await invokeAuthenticatedFunction("neighbourhood-report", { body: { city: "Athens" } });

    expect(result.data).toEqual({ ok: true });
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[1]).toEqual([
      "neighbourhood-report",
      {
        body: { city: "Athens" },
        headers: { Authorization: "Bearer refreshed-token" },
      },
    ]);
  });
});
