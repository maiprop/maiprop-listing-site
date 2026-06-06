import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickSaleFormValues } from "@/components/firesale/quickSaleFormModel";

const { fromMock, insertMock, selectMock, singleMock, deleteMock, firstEqMock, secondEqMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  deleteMock: vi.fn(),
  firstEqMock: vi.fn(),
  secondEqMock: vi.fn(),
  toastMock: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("sonner", () => ({ toast: toastMock }));

import {
  applyRemoteEstimate,
  getSubmitUserId,
  navigateToSellerSetup,
  redirectBlockedSubmitter,
  showAuthPendingToast,
  showValidationErrors,
  submitValidatedQuickSale,
} from "@/components/firesale/quickSaleSubmission";

const validForm = (overrides: Partial<QuickSaleFormValues> = {}): QuickSaleFormValues => ({
  address: "Kolonaki 12, Athens",
  city: "",
  kaek: "050240601001/0/1",
  propertyType: "commercial_shop",
  sqm: "100",
  askingPrice: "350000",
  constructionYear: "2010",
  contactName: "Alice Seller",
  contactEmail: "alice@example.com",
  contactPhone: "",
  notes: "Quick sale needed within 30 days.",
  ...overrides,
});

beforeEach(() => {
  vi.restoreAllMocks();
  fromMock.mockReset();
  insertMock.mockReset();
  selectMock.mockReset();
  singleMock.mockReset();
  deleteMock.mockReset();
  firstEqMock.mockReset();
  secondEqMock.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();

  insertMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ single: singleMock });
  singleMock.mockResolvedValue({ data: { id: "req-1" }, error: null });
  deleteMock.mockReturnValue({ eq: firstEqMock });
  firstEqMock.mockReturnValue({ eq: secondEqMock });
  secondEqMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ insert: insertMock, delete: deleteMock });
});

describe("quick sale submission helpers", () => {
  it("handles validation, auth redirects, blocked submitters, and pending auth feedback", () => {
    const setErrors = vi.fn();
    expect(showValidationErrors({}, setErrors)).toBe(false);
    expect(showValidationErrors({ address: "Address required", kaek: "KAEK required" }, setErrors)).toBe(true);
    expect(setErrors).toHaveBeenLastCalledWith({ address: "Address required", kaek: "KAEK required" });
    expect(toastMock.error).toHaveBeenCalledWith("Address required");

    const navigate = vi.fn();
    navigateToSellerSetup(navigate, false);
    expect(navigate).toHaveBeenCalledWith("/signup?type=seller");
    navigateToSellerSetup(navigate, true);
    expect(navigate).toHaveBeenLastCalledWith("/onboarding");

    expect(getSubmitUserId({ id: "user-1" }, navigate)).toBe("user-1");
    expect(getSubmitUserId(null, navigate)).toBeNull();
    expect(navigate).toHaveBeenLastCalledWith("/login");

    expect(redirectBlockedSubmitter(true, navigate)).toBe(false);
    navigate.mockClear();
    expect(redirectBlockedSubmitter(false, navigate)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(toastMock.info).toHaveBeenCalledWith("Quick Sale submissions are available only to seller profiles.");

    expect(showAuthPendingToast(false)).toBe(false);
    expect(showAuthPendingToast(true)).toBe(true);
    expect(toastMock.info).toHaveBeenCalledWith("Checking your seller profile. Please try again in a moment.");
  });

  it("applies remote estimates and reports AI quota failures without overwriting estimates", () => {
    const setAiEstimate = vi.fn();
    applyRemoteEstimate({ estimated_value: 300_001 }, null, setAiEstimate);
    expect(setAiEstimate).toHaveBeenCalledWith(285001);

    applyRemoteEstimate({ error: "monthly_limit_reached" }, null, setAiEstimate);
    expect(setAiEstimate).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledWith("AI estimate is temporarily unavailable due to usage limits.");

    applyRemoteEstimate(null, new Error("gateway 402 usage limit"), setAiEstimate);
    expect(toastMock.error).toHaveBeenCalledTimes(2);
  });

  it("inserts the normalized firesale request, uploads every photo, and returns the stored request id", async () => {
    const uploadPhotos = vi.fn().mockResolvedValue(["one", "two", "three", "four", "five"]);

    await expect(submitValidatedQuickSale(validForm(), "user-1", 280000, 5, uploadPhotos)).resolves.toEqual({
      estimate: 280000,
      requestId: "req-1",
    });

    expect(fromMock).toHaveBeenCalledWith("firesale_requests");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "Kolonaki 12, Athens",
        city: "Athens",
        property_type: "commercial",
        sqm: 100,
        asking_price: 350000,
        contact_email: "alice@example.com",
        contact_phone: null,
        ai_estimate: 280000,
        user_id: "user-1",
        status: "pending",
      }),
    );
    expect(insertMock.mock.calls[0][0].notes).toContain("KAEK: 050240601001/0/1");
    expect(uploadPhotos).toHaveBeenCalledWith("req-1");
  });

  it("uses the fallback estimate and skips uploading when there are no photos or stored id", async () => {
    singleMock.mockResolvedValueOnce({ data: {}, error: null });
    const uploadPhotos = vi.fn();

    await expect(submitValidatedQuickSale(validForm({ sqm: "80" }), "user-1", null, 0, uploadPhotos)).resolves.toEqual({
      estimate: 139840,
      requestId: null,
    });
    expect(uploadPhotos).not.toHaveBeenCalled();
  });

  it("rolls back the request when photo upload is incomplete", async () => {
    const uploadPhotos = vi.fn().mockResolvedValue(["one"]);

    await expect(submitValidatedQuickSale(validForm(), "user-1", 280000, 2, uploadPhotos)).rejects.toThrow(
      /Photo upload failed/i,
    );
    expect(deleteMock).toHaveBeenCalled();
    expect(firstEqMock).toHaveBeenCalledWith("id", "req-1");
    expect(secondEqMock).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("throws insert and invalid-property errors before reporting a successful submission", async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: new Error("insert failed") });
    await expect(submitValidatedQuickSale(validForm(), "user-1", 280000, 0, vi.fn())).rejects.toThrow("insert failed");

    await expect(
      submitValidatedQuickSale(validForm({ propertyType: "garage" }), "user-1", 280000, 0, vi.fn()),
    ).rejects.toThrow("Property type is invalid");
  });
});
