import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, useAuthMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));

import { useManageableOrganizations } from "@/hooks/useManageableOrganizations";
import { accountQueryKey } from "@/lib/identityQueryBoundary";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("useManageableOrganizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
  });

  it("returns active organizations with project-manage roles on an account-scoped key", async () => {
    const inMock = vi.fn().mockResolvedValue({
      data: [
        {
          organization_id: "org-2",
          role: "member",
          organizations: { id: "org-2", name: "Zeta Developments" },
        },
        {
          organization_id: "org-1",
          role: "admin",
          organizations: { id: "org-1", name: "Alpha Developments" },
        },
      ],
      error: null,
    });
    const eqStatusMock = vi.fn().mockReturnValue({ in: inMock });
    const eqUserMock = vi.fn().mockReturnValue({ eq: eqStatusMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    fromMock.mockReturnValue({ select: selectMock });
    const { queryClient, Wrapper } = createWrapper();

    const { result } = renderHook(() => useManageableOrganizations(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "org-1", name: "Alpha Developments", role: "admin" },
      { id: "org-2", name: "Zeta Developments", role: "member" },
    ]);
    expect(queryClient.getQueryData(accountQueryKey("user-1", "manageable-organizations"))).toEqual(result.current.data);
    expect(fromMock).toHaveBeenCalledWith("organization_memberships");
    expect(inMock).toHaveBeenCalledWith("role", ["owner", "admin", "member"]);
  });

  it("does not query while signed out", () => {
    useAuthMock.mockReturnValue({ user: null });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useManageableOrganizations(), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fromMock).not.toHaveBeenCalled();
  });
});
