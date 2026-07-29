import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CreateBuildingListingInput,
  useCreateBuildingListing,
} from "@/hooks/useCreateBuildingListing";

const {
  invokeMock,
  uploadProjectMediaMock,
  deleteProjectMediaUrlsMock,
  geocodeAddressTextMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  uploadProjectMediaMock: vi.fn(),
  deleteProjectMediaUrlsMock: vi.fn(),
  geocodeAddressTextMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/lib/buildingListingUploads", () => ({
  uploadProjectMedia: (...args: unknown[]) => uploadProjectMediaMock(...args),
  deleteProjectMediaUrls: (...args: unknown[]) => deleteProjectMediaUrlsMock(...args),
}));

vi.mock("@/lib/location/geocodeAddress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/location/geocodeAddress")>("@/lib/location/geocodeAddress");
  return {
    ...actual,
    geocodeAddressText: (...args: unknown[]) => geocodeAddressTextMock(...args),
  };
});

const renderCreateBuildingListingHook = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(() => useCreateBuildingListing(), { wrapper }),
    queryClient,
  };
};

const makeInput = (overrides: Partial<CreateBuildingListingInput> = {}): CreateBuildingListingInput => ({
  projectId: "22222222-2222-4222-8222-222222222222",
  organizationId: "44444444-4444-4444-8444-444444444444",
  userId: "11111111-1111-4111-8111-111111111111",
  project: {
    name: "  Marina Heights  ",
    building_permit_number: "  123/2026  ",
    developer_company: "",
    architect_group: "Studio A",
    construction_company: "",
    description: "",
    address: "Seafront 1",
    city: "  Athens  ",
    municipality: "",
    area_description: "",
    permit_approval_date: "",
    construction_start_date: "",
    structural_completion_date: "",
    delivery_date: "",
    latitude: "37.98",
    longitude: "",
  },
  unit: {
    unit_id: "",
    floor: "",
    unit_number: "",
    internal_sqm: "100",
    balcony_sqm: "",
    storage_sqm: "",
    parking_sqm: "",
    bedrooms: "2",
    bathrooms: "1",
    kitchen_type: "",
    living_rooms: "",
    price: "250000",
    vat_included: true,
    parking_price: "",
    storage_price: "",
    sea_view: false,
    city_view: true,
    mountain_view: false,
    energy_class: "",
    heating_system: "",
    cooling_system: "",
  },
  projectMedia: {
    rendering: new File(["render"], "render.jpg", { type: "image/jpeg" }),
    floor_plan: null,
    site_plan: null,
    brochure_pdf: null,
    drone: null,
    walkthrough: null,
    progress: null,
    video: null,
  },
  listing: { title: "Ignored", description: "" },
  finalTitle: "Marina Heights A1",
  coverImageUrl: "https://cdn.test/cover.jpg",
  additionalImageUrls: ["https://cdn.test/2.jpg", "https://cdn.test/3.jpg"],
  ...overrides,
});

