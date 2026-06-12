import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, storageFromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  storageFromMock: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "",
  GOOGLE_PLACES_AUTOCOMPLETE_ENABLED: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    storage: {
      from: (...args: unknown[]) => storageFromMock(...args),
    },
  },
}));

import { useCreateListingConnections } from "@/hooks/useCreateListingConnections";

beforeEach(() => {
  fromMock.mockReset();
  storageFromMock.mockReset();
});

describe("useCreateListingConnections", () => {
  it("marks Supabase, storage, and public Nominatim fallback as connected", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "listing-1" }], error: null }),
    });
    storageFromMock.mockReturnValue({
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn/listing-images/check" } }),
    });

    const { result } = renderHook(() => useCreateListingConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fromMock).toHaveBeenCalledWith("listings");
    expect(storageFromMock).toHaveBeenCalledWith("listing-images");
    expect(result.current).toEqual({
      supabaseOk: true,
      storageOk: true,
      locationSource: "nominatim",
      locationOk: true,
      loading: false,
    });
  });

  it("does not probe storage when the listings table probe fails", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: new Error("permission denied") }),
    });

    const { result } = renderHook(() => useCreateListingConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(storageFromMock).not.toHaveBeenCalled();
    expect(result.current.supabaseOk).toBe(false);
    expect(result.current.storageOk).toBe(false);
    expect(result.current.locationOk).toBe(true);
  });
});
