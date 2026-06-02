import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListingDraft } from "@/hooks/useListingDraft";
import type { ListingFormData } from "@/hooks/listingForm.types";

const { toastMock, loggerWarnMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
  loggerWarnMock: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/logger", () => ({ logger: { warn: loggerWarnMock } }));

const makeForm = (overrides: Partial<ListingFormData> = {}) => ({
  title: "",
  city: "",
  price: "",
  ...overrides,
}) as ListingFormData;

describe("useListingDraft coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("skips blank autosave, detects existing drafts, and discards them", () => {
    const setForm = vi.fn();
    const { result } = renderHook(() => useListingDraft(makeForm(), setForm));

    act(() => vi.advanceTimersByTime(2500));
    expect(localStorage.getItem("listing_draft")).toBeNull();

    localStorage.setItem("listing_draft", JSON.stringify({ title: "Saved" }));
    act(() => result.current.checkDraft());
    expect(result.current.draftBanner).toBe("visible");

    act(() => result.current.handleDiscardDraft());
    expect(localStorage.getItem("listing_draft")).toBeNull();
    expect(result.current.draftBanner).toBe("dismissed");
  });

  it("autosaves nonblank forms and keeps manually visible banners visible", () => {
    const { result } = renderHook(() => useListingDraft(makeForm({ title: "Athens flat" }), vi.fn()));

    act(() => vi.advanceTimersByTime(2000));
    expect(JSON.parse(localStorage.getItem("listing_draft") ?? "{}")).toMatchObject({ title: "Athens flat" });
    expect(result.current.draftBanner).toBe("autosaved");

    act(() => result.current.setDraftBanner("visible"));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.draftBanner).toBe("visible");
  });

  it("logs autosave failures without showing repeated toasts", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    renderHook(() => useListingDraft(makeForm({ city: "Athens" }), vi.fn()));
    act(() => vi.advanceTimersByTime(2000));

    expect(loggerWarnMock).toHaveBeenCalledWith("Listing autosave failed:", "quota");
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("saves drafts manually and reports manual save failures", () => {
    const { result } = renderHook(() => useListingDraft(makeForm({ price: "120000" }), vi.fn()));

    act(() => result.current.handleSaveDraft());
    expect(toastMock.success).toHaveBeenCalledWith("Draft saved");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw "private-mode";
    });

    act(() => result.current.handleSaveDraft());
    expect(loggerWarnMock).toHaveBeenCalledWith("Listing draft save failed:", "private-mode");
    expect(toastMock.error).toHaveBeenCalledWith("Could not save draft");
  });

  it("restores valid drafts, handles invalid drafts, and ignores storage read/remove failures", () => {
    const setForm = vi.fn();
    localStorage.setItem("listing_draft", JSON.stringify({ title: "Restored", city: "Piraeus" }));
    const { result } = renderHook(() => useListingDraft(makeForm({ title: "Current" }), setForm));

    act(() => result.current.handleRestoreDraft());
    const updater = setForm.mock.calls[0][0] as (form: ListingFormData) => ListingFormData;
    expect(updater(makeForm({ title: "Current" }))).toMatchObject({ title: "Restored", city: "Piraeus" });
    expect(toastMock.success).toHaveBeenCalledWith("Draft restored");
    expect(result.current.draftBanner).toBe("dismissed");

    localStorage.setItem("listing_draft", "{bad json");
    act(() => result.current.handleRestoreDraft());
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Listing draft restore failed:",
      expect.stringMatching(/JSON|Expected/i),
    );
    expect(toastMock.error).toHaveBeenCalledWith("Could not restore draft");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    act(() => result.current.checkDraft());

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    act(() => result.current.handleDiscardDraft());
    expect(result.current.draftBanner).toBe("dismissed");
  });
});