describe("useCreateBuildingListing coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "22222222-2222-4222-8222-222222222222"),
    });
    uploadProjectMediaMock.mockResolvedValue("https://cdn.test/project-media/render.jpg");
    deleteProjectMediaUrlsMock.mockResolvedValue(undefined);
    geocodeAddressTextMock.mockReset();
    geocodeAddressTextMock.mockResolvedValue(null);
    invokeMock.mockResolvedValue({
      data: { data: { listingId: "33333333-3333-4333-8333-333333333333" }, error: null },
      error: null,
    });
  });

  it("uploads project media and creates the new build through the Edge boundary", async () => {
    const { result } = renderCreateBuildingListingHook();

    await expect(act(async () => result.current(makeInput()))).resolves.toEqual({
      listingId: "33333333-3333-4333-8333-333333333333",
    });

    expect(uploadProjectMediaMock).toHaveBeenCalledWith(
      expect.any(File),
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "rendering",
    );
    expect(invokeMock).toHaveBeenCalledWith("create-new-building-listing", {
      body: expect.objectContaining({
        project: expect.objectContaining({
          id: "22222222-2222-4222-8222-222222222222",
          name: "Marina Heights",
          building_permit_number: "123/2026",
          architect_group: "Studio A",
          city: "Athens",
          construction_year: undefined,
          renovation_year: undefined,
          latitude: undefined,
          longitude: undefined,
        }),
        units: [
          expect.objectContaining({
            internal_sqm: 100,
            price: 250000,
            bedrooms: 2,
            bathrooms: 1,
            city_view: true,
          }),
        ],
        projectMedia: [{
          url: "https://cdn.test/project-media/render.jpg",
          media_type: "rendering",
          sort_order: 0,
        }],
        listing: {
          title: "Marina Heights A1",
          description: undefined,
          cover_image_url: "https://cdn.test/cover.jpg",
        },
        organizationId: "44444444-4444-4444-8444-444444444444",
        additionalImageUrls: ["https://cdn.test/2.jpg", "https://cdn.test/3.jpg"],
      }),
    });
    const requestBody = invokeMock.mock.calls[0][1].body;
    expect(requestBody.project).not.toHaveProperty("owner_id");
    expect(requestBody).not.toHaveProperty("unit");
    expect(requestBody.units[0]).not.toHaveProperty("project_id");
    expect(requestBody.units[0]).not.toHaveProperty("availability_status");
    expect(requestBody.units[0]).not.toHaveProperty("price_per_sqm");
    expect(requestBody.listing).not.toHaveProperty("owner_id");
    expect(requestBody.listing).not.toHaveProperty("project_id");
    expect(requestBody.listing).not.toHaveProperty("listing_type");
    expect(requestBody.listing).not.toHaveProperty("status");
  });

  it("skips project media upload when no optional project assets are present", async () => {
    const { result } = renderCreateBuildingListingHook();

    await act(async () => {
      await result.current(makeInput({
        projectMedia: {
          rendering: null,
          floor_plan: null,
          site_plan: null,
          brochure_pdf: null,
          drone: null,
          walkthrough: null,
          progress: null,
          video: null,
        },
        additionalImageUrls: [],
        unit: { ...makeInput().unit, internal_sqm: "50", price: "1000" },
      }));
    });

    expect(uploadProjectMediaMock).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("create-new-building-listing", {
      body: expect.objectContaining({
        projectMedia: [],
        additionalImageUrls: [],
        units: [expect.objectContaining({
          internal_sqm: 50,
        })],
      }),
    });
    expect(invokeMock.mock.calls[0][1].body.units[0]).not.toHaveProperty("price_per_sqm");
  });

  it("sends project chronology while leaving commercial listing metadata to the server", async () => {
    const { result } = renderCreateBuildingListingHook();

    await act(async () => {
      await result.current(makeInput({
        project: {
          ...makeInput().project,
          permit_approval_date: "2026-01-15",
          construction_start_date: "2026-02-01",
          delivery_date: "2026-08-21",
        },
      }));
    });

    expect(invokeMock).toHaveBeenCalledWith("create-new-building-listing", {
      body: expect.objectContaining({
        project: expect.objectContaining({
          permit_approval_date: "2026-01-15",
          construction_start_date: "2026-02-01",
          delivery_date: "2026-08-21",
        }),
      }),
    });
    const listingPayload = invokeMock.mock.calls[0][1].body.listing;
    expect(listingPayload).not.toHaveProperty("construction_status");
    expect(listingPayload).not.toHaveProperty("year_built");
  });

  it("geocodes the project address without duplicating coordinates into the listing payload", async () => {
    geocodeAddressTextMock.mockResolvedValue({ latitude: "38.0202", longitude: "23.7126" });
    const { result } = renderCreateBuildingListingHook();

    await act(async () => {
      await result.current(makeInput({
        project: {
          ...makeInput().project,
          address: "Υμηττού 6",
          city: "Άγιοι Ανάργυροι Αττικής",
          municipality: "Δήμος Αγίων Αναργύρων – Καματερού",
          latitude: "",
          longitude: "",
        },
      }));
    });

    expect(geocodeAddressTextMock).toHaveBeenCalledWith({
      address: "Υμηττού 6",
      city: "Άγιοι Ανάργυροι Αττικής",
      municipality: "Δήμος Αγίων Αναργύρων – Καματερού",
    });
    expect(invokeMock).toHaveBeenCalledWith("create-new-building-listing", {
      body: expect.objectContaining({
        project: expect.objectContaining({
          latitude: 38.0202,
          longitude: 23.7126,
        }),
      }),
    });
    expect(invokeMock.mock.calls[0][1].body.listing).not.toHaveProperty("latitude");
    expect(invokeMock.mock.calls[0][1].body.listing).not.toHaveProperty("longitude");
  });

  it("sends raw unit facts and renovation years through the Edge boundary", async () => {
    const { result } = renderCreateBuildingListingHook();

    await act(async () => {
      await result.current(makeInput({
        projectKind: "renovation",
        project: {
          ...makeInput().project,
          construction_year: "1982",
          renovation_year: "2026",
          delivery_date: "2026-09-01",
        },
        units: [
          {
            ...makeInput().unit,
            unit_id: "R1",
            unit_number: "1",
            internal_sqm: "80",
            price: "280000",
          },
          {
            ...makeInput().unit,
            unit_id: "R2",
            unit_number: "2",
            internal_sqm: "100",
            price: "360000",
          },
        ],
      } as Partial<CreateBuildingListingInput>));
    });

    expect(invokeMock).toHaveBeenCalledWith("create-new-building-listing", {
      body: expect.objectContaining({
        projectKind: "renovation",
        units: [
          expect.objectContaining({
            unit_id: "R1",
            internal_sqm: 80,
            price: 280000,
          }),
          expect.objectContaining({
            unit_id: "R2",
            internal_sqm: 100,
            price: 360000,
          }),
        ],
        project: expect.objectContaining({
          construction_year: 1982,
          renovation_year: 2026,
        }),
      }),
    });
    const body = invokeMock.mock.calls[0][1].body;
    expect(body.units.every((item: Record<string, unknown>) => !("price_per_sqm" in item))).toBe(true);
    expect(body.listing).not.toHaveProperty("tags");
    expect(body.listing).not.toHaveProperty("price");
  });

  it("reuses the caller-owned project id across retries", async () => {
    const { result } = renderCreateBuildingListingHook();
    const input = makeInput({
      projectMedia: {
        rendering: null,
        floor_plan: null,
        site_plan: null,
        brochure_pdf: null,
        drone: null,
        walkthrough: null,
        progress: null,
        video: null,
      },
    });

    await act(async () => {
      await result.current(input);
      await result.current(input);
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls.map((call) => call[1].body.project.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("does not invoke the Edge boundary when project media upload fails", async () => {
    const uploadError = new Error("upload failed");
    uploadProjectMediaMock.mockRejectedValue(uploadError);
    const { result } = renderCreateBuildingListingHook();

    await expect(act(async () => result.current(makeInput()))).rejects.toThrow(uploadError);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("removes earlier project-media uploads when a later upload fails", async () => {
    uploadProjectMediaMock
      .mockResolvedValueOnce("https://cdn.test/project-media/render.jpg")
      .mockRejectedValueOnce(new Error("second upload failed"));
    const { result } = renderCreateBuildingListingHook();

    await expect(act(async () => result.current(makeInput({
      projectMedia: {
        ...makeInput().projectMedia,
        floor_plan: new File(["floor"], "floor.jpg", { type: "image/jpeg" }),
      },
    })))).rejects.toThrow("second upload failed");

    expect(deleteProjectMediaUrlsMock).toHaveBeenCalledWith([
      "https://cdn.test/project-media/render.jpg",
    ]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("surfaces Edge function envelope errors", async () => {
    invokeMock.mockResolvedValue({
      data: { data: null, error: { message: "developer_role_required" } },
      error: null,
    });
    const { result } = renderCreateBuildingListingHook();

    await expect(act(async () => result.current(makeInput()))).rejects.toThrow("developer_role_required");
  });
});
