/**
 * Tests for useListingForm — the heavy-lifting state hook behind
 * CreateListing.tsx. Covers initialisation, set/toggle/touch with inline
 * validation, validateStep for each WizardStep, image upload pipeline
 * (success + size-rejected + error branches), reorder/remove, draft helpers
 * proxied through useListingDraft, and the residential / land / commercial
 * submission branches of handleSubmit (happy path + missing-field guards).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { fromMock, storageMock, useAuthMock, navigateMock, toastMock, useDraftMock, useAIMock, geocodeAddressTextMock, createListingMock, updateListingMock } =
  vi.hoisted(() => ({
    fromMock: vi.fn(),
    storageMock: { upload: vi.fn(), getPublicUrl: vi.fn() },
    useAuthMock: vi.fn(),
    navigateMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn() },
    useDraftMock: vi.fn(),
    useAIMock: vi.fn(),
    geocodeAddressTextMock: vi.fn(),
    createListingMock: vi.fn(),
    updateListingMock: vi.fn(),
  }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
    storage: {
      from: () => ({
        upload: storageMock.upload,
        getPublicUrl: storageMock.getPublicUrl,
      }),
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useListingDraft", () => ({ useListingDraft: () => useDraftMock() }));
vi.mock("@/hooks/useListingAI", () => ({ useListingAI: () => useAIMock() }));
vi.mock("@/hooks/listingManagementBoundary", () => ({
  createListingForUser: (...args: unknown[]) => createListingMock(...args),
  updateListingForUser: (...args: unknown[]) => updateListingMock(...args),
}));
vi.mock("@/lib/location/geocodeAddress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/location/geocodeAddress")>("@/lib/location/geocodeAddress");
  return {
    ...actual,
    geocodeAddressText: (...args: unknown[]) => geocodeAddressTextMock(...args),
  };
});
vi.mock("@/lib/compressImage", () => ({
  compressListingImage: vi.fn(async (f: File) =>
    new File([f], f.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }),
  ),
}));

import { useListingForm } from "@/hooks/useListingForm";

const wrap = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

beforeEach(() => {
  fromMock.mockReset();
  storageMock.upload.mockReset();
  storageMock.getPublicUrl.mockReset();
  storageMock.upload.mockResolvedValue({ error: null });
  storageMock.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn/img.webp" } });
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  navigateMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  useDraftMock.mockReset();
  useDraftMock.mockReturnValue({
    draftBanner: false,
    setDraftBanner: vi.fn(),
    checkDraft: vi.fn(),
    handleSaveDraft: vi.fn(),
    handleRestoreDraft: vi.fn(),
    handleDiscardDraft: vi.fn(),
  });
  useAIMock.mockReset();
  useAIMock.mockReturnValue({
    aiDescLoading: false,
    aiPriceLoading: false,
    aiPriceSuggestion: null,
    handleAiDescription: vi.fn(),
    handleAiPrice: vi.fn(),
  });
  geocodeAddressTextMock.mockReset();
  geocodeAddressTextMock.mockResolvedValue(null);
  createListingMock.mockReset();
  createListingMock.mockImplementation(async (payload: Record<string, unknown>) => {
    const table = fromMock("listings");
    const result = await table.insert(payload).select().single();
    if (result.error) throw result.error;
    return result.data;
  });
  updateListingMock.mockReset();
  updateListingMock.mockImplementation(async (id: string, updates: Record<string, unknown>) => {
    const table = fromMock("listings");
    const result = await table.update(updates).eq("id", id).eq("owner_id", "u-1").select().single();
    if (result.error) throw result.error;
    return result.data;
  });
  // crypto.randomUUID is supported in jsdom but stub for determinism.
  let counter = 0;
  vi.stubGlobal("crypto", {
    ...globalThis.crypto,
    randomUUID: () => `uuid-${++counter}`,
  });
  // URL.createObjectURL is unimplemented in jsdom.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
});

describe("useListingForm — initialisation + simple setters", () => {
  it("starts with the canonical initial form", () => {
    const { result } = renderHook(() => useListingForm({ allowPreSale: true }), { wrapper: wrap });
    expect(result.current.form.listing_type).toBe("sale");
    expect(result.current.form.property_type).toBe("apartment");
    expect(result.current.form.title).toBe("");
    expect(result.current.images).toEqual([]);
    expect(result.current.coverImageId).toBeNull();
  });

  it("set() updates the requested field", () => {
    const { result } = renderHook(() => useListingForm({ allowPreSale: true }), { wrapper: wrap });
    act(() => result.current.set("title", "Athens 3-bed"));
    expect(result.current.form.title).toBe("Athens 3-bed");
  });

  it("toggle() flips a boolean field", () => {
    const { result } = renderHook(() => useListingForm({ allowPreSale: true }), { wrapper: wrap });
    act(() => result.current.toggle("has_parking"));
    expect(result.current.form.has_parking).toBe(true);
    act(() => result.current.toggle("has_parking"));
    expect(result.current.form.has_parking).toBe(false);
  });

  it("touch() marks the field as touched (idempotent)", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    act(() => result.current.touch("title"));
    act(() => result.current.touch("title"));
    // Internal state — no public assertion, but `set` after touch
    // should now apply inline validation and surface an error.
    act(() => result.current.set("title", "  "));
    expect(result.current.errors.title).toBe("Title is required");
  });

  it("clears the inline error when an untouched field is set", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    // Pre-populate an error to test the clear path
    act(() => result.current.setErrors({ title: "previous" }));
    expect(result.current.errors.title).toBe("previous");
    act(() => result.current.set("title", "ok"));
    // Untouched field — error from prior validation is cleared.
    expect(result.current.errors.title).toBeUndefined();
  });

  it("inline-validates touched 'sqm', 'city', 'price' fields", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    ["sqm", "city", "price"].forEach((field) => {
      act(() => result.current.touch(field));
      act(() => result.current.set(field, ""));
    });
    expect(result.current.errors.sqm).toMatch(/required/i);
    expect(result.current.errors.city).toMatch(/required/i);
    expect(result.current.errors.price).toMatch(/required/i);
  });

  it("refuses to toggle unknown or non-boolean fields", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    const originalTitle = result.current.form.title;
    const originalKeys = Object.keys(result.current.form);

    act(() => {
      result.current.toggle("title");
      result.current.toggle("attacker_controlled_key");
    });

    expect(result.current.form.title).toBe(originalTitle);
    expect(Object.keys(result.current.form)).toEqual(originalKeys);
    expect("attacker_controlled_key" in result.current.form).toBe(false);
  });

  it("hydrates rental open-house edits, optional fields, booleans, and a deduplicated sorted gallery", () => {
    const initialListing = {
      id: "L-open-house",
      owner_id: "u-1",
      title: null,
      description: null,
      city: "Athens",
      address: null,
      region: null,
      postal_code: null,
      latitude: 37.98,
      longitude: 23.72,
      price: 1500,
      sqm: 100,
      listing_type: "open_house",
      open_house_transaction_type: "rent",
      open_house_date: "2027-03-04T18:45:00+00:00",
      property_type: "office",
      priority_placement: null,
      cover_image_url: "https://cdn.test/cover.jpg",
      listing_images: [
        { url: "", sort_order: 1 },
        { url: "https://cdn.test/second.jpg", sort_order: 2 },
        { url: "https://cdn.test/first.jpg", sort_order: 1 },
        { url: "https://cdn.test/cover.jpg", sort_order: 0 },
      ],
      tags: ["manual-tag"],
      has_elevator: 1,
      has_pool: 0,
      profiles: null,
      ownerIsPro: false,
      ownerParticipantType: "developer",
    } as never;

    const { result } = renderHook(() => useListingForm({
      mode: "edit",
      listingId: "L-open-house",
      initialListing,
    }), { wrapper: wrap });

    expect(result.current.form).toEqual(expect.objectContaining({
      listing_type: "open_house",
      open_house_transaction_type: "rent",
      open_house_date: "2027-03-04T18:45",
      title: "",
      latitude: "37.98",
      longitude: "23.72",
      priority_placement: 0,
      is_exclusive: false,
      has_elevator: true,
      has_pool: false,
    }));
    expect(result.current.images.map((image) => image.url)).toEqual([
      "https://cdn.test/cover.jpg",
      "https://cdn.test/first.jpg",
      "https://cdn.test/second.jpg",
    ]);
    expect(result.current.coverImageId).toBe("existing-cover");
  });
});

describe("useListingForm — validateStep", () => {
  it("flags missing title + sqm on the 'details' step", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    const errs = result.current.validateStep("details");
    expect(errs.title).toBeTruthy();
    expect(errs.sqm).toBeTruthy();
  });

  it("flags missing city on the 'location' step", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    expect(result.current.validateStep("location").city).toBeTruthy();
  });

  it("flags missing price on the 'pricing' step", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    expect(result.current.validateStep("pricing").price).toMatch(/Asking price/);
  });

  it("uses 'Monthly rent' wording for rentals on the 'pricing' step", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    act(() => result.current.set("listing_type", "rent"));
    expect(result.current.validateStep("pricing").price).toMatch(/Monthly rent/);
  });

  it("flags missing auction_starting_bid for an auction listing", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    act(() => {
      result.current.set("listing_type", "auction");
      result.current.set("price", "100");
    });
    expect(result.current.validateStep("pricing").auction_starting_bid).toBeTruthy();
  });

  it("flags missing open_house_date for an open_house listing", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    act(() => {
      result.current.set("listing_type", "open_house");
      result.current.set("price", "100");
    });
    expect(result.current.validateStep("pricing").open_house_date).toBeTruthy();
  });

  it("returns no errors when no validation rules apply to the step", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    expect(result.current.validateStep("type")).toEqual({});
    expect(result.current.validateStep("features")).toEqual({});
    expect(result.current.validateStep("photos")).toEqual({});
  });
});

describe("useListingForm — image pipeline", () => {
  function makeFile(name: string, sizeBytes: number) {
    const f = new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
    return f;
  }

  it("does nothing when files=null", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    await act(async () => {
      await result.current.handleFilesSelected(null);
    });
    expect(result.current.images).toEqual([]);
  });

  it("rejects files larger than the listing-images 5MB bucket limit and toasts a single error", async () => {
    const big = makeFile("huge.jpg", 5 * 1024 * 1024 + 1);
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    await act(async () => {
      await result.current.handleFilesSelected({ 0: big, length: 1, item: () => big } as unknown as FileList);
    });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/5 MB limit/));
    expect(result.current.images).toEqual([]);
  });

  it("uploads valid files and sets the cover to the first one", async () => {
    const f = makeFile("a.jpg", 100_000);
    const list = { 0: f, length: 1, item: (_: number) => f } as unknown as FileList;
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    await act(async () => {
      await result.current.handleFilesSelected(list);
    });
    expect(result.current.images.length).toBe(1);
    expect(result.current.images[0].uploading).toBe(false);
    expect(result.current.coverImageId).toBe(result.current.images[0].id);
    expect(storageMock.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^u-1\/.+\.webp$/),
      expect.any(File),
      expect.objectContaining({ upsert: false, contentType: "image/webp" }),
    );
  });

  it("flags the placeholder with an error when storage upload throws", async () => {
    storageMock.upload.mockResolvedValue({ error: new Error("storage 500") });
    const f = makeFile("a.jpg", 100_000);
    const list = { 0: f, length: 1, item: (_: number) => f } as unknown as FileList;
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    await act(async () => {
      await result.current.handleFilesSelected(list);
    });
    expect(result.current.images[0].error).toMatch(/storage 500/);
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Failed to upload/));
  });

  it("sets the cover to the first successful upload when an earlier upload fails", async () => {
    storageMock.upload
      .mockResolvedValueOnce({ error: new Error("storage 500") })
      .mockResolvedValueOnce({ error: null });
    const failed = makeFile("failed.jpg", 100_000);
    const successful = makeFile("successful.jpg", 100_000);
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });

    await act(async () => {
      await result.current.handleFilesSelected({
        0: failed,
        1: successful,
        length: 2,
        item: () => null,
      } as unknown as FileList);
    });

    expect(result.current.images[0].error).toMatch(/storage 500/);
    expect(result.current.coverImageId).toBe(result.current.images[1].id);
  });

  it("handleDrop forwards files to the upload pipeline", async () => {
    const f = makeFile("a.jpg", 100_000);
    const dt = { files: { 0: f, length: 1, item: () => f } as unknown as FileList } as DataTransfer;
    const evt = { preventDefault: vi.fn(), dataTransfer: dt } as unknown as React.DragEvent;
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    await act(async () => {
      result.current.handleDrop(evt);
      // wait a tick for async upload
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  it("handleReorder swaps two images", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    // Inject 3 images directly via images-state-setter is not exposed,
    // but we can drive the upload pipeline twice with fakes.
    const f1 = makeFile("a.jpg", 1000);
    const f2 = makeFile("b.jpg", 1000);
    await act(async () => {
      await result.current.handleFilesSelected({ 0: f1, 1: f2, length: 2, item: () => null } as unknown as FileList);
    });
    const before = result.current.images.map((i) => i.id);
    act(() => result.current.handleReorder(0, 1));
    const after = result.current.images.map((i) => i.id);
    expect(after).toEqual([before[1], before[0]]);
  });

  it("handleRemove drops an image and clears the cover if needed", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    const f = makeFile("a.jpg", 1000);
    await act(async () => {
      await result.current.handleFilesSelected({ 0: f, length: 1, item: () => f } as unknown as FileList);
    });
    const id = result.current.images[0].id;
    expect(result.current.coverImageId).toBe(id);
    act(() => result.current.handleRemove(id));
    expect(result.current.images).toEqual([]);
    expect(result.current.coverImageId).toBeNull();
  });
});

describe("useListingForm — handleSubmit", () => {
  function setBaseForm(result: ReturnType<typeof renderHook<ReturnType<typeof useListingForm>, void>>["result"]) {
    act(() => {
      result.current.set("title", "Athens 3-bed");
      result.current.set("city", "Athens");
      result.current.set("price", "300000");
      result.current.set("sqm", "95");
    });
  }

  it("blocks submission when required fields are empty", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/required fields/));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("blocks submission when price/area are zero or negative", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => result.current.set("price", "0"));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/greater than zero/));
  });

  it("blocks submission when restored price or area state is not numeric", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => result.current.set("sqm", "not-a-number"));

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/greater than zero/));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("blocks submission when listing_type=open_house and date is missing", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => result.current.set("listing_type", "open_house"));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Open house date/));
  });

  it("blocks submission when required fields are filled but the user is signed out", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/signed in/i));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("posts a residential listing and navigates to /property/:id", async () => {
    fromMock.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "L-1" }, error: null }),
        }),
      }),
    });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/published/));
    expect(navigateMock).toHaveBeenCalledWith("/property/L-1");
  });

  it("passes organization ownership to the secure create boundary", async () => {
    createListingMock.mockResolvedValueOnce({ id: "L-org" });
    const { result } = renderHook(
      () => useListingForm({ organizationId: "org-1" }),
      { wrapper: wrap },
    );
    setBaseForm(result);

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(createListingMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Athens 3-bed" }),
      "org-1",
    );
  });

  it("posts selected address coordinates with the listing", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "L-coordinates" }, error: null }),
      }),
    });
    fromMock.mockReturnValueOnce({ insert: insertMock });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => {
      result.current.set("address", "14 Voukourestiou");
      result.current.set("latitude", "37.9779");
      result.current.set("longitude", "23.7354");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      address: "14 Voukourestiou",
      latitude: 37.9779,
      longitude: 23.7354,
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.not.objectContaining({
      is_featured: expect.anything(),
      priority_placement: expect.anything(),
    }));
  });

  it("geocodes a manually typed address before inserting when coordinates are missing", async () => {
    geocodeAddressTextMock.mockResolvedValue({ latitude: "38.0202", longitude: "23.7126" });
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "L-geocoded" }, error: null }),
      }),
    });
    fromMock.mockReturnValueOnce({ insert: insertMock });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => {
      result.current.set("address", "Υμηττού 6");
      result.current.set("city", "Άγιοι Ανάργυροι Αττικής");
      result.current.set("region", "Αττική");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(geocodeAddressTextMock).toHaveBeenCalledWith({
      address: "Υμηττού 6",
      city: "Άγιοι Ανάργυροι Αττικής",
      region: "Αττική",
      postalCode: "",
    });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      address: "Υμηττού 6",
      city: "Άγιοι Ανάργυροι Αττικής",
      latitude: 38.0202,
      longitude: 23.7126,
    }));
  });

  it("persists uploaded non-cover images after the listing insert succeeds", async () => {
    const listingInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "L-images" }, error: null }),
      }),
    });
    const imageInsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "listings") return { insert: listingInsert };
      if (table === "listing_images") return { insert: imageInsert };
      throw new Error(`unexpected table ${table}`);
    });
    storageMock.getPublicUrl
      .mockReturnValueOnce({ data: { publicUrl: "https://cdn/cover.webp" } })
      .mockReturnValueOnce({ data: { publicUrl: "https://cdn/extra.webp" } });
    const cover = new File([new Uint8Array(1000)], "cover.jpg", { type: "image/jpeg" });
    const extra = new File([new Uint8Array(1000)], "extra.jpg", { type: "image/jpeg" });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    await act(async () => {
      await result.current.handleFilesSelected({ 0: cover, 1: extra, length: 2, item: () => null } as unknown as FileList);
    });
    setBaseForm(result);

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(imageInsert).toHaveBeenCalledWith([
      { listing_id: "L-images", url: "https://cdn/extra.webp", sort_order: 1 },
    ]);
  });

  it("blocks draft and publish while any image upload is still pending", async () => {
    let resolveUpload: (value: { error: null }) => void = () => undefined;
    storageMock.upload.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const insertMock = vi.fn();
    fromMock.mockReturnValue({ insert: insertMock });
    const file = new File([new Uint8Array(1000)], "slow.jpg", { type: "image/jpeg" });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });

    await act(async () => {
      void result.current.handleFilesSelected({ 0: file, length: 1, item: () => file } as unknown as FileList);
      await Promise.resolve();
    });
    expect(result.current.images[0]?.uploading).toBe(true);
    setBaseForm(result);

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/finish uploading/i));
    expect(insertMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpload({ error: null });
      await Promise.resolve();
    });
  });

  it("blocks submission when uploaded images remain but no cover is selected", async () => {
    const insertMock = vi.fn();
    fromMock.mockReturnValue({ insert: insertMock });
    storageMock.getPublicUrl
      .mockReturnValueOnce({ data: { publicUrl: "https://cdn/cover.webp" } })
      .mockReturnValueOnce({ data: { publicUrl: "https://cdn/extra.webp" } });
    const cover = new File([new Uint8Array(1000)], "cover.jpg", { type: "image/jpeg" });
    const extra = new File([new Uint8Array(1000)], "extra.jpg", { type: "image/jpeg" });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });

    await act(async () => {
      await result.current.handleFilesSelected({ 0: cover, 1: extra, length: 2, item: () => null } as unknown as FileList);
    });
    act(() => result.current.handleRemove(result.current.coverImageId as string));
    setBaseForm(result);

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/cover photo/i));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("posts a draft when asDraft=true (status=draft)", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "L-2" }, error: null }),
      }),
    });
    fromMock.mockReturnValueOnce({ insert: insertMock });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    await act(async () => {
      await result.current.handleSubmit(true);
    });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }));
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/draft/));
  });

  it("routes a stale pre-sale sale listing to /property/:id", async () => {
    fromMock.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "L-3" }, error: null }),
        }),
      }),
    });
    const { result } = renderHook(() => useListingForm({ allowPreSale: true }), { wrapper: wrap });
    setBaseForm(result);
    act(() => result.current.toggle("is_pre_sale"));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(navigateMock).toHaveBeenCalledWith("/property/L-3");
  });

  it("forces stale pre-sale form state off when allowPreSale is false", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "L-regular" }, error: null }),
      }),
    });
    fromMock.mockReturnValueOnce({ insert: insertMock });
    const { result } = renderHook(() => useListingForm({ allowPreSale: false }), { wrapper: wrap });
    setBaseForm(result);
    act(() => result.current.toggle("is_pre_sale"));

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ is_pre_sale: false }));
    expect(navigateMock).toHaveBeenCalledWith("/property/L-regular");
  });

  it("blocks stale project/new-build listing type state in the ordinary listing flow", async () => {
    const { result } = renderHook(() => useListingForm({ allowPreSale: false }), { wrapper: wrap });
    setBaseForm(result);
    act(() => result.current.set("listing_type", "new_build" as never));

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Create New Building/i));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("routes an open_house listing to /open-house/:id", async () => {
    fromMock.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "L-4" }, error: null }),
        }),
      }),
    });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => {
      result.current.set("listing_type", "open_house");
      result.current.set("open_house_date", "2027-01-01T18:00");
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(navigateMock).toHaveBeenCalledWith("/open-house/L-4");
  });

  it("submits rental open houses with rental terms while keeping listing_type=open_house", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "L-oh-rent" }, error: null }),
      }),
    });
    fromMock.mockReturnValueOnce({ insert: insertMock });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => {
      result.current.set("listing_type", "open_house");
      result.current.set("open_house_transaction_type", "rent");
      result.current.set("open_house_date", "2027-01-01T18:00");
      result.current.set("deposit_months", "2");
      result.current.set("monthly_expenses", "75");
      result.current.set("available_from", "2027-02-01");
      result.current.set("min_rental_months", "12");
      result.current.toggle("pets_allowed");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      listing_type: "open_house",
      open_house_transaction_type: "rent",
      deposit_months: 2,
      monthly_expenses: 75,
      available_from: "2027-02-01",
      min_rental_months: 12,
      pets_allowed: true,
    }));
    expect(navigateMock).toHaveBeenCalledWith("/open-house/L-oh-rent");
  });

  it.each([
    {
      name: "commercial",
      configure: (result: ReturnType<typeof renderHook<ReturnType<typeof useListingForm>, void>>["result"]) => {
        result.current.set("property_type", "commercial");
        result.current.set("commercial_subtype", "warehouse");
        result.current.set("plot_surface", "700");
        result.current.set("floor_height", "5.5");
        result.current.set("floor", "1");
        result.current.set("total_floors", "2");
        result.current.set("wc_count", "3");
      },
      expected: {
        property_type: "commercial",
        commercial_subtype: "warehouse",
        plot_surface: 700,
        floor_height: 5.5,
        floor: 1,
        total_floors: 2,
        wc_count: 3,
      },
    },
    {
      name: "land",
      configure: (result: ReturnType<typeof renderHook<ReturnType<typeof useListingForm>, void>>["result"]) => {
        result.current.set("property_type", "land");
        result.current.set("coverage_ratio", "0.4");
        result.current.set("building_allowance", "0.8");
        result.current.set("facade_length", "20");
        result.current.set("plot_depth", "40");
        result.current.set("slope", "flat");
        result.current.set("zone_type", "residential");
        result.current.set("road_type", "asphalt");
        result.current.set("land_use", "housing");
        result.current.set("distance_from_sea", "350");
        result.current.set("distance_from_city", "5");
      },
      expected: {
        property_type: "land",
        coverage_ratio: 0.4,
        building_allowance: 0.8,
        facade_length: 20,
        plot_depth: 40,
        slope: "flat",
        zone_type: "residential",
        road_type: "asphalt",
        land_use: "housing",
        distance_from_sea: 350,
        distance_from_city: 5,
      },
    },
  ])("constructs the $name-specific database payload without leaking unrelated fields", async ({ configure, expected }) => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: `L-${expected.property_type}` }, error: null }),
      }),
    });
    fromMock.mockReturnValueOnce({ insert: insertMock });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => configure(result));

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining(expected));
    if (expected.property_type === "land") {
      expect(insertMock).toHaveBeenCalledWith(expect.not.objectContaining({ bedrooms: expect.anything() }));
    } else {
      expect(insertMock).toHaveBeenCalledWith(expect.not.objectContaining({ coverage_ratio: expect.anything() }));
    }
  });

  it("constructs auction pricing and schedule fields and routes to the auction detail", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "L-auction" }, error: null }),
      }),
    });
    fromMock.mockReturnValueOnce({ insert: insertMock });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    act(() => {
      result.current.set("listing_type", "auction");
      result.current.set("auction_starting_bid", "210000");
      result.current.set("auction_date", "2027-06-01T10:30");
      result.current.set("auction_court", "Athens Court");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      auction_starting_bid: 210000,
      auction_date: "2027-06-01T10:30",
      auction_court: "Athens Court",
    }));
    expect(navigateMock).toHaveBeenCalledWith("/auction/L-auction");
  });

  it("toasts the error message when supabase insert throws", async () => {
    fromMock.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error("rls") }),
        }),
      }),
    });
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    setBaseForm(result);
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(toastMock.error).toHaveBeenCalledWith("rls");
  });

  it("updates an existing listing and preserves unchanged non-cover image rows in edit mode", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "L-edit" }, error: null }),
          }),
        }),
      }),
    });
    const imageDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const imageInsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "listings") return { update: updateMock };
      if (table === "listing_images") {
        return {
          delete: vi.fn().mockReturnValue({ eq: imageDeleteEq }),
          insert: imageInsert,
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const initialListing = {
      id: "L-edit",
      owner_id: "u-1",
      title: "Old title",
      city: "Athens",
      price: 100000,
      sqm: 80,
      status: "paused",
      listing_type: "sale",
      property_type: "apartment",
      cover_image_url: "https://cdn.test/cover.jpg",
      listing_images: [{ url: "https://cdn.test/extra.jpg", sort_order: 1 }],
      tags: ["exclusive", "manual-tag"],
      profiles: null,
      ownerIsPro: false,
      ownerParticipantType: "seller",
    } as never;

    const { result } = renderHook(() => useListingForm({
      mode: "edit",
      listingId: "L-edit",
      initialListing,
    }), { wrapper: wrap });

    expect(result.current.form.title).toBe("Old title");
    expect(result.current.form.is_exclusive).toBe(true);
    act(() => {
      result.current.set("is_exclusive", false);
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Old title",
      status: "paused",
      cover_image_url: "https://cdn.test/cover.jpg",
      tags: ["manual-tag"],
    }));
    expect(imageDeleteEq).not.toHaveBeenCalled();
    expect(imageInsert).not.toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith("Listing updated successfully!");
    expect(navigateMock).toHaveBeenCalledWith("/property/L-edit");
  });

  it("does not delete existing edit-mode gallery rows when inserting replacement images fails", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "L-edit" }, error: null }),
          }),
        }),
      }),
    });
    const imageInsert = vi.fn().mockRejectedValue(new Error("image insert failed"));
    const imageDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "listings") return { update: updateMock };
      if (table === "listing_images") {
        return {
          insert: imageInsert,
          delete: imageDelete,
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    storageMock.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn.test/new-extra.jpg" } });
    const initialListing = {
      id: "L-edit",
      owner_id: "u-1",
      title: "Old title",
      city: "Athens",
      price: 100000,
      sqm: 80,
      status: "active",
      listing_type: "sale",
      property_type: "apartment",
      cover_image_url: "https://cdn.test/cover.jpg",
      listing_images: [{ url: "https://cdn.test/old-extra.jpg", sort_order: 1 }],
      tags: [],
      profiles: null,
      ownerIsPro: false,
      ownerParticipantType: "seller",
    } as never;
    const newExtra = new File([new Uint8Array(1000)], "new-extra.jpg", { type: "image/jpeg" });

    const { result } = renderHook(() => useListingForm({
      mode: "edit",
      listingId: "L-edit",
      initialListing,
    }), { wrapper: wrap });
    await act(async () => {
      await result.current.handleFilesSelected({ 0: newExtra, length: 1, item: () => newExtra } as unknown as FileList);
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(imageInsert).toHaveBeenCalledWith([
      { listing_id: "L-edit", url: "https://cdn.test/new-extra.jpg", sort_order: 2 },
    ]);
    expect(imageDelete).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("image insert failed");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("sends null for cover_image_url when an existing cover is removed in edit mode", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "L-edit" }, error: null }),
          }),
        }),
      }),
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "listings") return { update: updateMock };
      if (table === "listing_images") return {};
      throw new Error(`unexpected table ${table}`);
    });
    const initialListing = {
      id: "L-edit",
      owner_id: "u-1",
      title: "Old title",
      city: "Athens",
      price: 100000,
      sqm: 80,
      status: "active",
      listing_type: "sale",
      property_type: "apartment",
      cover_image_url: "https://cdn.test/cover.jpg",
      listing_images: [],
      tags: [],
      profiles: null,
      ownerIsPro: false,
      ownerParticipantType: "seller",
    } as never;

    const { result } = renderHook(() => useListingForm({
      mode: "edit",
      listingId: "L-edit",
      initialListing,
    }), { wrapper: wrap });
    expect(result.current.images[0]?.id).toBe("existing-cover");
    act(() => {
      result.current.handleRemove("existing-cover");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      cover_image_url: null,
    }));
  });
});

describe("useListingForm — derived completionPct", () => {
  it("returns 33% with only the type/features sentinels filled (the always-true checks)", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    expect(result.current.completionPct).toBe(33);
  });

  it("scales as fields fill in", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper: wrap });
    act(() => {
      result.current.set("title", "x");
      result.current.set("sqm", "1");
      result.current.set("city", "Athens");
      result.current.set("price", "1");
    });
    expect(result.current.completionPct).toBe(83);
  });
});
