import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useMyProfessional,
  useProfessionalAvailability,
  useProfessionalServices,
  useUpdateProfessional,
  useUpsertProfessionalAvailability,
  useUpsertProfessionalServices,
} from "@/hooks/useProfessionalServices";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function queryBuilder(result: unknown = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    upsert: vi.fn(async () => result),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    not: vi.fn(() => builder),
    then: (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("useProfessionalServices hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "user-1" };
  });

  it("loads active services, availability, and the current professional profile", async () => {
    const serviceRows = [{ id: "s1", professional_id: "pro-1", service_key: "valuation", service_name: "Valuation" }];
    const availabilityRows = [{ id: "a1", professional_id: "pro-1", day_of_week: 1 }];
    const professional = { id: "pro-1", user_id: "user-1", display_name: "Pro" };
    mocks.from.mockImplementation((table: string) => {
      if (table === "professional_services") return queryBuilder({ data: serviceRows, error: null });
      if (table === "professional_availability") return queryBuilder({ data: availabilityRows, error: null });
      return queryBuilder({ data: professional, error: null });
    });

    const services = renderHook(() => useProfessionalServices("pro-1"), { wrapper });
    const availability = renderHook(() => useProfessionalAvailability("pro-1"), { wrapper });
    const mine = renderHook(() => useMyProfessional(), { wrapper });

    await waitFor(() => expect(services.result.current.data).toEqual(serviceRows));
    await waitFor(() => expect(availability.result.current.data).toEqual(availabilityRows));
    await waitFor(() => expect(mine.result.current.data).toEqual(professional));
  });

  it("blocks professional service mutation without login, ownership, or matching professional id", async () => {
    mocks.user = null;
    const loggedOut = renderHook(() => useUpsertProfessionalServices(), { wrapper });
    await expect(loggedOut.result.current.mutateAsync({ professionalId: "pro-1", services: [] })).rejects.toThrow("Must be logged in");

    mocks.user = { id: "user-1" };
    mocks.from.mockReturnValue(queryBuilder({ data: null, error: null }));
    const unauthorized = renderHook(() => useUpsertProfessionalServices(), { wrapper });
    await expect(unauthorized.result.current.mutateAsync({ professionalId: "pro-1", services: [] })).rejects.toThrow("Unauthorized");

    mocks.from.mockReturnValue(queryBuilder({ data: { user_id: "user-1" }, error: null }));
    const wrongOwner = renderHook(() => useUpsertProfessionalServices(), { wrapper });
    await expect(
      wrongOwner.result.current.mutateAsync({
        professionalId: "pro-1",
        services: [{ professional_id: "pro-2", service_key: "x", service_name: "X" } as never],
      }),
    ).rejects.toThrow("Cannot update services for another professional");
  });

  it("upserts and prunes services, including the delete-all branch", async () => {
    const serviceBuilder = queryBuilder({ data: { user_id: "user-1" }, error: null });
    const deleteBuilder = queryBuilder({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => (table === "professionals" ? serviceBuilder : deleteBuilder));
    const hook = renderHook(() => useUpsertProfessionalServices(), { wrapper });

    await act(async () => {
      await hook.result.current.mutateAsync({
        professionalId: "pro-1",
        services: [
          {
            professional_id: "pro-1",
            service_key: "valuation",
            service_name: "Valuation",
            description: null,
            category: "engineer",
            pricing_model: "fixed",
            rate_amount: 120,
            currency: "EUR",
            estimated_hours: null,
            video_enabled: true,
            is_premium: false,
            is_active: true,
          },
        ],
      });
    });
    expect(deleteBuilder.upsert).toHaveBeenCalled();
    expect(deleteBuilder.not).toHaveBeenCalledWith("service_key", "in", "(valuation)");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Services updated!");

    await hook.result.current.mutateAsync({ professionalId: "pro-1", services: [] });
    expect(deleteBuilder.delete).toHaveBeenCalled();
  });

  it("upserts availability and rejects rows for another professional", async () => {
    mocks.from.mockReturnValue(queryBuilder({ data: { user_id: "user-1" }, error: null }));
    const hook = renderHook(() => useUpsertProfessionalAvailability(), { wrapper });

    await expect(
      hook.result.current.mutateAsync({
        professionalId: "pro-1",
        availability: [{ professional_id: "other", day_of_week: 1 } as never],
      }),
    ).rejects.toThrow("Cannot update availability for another professional");

    await hook.result.current.mutateAsync({
      professionalId: "pro-1",
      availability: [
        {
          professional_id: "pro-1",
          day_of_week: 2,
          start_time: "09:00",
          end_time: "17:00",
          is_active: true,
        },
      ],
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Availability updated!");
  });

  it("updates the current professional and reports mutation errors", async () => {
    const okBuilder = queryBuilder({ data: null, error: null });
    mocks.from.mockReturnValue(okBuilder);
    const hook = renderHook(() => useUpdateProfessional(), { wrapper });
    await hook.result.current.mutateAsync({ id: "pro-1", updates: { display_name: "Updated" } });
    expect(okBuilder.update).toHaveBeenCalledWith({ display_name: "Updated" });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Profile updated!");

    const failingBuilder = queryBuilder({ data: null, error: new Error("update failed") });
    mocks.from.mockReturnValue(failingBuilder);
    const failing = renderHook(() => useUpdateProfessional(), { wrapper });
    await expect(failing.result.current.mutateAsync({ id: "pro-1", updates: { display_name: "Broken" } })).rejects.toThrow("update failed");
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Failed to update profile. Please try again."));
  });
});
