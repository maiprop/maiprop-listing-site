import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CreateBuildingListingInput,
  useCreateBuildingListing,
} from "@/hooks/useCreateBuildingListing";

const {
  fromMock,
  addMediaMock,
  uploadProjectMediaMock,
  chains,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  addMediaMock: vi.fn(),
  uploadProjectMediaMock: vi.fn(),
  chains: {
    projectInsert: vi.fn(),
    projectDelete: vi.fn(),
    projectDeleteEq: vi.fn(),
    unitInsert: vi.fn(),
    unitUpdate: vi.fn(),
    unitUpdateEq: vi.fn(),
    listingInsert: vi.fn(),
    imageInsert: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/hooks/useProjectMedia", () => ({
  useAddProjectMedia: () => ({ mutateAsync: addMediaMock }),
}));

vi.mock("@/lib/buildingListingUploads", () => ({
  uploadProjectMedia: (...args: unknown[]) => uploadProjectMediaMock(...args),
}));

const makeInput = (overrides: Partial<CreateBuildingListingInput> = {}): CreateBuildingListingInput => ({
  userId: "user-1",
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

const selectSingle = (value: unknown) => ({
  select: vi.fn(() => ({
    single: vi.fn().mockResolvedValue(value),
  })),
});

function installSupabaseChains({
  projectResult = { data: { id: "project-1" }, error: null },
  unitResult = { data: { id: "unit-1" }, error: null },
  listingResult = { data: { id: "listing-1" }, error: null },
  imageResult = { error: null },
} = {}) {
  const projectDeleteChain = {
    eq: chains.projectDeleteEq.mockReturnThis(),
  };

  fromMock.mockImplementation((table: string) => {
    if (table === "projects") {
      return {
        insert: chains.projectInsert.mockReturnValue(selectSingle(projectResult)),
        delete: chains.projectDelete.mockReturnValue(projectDeleteChain),
      };
    }
    if (table === "project_units") {
      const unitUpdateChain = {
        eq: chains.unitUpdateEq.mockReturnThis(),
      };
      return {
        insert: chains.unitInsert.mockReturnValue(selectSingle(unitResult)),
        update: chains.unitUpdate.mockReturnValue(unitUpdateChain),
      };
    }
    if (table === "listings") {
      return {
        insert: chains.listingInsert.mockReturnValue(selectSingle(listingResult)),
      };
    }
    if (table === "listing_images") {
      return {
        insert: chains.imageInsert.mockResolvedValue(imageResult),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("useCreateBuildingListing coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addMediaMock.mockResolvedValue({});
    uploadProjectMediaMock.mockResolvedValue("https://cdn.test/project-media/render.jpg");
    installSupabaseChains();
  });

  it("creates project, unit, project media, listing, and secondary images", async () => {
    const { result } = renderHook(() => useCreateBuildingListing());

    await expect(act(async () => result.current(makeInput()))).resolves.toEqual({ listingId: "listing-1" });

    expect(chains.projectInsert).toHaveBeenCalledWith(expect.objectContaining({
      name: "Marina Heights",
      building_permit_number: "123/2026",
      developer_company: undefined,
      architect_group: "Studio A",
      city: "Athens",
      latitude: 37.98,
      longitude: undefined,
      owner_id: "user-1",
    }));
    expect(chains.unitInsert).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "project-1",
      internal_sqm: 100,
      price: 250000,
      price_per_sqm: 2500,
      floor: undefined,
      bedrooms: 2,
      bathrooms: 1,
      city_view: true,
    }));
    expect(uploadProjectMediaMock).toHaveBeenCalledWith(
      expect.any(File),
      "user-1",
      "project-1",
      "rendering",
    );
    expect(addMediaMock).toHaveBeenCalledWith({
      project_id: "project-1",
      url: "https://cdn.test/project-media/render.jpg",
      media_type: "rendering",
    });
    expect(chains.listingInsert).toHaveBeenCalledWith(expect.objectContaining({
      title: "Marina Heights A1",
      description: undefined,
      project_id: "project-1",
      price: 250000,
      sqm: 100,
      latitude: 37.98,
      longitude: undefined,
      cover_image_url: "https://cdn.test/cover.jpg",
      price_per_sqm: 2500,
      status: "active",
      listing_type: "new_build",
      is_pre_sale: false,
    }));
    expect(chains.unitUpdate).toHaveBeenCalledWith({ listing_id: "listing-1" });
    expect(chains.unitUpdateEq).toHaveBeenCalledWith("id", "unit-1");
    expect(chains.unitUpdateEq).toHaveBeenCalledWith("project_id", "project-1");
    expect(chains.imageInsert).toHaveBeenCalledWith([
      { listing_id: "listing-1", url: "https://cdn.test/2.jpg", sort_order: 1 },
      { listing_id: "listing-1", url: "https://cdn.test/3.jpg", sort_order: 2 },
    ]);
    expect(chains.projectDelete).not.toHaveBeenCalled();
  });

  it("skips optional media and image inserts when no optional assets are present", async () => {
    const { result } = renderHook(() => useCreateBuildingListing());

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
        unit: { ...makeInput().unit, internal_sqm: "0", price: "1000" },
      }));
    });

    expect(uploadProjectMediaMock).not.toHaveBeenCalled();
    expect(addMediaMock).not.toHaveBeenCalled();
    expect(chains.imageInsert).not.toHaveBeenCalled();
    expect(chains.unitInsert).toHaveBeenCalledWith(expect.objectContaining({
      internal_sqm: 0,
      price_per_sqm: undefined,
    }));
  });

  it("throws project insert failures without rollback because no project exists yet", async () => {
    const projectError = new Error("project insert failed");
    installSupabaseChains({ projectResult: { data: null, error: projectError } });
    const { result } = renderHook(() => useCreateBuildingListing());

    await expect(act(async () => result.current(makeInput()))).rejects.toThrow(projectError);
    expect(chains.projectDelete).not.toHaveBeenCalled();
  });

  it("rolls back the owned project when a later write fails", async () => {
    const listingError = new Error("listing insert failed");
    installSupabaseChains({ listingResult: { data: null, error: listingError } });
    const { result } = renderHook(() => useCreateBuildingListing());

    await expect(act(async () => result.current(makeInput()))).rejects.toThrow(listingError);

    expect(chains.projectDelete).toHaveBeenCalled();
    expect(chains.projectDeleteEq).toHaveBeenNthCalledWith(1, "id", "project-1");
    expect(chains.projectDeleteEq).toHaveBeenNthCalledWith(2, "owner_id", "user-1");
  });
});
