/**
 * Tests for the multi-step Firesale Quick Sale form. The form manages its
 * own state, validation, photo upload and AI estimate. We mock:
 *  - @/contexts/AuthContext           → supply a canSubmit seller / non-seller
 *  - @/lib/authUtils::isSellerRole    → directly control the gate
 *  - @/hooks/useSubscription
 *  - @/integrations/supabase/client   → functions.invoke + from().insert()
 *  - react-router-dom                 → capture navigate()
 *  - sonner                           → capture toast.error/.success
 *  - global fetch                     → short-circuit Nominatim
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { useAuthMock, useSubMock, isSellerRoleMock, functionsInvokeMock, fromMock, navigateMock, toastMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSubMock: vi.fn(),
  isSellerRoleMock: vi.fn(),
  functionsInvokeMock: vi.fn(),
  fromMock: vi.fn(),
  navigateMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => useSubMock() }));
vi.mock("@/lib/authUtils", () => ({ isSellerRole: (...a: unknown[]) => isSellerRoleMock(...a) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: functionsInvokeMock },
    from: (...a: unknown[]) => fromMock(...a),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://x" } }),
      }),
    },
  },
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("sonner", () => ({ toast: toastMock }));

// Block Nominatim autocomplete so the 400ms timer never fires real fetches.
const fetchStub = vi.fn().mockRejectedValue(new Error("network-disabled-in-tests"));
vi.stubGlobal("fetch", fetchStub);

import { FiresaleQuickSaleForm } from "@/components/firesale/FiresaleQuickSaleForm";
import { isValidKaek, normalizeKaek, toFiresalePropertyType } from "@/lib/firesaleValidation";
import { valuationV2 } from "@/test/valuationV2Fixture";

const getPropertyTypeSelect = (): HTMLSelectElement => {
  const select = document.querySelector("select");
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("Expected property type select to render");
  }
  return select;
};

const getPhotoInput = (): HTMLInputElement => {
  const input = document.querySelector("input[type='file']");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected photo file input to render");
  }
  return input;
};

const fillValidQuickSale = () => {
  fireEvent.change(screen.getByPlaceholderText(/Kifisia, Dekelia/i), { target: { value: "Kolonaki 12, Athens" } });
  fireEvent.change(screen.getByPlaceholderText(/050240601001/i), { target: { value: "050240601001/0/1" } });
  fireEvent.change(getPropertyTypeSelect(), { target: { value: "apartment" } });
  fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 120$/i), { target: { value: "95" } });
  fireEvent.change(screen.getByPlaceholderText(/Your target/i), { target: { value: "350000" } });
  fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 1998$/i), { target: { value: "2010" } });
  fireEvent.change(screen.getByPlaceholderText(/Legal issues, urgent timeline/i), { target: { value: "Quick sale needed within 30 days." } });
  const files = Array.from({ length: 6 }, (_, index) => new File([`x${index}`], `photo-${index}.jpg`, { type: "image/jpeg" }));
  fireEvent.change(getPhotoInput(), { target: { files } });
};

beforeEach(() => {
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({
    user: { id: "u-1", email: "seller@example.com" },
    profile: { first_name: "Alice", phone: "phone-redacted" },
  });
  useSubMock.mockReset();
  useSubMock.mockReturnValue({ isPro: false });
  isSellerRoleMock.mockReset();
  isSellerRoleMock.mockReturnValue(true);
  functionsInvokeMock.mockReset();
  functionsInvokeMock.mockResolvedValue({ data: valuationV2({ estimatedValue: 300_000 }), error: null });
  fromMock.mockReset();
  navigateMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.warning.mockReset();
  toastMock.info.mockReset();
  fetchStub.mockClear();
});

describe("FiresaleQuickSaleForm", () => {
  it("keeps KAEK and property-type helpers aligned with Greek cadastral and DB formats", () => {
    expect(normalizeKaek(" 050240601001 // 0 / 1 abc ")).toBe("050240601001/0/1");
    expect(isValidKaek("050240601001")).toBe(true);
    expect(isValidKaek("050240601001/0/1")).toBe(true);
    expect(isValidKaek("2222222222222222222222")).toBe(false);
    expect(toFiresalePropertyType("commercial_shop")).toBe("commercial");
    expect(toFiresalePropertyType("apartment")).toBe("apartment");
    expect(toFiresalePropertyType("garage")).toBeNull();
  });

  it("renders the step-1 form header + step indicator", () => {
    render(<FiresaleQuickSaleForm />);
    expect(screen.getByText(/Get Your Preliminary Cash Offer/i)).toBeInTheDocument();
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/Property Details/i)).toBeInTheDocument();
  });

  it("gives the property type select an accessible name even when the form is locked", () => {
    isSellerRoleMock.mockReturnValue(false);
    render(<FiresaleQuickSaleForm />);
    expect(screen.getByRole("combobox", { name: /Property Type/i })).toBeDisabled();
  });

  it("shows the 'Seller account required' banner when isSellerRole is false", () => {
    isSellerRoleMock.mockReturnValue(false);
    render(<FiresaleQuickSaleForm />);
    expect(screen.getByText(/Seller account required/i)).toBeInTheDocument();
    // The banner renders a CTA button — 'Become a Seller' when logged in.
    expect(screen.getByRole("button", { name: /Become a Seller/i })).toBeInTheDocument();
  });

  it("shows a profile-loading state instead of the seller-required banner while auth is resolving", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "seller@example.com" },
      profile: null,
      loading: false,
      profileLoading: true,
    });
    render(<FiresaleQuickSaleForm />);
    expect(screen.getByText(/Checking seller profile/i)).toBeInTheDocument();
    expect(screen.queryByText(/Seller account required/i)).not.toBeInTheDocument();
  });

  it("sends a logged-in user without a loaded profile to onboarding instead of staying pending", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "seller@example.com" },
      profile: null,
      loading: false,
      profileLoading: false,
    });
    render(<FiresaleQuickSaleForm />);
    expect(screen.getByText(/Seller account required/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Become a Seller/i }));
    expect(navigateMock).toHaveBeenCalledWith("/onboarding");
  });

  it("renders a 'Sign up as Seller' CTA when there is no user at all", () => {
    isSellerRoleMock.mockReturnValue(false);
    useAuthMock.mockReturnValue({ user: null, profile: null });
    render(<FiresaleQuickSaleForm />);
    expect(screen.getByRole("button", { name: /Sign up as Seller/i })).toBeInTheDocument();
  });

  it("the non-seller banner CTA redirects logged-in users to /onboarding", () => {
    isSellerRoleMock.mockReturnValue(false);
    render(<FiresaleQuickSaleForm />);
    fireEvent.click(screen.getByRole("button", { name: /Become a Seller/i }));
    expect(navigateMock).toHaveBeenCalledWith("/onboarding");
  });

  it("the non-seller banner CTA redirects anonymous users to /signup?type=seller", () => {
    isSellerRoleMock.mockReturnValue(false);
    useAuthMock.mockReturnValue({ user: null, profile: null });
    render(<FiresaleQuickSaleForm />);
    fireEvent.click(screen.getByRole("button", { name: /Sign up as Seller/i }));
    expect(navigateMock).toHaveBeenCalledWith("/signup?type=seller");
  });

  it("keeps the non-seller Quick Sale form visible but locked without automatic onboarding redirects", () => {
    isSellerRoleMock.mockReturnValue(false);
    render(<FiresaleQuickSaleForm />);

    expect(screen.getByText(/Property Details/i)).toBeInTheDocument();
    expect(screen.getByText(/Seller account required/i)).toBeInTheDocument();

    const fileInput = getPhotoInput();
    expect(fileInput).toBeDisabled();

    const continueButton = screen.getByRole("button", { name: /Seller profile required/i });
    expect(continueButton).toBeDisabled();

    const validFile = new File(["x"], "admin-upload.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [validFile] } });
    fireEvent.click(continueButton);

    expect(screen.queryByText(/1 photo selected/i)).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("the primary 'Get AI Estimate & Continue' button stays clickable and surfaces validation errors", () => {
    render(<FiresaleQuickSaleForm />);
    const btn = screen.getByRole("button", { name: /Get AI Estimate/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(toastMock.error).toHaveBeenCalledWith("Please enter a full address (min 5 characters).");
  });

  it("shows the missing-photo validation inline even before any photos are selected", () => {
    render(<FiresaleQuickSaleForm />);
    fireEvent.change(screen.getByPlaceholderText(/Kifisia, Dekelia/i), {
      target: { value: "Kolonaki 12, Athens" },
    });
    fireEvent.change(screen.getByPlaceholderText(/050240601001/i), {
      target: { value: "050240601001/0/1" },
    });
    fireEvent.change(getPropertyTypeSelect(), { target: { value: "apartment" } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 120$/i), { target: { value: "95" } });
    fireEvent.change(screen.getByPlaceholderText(/Your target/i), { target: { value: "350000" } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 1998$/i), { target: { value: "2010" } });
    fireEvent.change(screen.getByPlaceholderText(/Legal issues, urgent timeline/i), {
      target: { value: "Quick sale needed within 30 days." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Get AI Estimate/i }));

    expect(screen.getByText("Please upload at least 5 property photos.")).toBeInTheDocument();
  });

  it("updates controlled state as the user fills in the address + KAEK + property type + sqm/price/year", () => {
    render(<FiresaleQuickSaleForm />);
    const address = screen.getByPlaceholderText(/Kifisia, Dekelia/i);
    fireEvent.change(address, { target: { value: "Kolonaki 12, Athens" } });
    expect((address as HTMLInputElement).value).toBe("Kolonaki 12, Athens");

    const kaek = screen.getByPlaceholderText(/050240601001/i);
    fireEvent.change(kaek, { target: { value: "050240601001/0/1" } });
    expect((kaek as HTMLInputElement).value).toBe("050240601001/0/1");

    const typeSelect = getPropertyTypeSelect();
    fireEvent.change(typeSelect, { target: { value: "apartment" } });
    expect(typeSelect.value).toBe("apartment");

    const sqm = screen.getByPlaceholderText(/^e\.g\. 120$/i) as HTMLInputElement;
    fireEvent.change(sqm, { target: { value: "95" } });
    expect(sqm.value).toBe("95");

    const price = screen.getByPlaceholderText(/Your target/i) as HTMLInputElement;
    fireEvent.change(price, { target: { value: "350000" } });
    expect(price.value).toBe("350000");

    const year = screen.getByPlaceholderText(/^e\.g\. 1998$/i) as HTMLInputElement;
    fireEvent.change(year, { target: { value: "2010" } });
    expect(year.value).toBe("2010");
  });

  it("normalizes KAEK input and rejects values that do not match Greek cadastral format", () => {
    render(<FiresaleQuickSaleForm />);
    const kaek = screen.getByPlaceholderText(/050240601001/i) as HTMLInputElement;

    fireEvent.change(kaek, { target: { value: " 050240601001 // 0 / 1 abc " } });
    expect(kaek.value).toBe("050240601001/0/1");

    fireEvent.change(screen.getByPlaceholderText(/Kifisia, Dekelia/i), {
      target: { value: "Kolonaki 12, Athens" },
    });
    fireEvent.change(kaek, { target: { value: "222222222222222222222222" } });
    fireEvent.change(getPropertyTypeSelect(), { target: { value: "apartment" } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 120$/i), { target: { value: "95" } });
    fireEvent.change(screen.getByPlaceholderText(/Your target/i), { target: { value: "350000" } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 1998$/i), { target: { value: "2010" } });
    fireEvent.change(screen.getByPlaceholderText(/Legal issues, urgent timeline/i), {
      target: { value: "all ok" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Get AI Estimate/i }));
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/KAEK must be 12 digits/i));
  });

  it("debounces Nominatim autocomplete when the address ≥ 3 chars, and clears when < 3", async () => {
    vi.useFakeTimers();
    try {
      fetchStub.mockResolvedValueOnce({ json: () => Promise.resolve([]) } as unknown as Response);
      render(<FiresaleQuickSaleForm />);
      fireEvent.change(screen.getByPlaceholderText(/Kifisia, Dekelia/i), {
        target: { value: "Athens" },
      });
      // Loading label appears synchronously after the useEffect schedules the timer.
      expect(screen.getByText(/Searching address suggestions/i)).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(fetchStub).toHaveBeenCalled();
      expect(screen.queryByText(/Searching address suggestions/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows photo file selection to be invoked via the hidden file input (no crash on 0 files)", () => {
    render(<FiresaleQuickSaleForm />);
    const fileInput = getPhotoInput();
    // Simulate an empty FileList — the handler should skip cleanly.
    fireEvent.change(fileInput, { target: { files: [] } });
    // Continue stays clickable so validation can explain exactly what is missing.
    expect(screen.getByRole("button", { name: /Get AI Estimate/i })).not.toBeDisabled();
  });

  it("filters out invalid file types + warns, then renders previews for the survivors", () => {
    // Stub URL.createObjectURL so the preview map doesn't crash. Also
    // stub revokeObjectURL — the photo hook revokes blob URLs on
    // unmount/replacement to avoid leaking image bytes.
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:preview", revokeObjectURL: () => {} });
    render(<FiresaleQuickSaleForm />);
    const fileInput = getPhotoInput();
    const validFile = new File(["x"], "ok.jpg", { type: "image/jpeg" });
    const invalidType = new File(["x"], "bad.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [validFile, invalidType] } });
    expect(toastMock.warning).toHaveBeenCalledWith(expect.stringMatching(/skipped/i));
    // The "1 photo selected" copy now appears.
    expect(screen.getByText(/1 photo selected/i)).toBeInTheDocument();
  });

  it("Continue button enables once 6 valid photos + every text field are populated, and clicking it fires generateEstimate", async () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: (_: unknown) => `blob:p-${Math.random()}`, revokeObjectURL: () => {} });
    render(<FiresaleQuickSaleForm />);

    // Fill every required text field.
    fireEvent.change(screen.getByPlaceholderText(/Kifisia, Dekelia/i), {
      target: { value: "Kolonaki 12, Athens" },
    });
    fireEvent.change(screen.getByPlaceholderText(/050240601001/i), {
      target: { value: "050240601001/0/1" },
    });
    fireEvent.change(getPropertyTypeSelect(), { target: { value: "apartment" } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 120$/i), { target: { value: "95" } });
    fireEvent.change(screen.getByPlaceholderText(/Your target/i), { target: { value: "350000" } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 1998$/i), { target: { value: "2010" } });
    fireEvent.change(screen.getByPlaceholderText(/Legal issues, urgent timeline/i), {
      target: { value: "Quick sale needed within 30 days." },
    });

    // Inject 6 valid photo files so the "min 5 photos" rule passes.
    const files = Array.from({ length: 6 }, (_, i) =>
      new File([`x${i}`], `photo-${i}.jpg`, { type: "image/jpeg" }),
    );
    const fileInput = getPhotoInput();
    fireEvent.change(fileInput, { target: { files } });
    expect(screen.getByText(/6 photos selected/i)).toBeInTheDocument();

    // Now the Continue CTA should be enabled — click it.
    const btn = screen.getByRole("button", { name: /Get AI Estimate/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    // generateEstimate is fired and reaches the supabase invoke + step 2.
    await waitFor(() =>
      expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", {
        body: expect.objectContaining({
          responseVersion: 2,
          city: "Athens",
          address: "Kolonaki 12, Athens",
          propertyType: "apartment",
          price: 350000,
          sqm: 95,
          yearBuilt: 2010,
        }),
      }),
    );
    // Step indicator advances to 2/2.
    await waitFor(() => expect(screen.getByText(/2\/2/)).toBeInTheDocument());
  });

  it("Back from step 2 returns to step 1 (1/2) without losing form data", async () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: (_: unknown) => `blob:p-${Math.random()}`, revokeObjectURL: () => {} });
    render(<FiresaleQuickSaleForm />);
    fireEvent.change(screen.getByPlaceholderText(/Kifisia, Dekelia/i), {
      target: { value: "Kolonaki 12, Athens" },
    });
    fireEvent.change(screen.getByPlaceholderText(/050240601001/i), {
      target: { value: "050240601001/0/1" },
    });
    fireEvent.change(getPropertyTypeSelect(), { target: { value: "apartment" } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 120$/i), { target: { value: "95" } });
    fireEvent.change(screen.getByPlaceholderText(/Your target/i), { target: { value: "350000" } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. 1998$/i), { target: { value: "2010" } });
    fireEvent.change(screen.getByPlaceholderText(/Legal issues, urgent timeline/i), {
      target: { value: "Quick sale needed within 30 days." },
    });
    const files = Array.from({ length: 6 }, (_, i) =>
      new File([`x${i}`], `p${i}.jpg`, { type: "image/jpeg" }),
    );
    fireEvent.change(getPhotoInput(), { target: { files } });
    fireEvent.click(screen.getByRole("button", { name: /Get AI Estimate/i }));
    await waitFor(() => expect(screen.getByText(/2\/2/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    // Address survives the round-trip.
    expect((screen.getByPlaceholderText(/Kifisia, Dekelia/i) as HTMLInputElement).value).toBe(
      "Kolonaki 12, Athens",
    );
  });

  it("does not publish a delayed estimate after the valuation subject changes", async () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: (_: unknown) => `blob:p-${Math.random()}`, revokeObjectURL: () => {} });
    let resolveEstimate!: (value: unknown) => void;
    functionsInvokeMock.mockReturnValueOnce(new Promise((resolve) => { resolveEstimate = resolve; }));
    render(<FiresaleQuickSaleForm />);
    fillValidQuickSale();

    fireEvent.click(screen.getByRole("button", { name: /Get AI Estimate/i }));
    await waitFor(() => expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", expect.any(Object)));
    fireEvent.change(screen.getByPlaceholderText(/Your target/i), { target: { value: "360000" } });
    resolveEstimate({ data: valuationV2({ estimatedValue: 300_000 }), error: null });

    await waitFor(() => expect(screen.getByText(/2\/2/)).toBeInTheDocument());
    expect(screen.getByText("Market estimate")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/300[,.]000/)).not.toBeInTheDocument();
  });
});
