import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAuthMock,
  useSubMock,
  useMyListingsMock,
  getPlanLimitsMock,
  submitMock,
  uploadListingImageMock,
  toastMock,
  navigateMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSubMock: vi.fn(),
  useMyListingsMock: vi.fn(),
  getPlanLimitsMock: vi.fn(),
  submitMock: vi.fn(),
  uploadListingImageMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn() },
  navigateMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => useSubMock() }));
vi.mock("@/hooks/useListings", () => ({ useMyListings: () => useMyListingsMock() }));
vi.mock("@/hooks/usePlanLimits", () => ({ getPlanLimits: (...args: unknown[]) => getPlanLimitsMock(...args) }));
vi.mock("@/hooks/useCreateBuildingListing", () => ({ useCreateBuildingListing: () => submitMock }));
vi.mock("@/lib/buildingListingUploads", () => ({ uploadListingImage: (...args: unknown[]) => uploadListingImageMock(...args) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import CreateNewBuildingListing from "@/pages/CreateNewBuildingListing";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

const renderPage = () => render(<CreateNewBuildingListing />, { wrapper });

const fillRequiredProject = () => {
  fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights"), { target: { value: "Marina Heights" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. 12345/2024"), { target: { value: "12345/2024" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. Athens"), { target: { value: "Athens" } });
};

const fillRequiredUnit = () => {
  fireEvent.change(screen.getByPlaceholderText("85"), { target: { value: "85" } });
  fireEvent.change(screen.getByPlaceholderText("250000"), { target: { value: "250000" } });
  const bedroomAndBathroomInputs = screen.getAllByPlaceholderText("2");
  fireEvent.change(bedroomAndBathroomInputs[0], { target: { value: "2" } });
  fireEvent.change(bedroomAndBathroomInputs[1], { target: { value: "1" } });
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({
    user: { id: "u-1" },
    profile: { role: "developer", participant_type: "developer" },
  });
  useSubMock.mockReturnValue({ hasDeveloperPro: false });
  useMyListingsMock.mockReturnValue({ data: [] });
  getPlanLimitsMock.mockReturnValue({ listings: 5 });
  submitMock.mockResolvedValue({ listingId: "listing-1" });
  uploadListingImageMock.mockResolvedValue({ id: "img-1", url: "https://cdn.test/cover.jpg" });
  Object.defineProperty(URL, "createObjectURL", { writable: true, value: vi.fn(() => "blob:test") });
  Object.defineProperty(globalThis, "crypto", {
    writable: true,
    value: { ...(globalThis.crypto ?? {}), randomUUID: vi.fn(() => "uuid-1") },
  });
});

describe("CreateNewBuildingListing", () => {
  it("redirects non-developers away from the new-building wizard", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { role: "seller", participant_type: "seller" },
    });

    renderPage();

    expect(screen.getByText(/Redirecting/i)).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith("New building listings are for developers only. Switch your account type in Settings.");
    expect(navigateMock).toHaveBeenCalledWith("/dashboard/settings", { replace: true });
  });

  it("shows the listing limit card when the developer is at the plan cap", () => {
    getPlanLimitsMock.mockReturnValue({ listings: 1 });
    useMyListingsMock.mockReturnValue({ data: [{ id: "one" }] });

    renderPage();

    expect(screen.getByText(/Listing Limit Reached/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade Plan/i })).toHaveAttribute("href", "/pricing");
  });

  it("validates required fields across the building, unit, listing, and photos steps", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText("Project name is required")).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenLastCalledWith("Project name is required");

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 2 of 5/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText("Internal sqm is required")).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenLastCalledWith("Internal sqm is required");

    fillRequiredUnit();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 3 of 5/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 4 of 5/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText("Listing title is required")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights - Unit A101"), { target: { value: "Marina Heights A101" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 5 of 5/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Create Listing/i }));
    expect(toastMock.error).toHaveBeenLastCalledWith("At least one photo is required");
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("uploads a photo, uses it as cover, submits, and navigates to the created listing", async () => {
    renderPage();

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);
    fillRequiredUnit();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 of 5/i);
    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights - Unit A101"), { target: { value: "Marina Heights A101" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 5 of 5/i);

    const file = new File(["photo"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => expect(uploadListingImageMock).toHaveBeenCalledWith(file, "u-1"));
    await screen.findByRole("button", { name: /Cover/i });

    fireEvent.click(screen.getByRole("button", { name: /Create Listing/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u-1",
      finalTitle: "Marina Heights A101",
      coverImageUrl: "https://cdn.test/cover.jpg",
      additionalImageUrls: [],
    })));
    expect(toastMock.success).toHaveBeenCalledWith("New building listing created!");
    expect(navigateMock).toHaveBeenCalledWith("/new-build/listing-1");
  });

  it("surfaces media selection and submit failures without leaving the wizard", async () => {
    submitMock.mockRejectedValueOnce(new Error("nope"));
    renderPage();

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);
    fillRequiredUnit();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 of 5/i);

    const badPdf = new File(["bad"], "bad.txt", { type: "text/plain" });
    const brochureInput = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[3];
    fireEvent.change(brochureInput, {
      target: { files: [badPdf] },
    });
    expect(toastMock.error).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 of 5/i);
    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights - Unit A101"), { target: { value: "Marina Heights A101" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 5 of 5/i);

    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [new File(["photo"], "cover.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("button", { name: /Cover/i });
    fireEvent.click(screen.getByRole("button", { name: /Create Listing/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Failed to create new building listing. Please try again."));
    expect(navigateMock).not.toHaveBeenCalledWith("/new-build/listing-1");
  });
});
