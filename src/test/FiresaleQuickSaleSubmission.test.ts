import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickSaleFormValues } from "@/components/firesale/quickSaleFormModel";

const { fromMock, invokeMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  invokeMock: vi.fn(),
  toastMock: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock, functions: { invoke: invokeMock } },
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
  invokeMock.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();
  invokeMock.mockResolvedValue({ data: { data: { id: "req-1" }, error: null }, error: null });
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

    applyRemoteEstimate({ estimatedValue: 130_000, auctionAdjustedValue: 154_000 }, null, setAiEstimate);
    expect(setAiEstimate).toHaveBeenLastCalledWith(146300);

    applyRemoteEstimate({}, null, setAiEstimate, 350_000);
    expect(setAiEstimate).toHaveBeenLastCalledWith(332500);

    applyRemoteEstimate({ error: "monthly_limit_reached" }, null, setAiEstimate, 350_000);
    expect(setAiEstimate).toHaveBeenCalledTimes(3);
    expect(toastMock.error).toHaveBeenCalledWith("AI estimate is temporarily unavailable due to usage limits.");

    applyRemoteEstimate({ error: "provider_down" }, null, setAiEstimate, 350_000);
    expect(setAiEstimate).toHaveBeenCalledTimes(3);
    expect(toastMock.error).toHaveBeenCalledWith("AI estimate is temporarily unavailable. Using fallback estimate.");

    applyRemoteEstimate(null, new Error("gateway 402 usage limit"), setAiEstimate, 350_000);
    expect(toastMock.error).toHaveBeenCalledTimes(3);
  });

  it("submits the normalized firesale request through the Edge boundary, uploads every photo, and returns the stored request id", async () => {
    const uploadPhotos = vi.fn().mockResolvedValue(["one", "two", "three", "four", "five"]);

    await expect(submitValidatedQuickSale(validForm(), "user-1", 280000, 5, uploadPhotos)).resolves.toEqual({
      estimate: 280000,
      requestId: "req-1",
    });

    expect(fromMock).not.toHaveBeenCalledWith("firesale_requests");
    expect(invokeMock).toHaveBeenCalledWith(
      "submit-firesale-request",
      expect.objectContaining({
        body: {
          action: "create",
          request: expect.objectContaining({
            address: "Kolonaki 12, Athens",
            city: "Athens",
            propertyType: "commercial",
            sqm: 100,
            askingPrice: 350000,
            contactEmail: "alice@example.com",
            contactPhone: null,
            aiEstimate: 280000,
          }),
        },
      }),
    );
    expect(invokeMock.mock.calls[0][1].body.request.notes).toContain("KAEK: 050240601001/0/1");
    expect(uploadPhotos).toHaveBeenCalledWith("req-1");
  });

  it("uses the fallback estimate and skips uploading when there are no photos or stored id", async () => {
    invokeMock.mockResolvedValueOnce({ data: { data: {}, error: null }, error: null });
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
    expect(invokeMock).toHaveBeenCalledWith(
      "submit-firesale-request",
      expect.objectContaining({
        body: {
          action: "rollback",
          requestId: "req-1",
        },
      }),
    );
  });

  it("throws insert and invalid-property errors before reporting a successful submission", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error("insert failed") });
    await expect(submitValidatedQuickSale(validForm(), "user-1", 280000, 0, vi.fn())).rejects.toThrow("insert failed");

    await expect(
      submitValidatedQuickSale(validForm({ propertyType: "garage" }), "user-1", 280000, 0, vi.fn()),
    ).rejects.toThrow("Property type is invalid");
  });
});
