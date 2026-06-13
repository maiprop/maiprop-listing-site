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
    expect(toastMock.error).toHaveBeenCalledWith("Creating new buildings is for developers only. Switch your account type in Settings.");
    expect(navigateMock).toHaveBeenCalledWith("/dashboard/settings", { replace: true });
  });

  it("shows the listing limit card when the developer is at the plan cap", () => {
    getPlanLimitsMock.mockReturnValue({ listings: 1 });
    useMyListingsMock.mockReturnValue({ data: [{ id: "one", status: "active" }] });

    renderPage();

    expect(screen.getByText(/Listing Limit Reached/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade Plan/i })).toHaveAttribute("href", "/pricing");
  });

  it("does not count inactive listings against the developer active-listing cap", () => {
    getPlanLimitsMock.mockReturnValue({ listings: 1 });
    useMyListingsMock.mockReturnValue({
      data: [
        { id: "active", status: "active" },
        { id: "draft", status: "draft" },
      ],
    });

    const blocked = renderPage();

    expect(screen.getByText(/Listing Limit Reached/i)).toBeInTheDocument();
    blocked.unmount();

    useMyListingsMock.mockReturnValue({
      data: [
        { id: "draft", status: "draft" },
        { id: "paused", status: "paused" },
      ],
    });

    const allowed = renderPage();
    expect(screen.queryByText(/Listing Limit Reached/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
    allowed.unmount();
  });

  it("presents the wizard as one New Build project ad, not a project plus linked listings", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /Create New Build Ad/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Project/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inventory/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ad/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Create a regular listing/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage New Build Ads/i })).toHaveAttribute("href", "/projects");

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 2 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Project Inventory/i })).toBeInTheDocument();
    expect(screen.getByText(/Add the first available unit/i)).toBeInTheDocument();
    expect(screen.queryByText(/specific unit you are listing/i)).not.toBeInTheDocument();

    fillRequiredUnit();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 3 of 5/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 4 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Public New Build Ad/i })).toBeInTheDocument();
    expect(screen.queryByText(/Listing Info/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 5 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Project Ad Photos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish New Build Ad/i })).toBeInTheDocument();
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
    expect(screen.getByDisplayValue("Marina Heights")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 5 of 5/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));
    expect(toastMock.error).toHaveBeenLastCalledWith("At least one photo is required");
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("uploads a photo, uses it as cover, submits, and navigates to the created listing", async () => {
    renderPage();

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Project/i }));
    await screen.findByText(/Step 1 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);
    fillRequiredUnit();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 of 5/i);
    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights - new residences in Glyfada"), { target: { value: "Marina Heights A101" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 5 of 5/i);

    const file = new File(["photo"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => expect(uploadListingImageMock).toHaveBeenCalledWith(file, "u-1"));
    await screen.findByRole("button", { name: /Cover/i });

    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u-1",
      finalTitle: "Marina Heights A101",
      coverImageUrl: "https://cdn.test/cover.jpg",
      additionalImageUrls: [],
    })));
    expect(toastMock.success).toHaveBeenCalledWith("New Build ad published!");
    expect(navigateMock).toHaveBeenCalledWith("/new-build/listing-1");
  });

  it("clears stale coordinates when the project address is manually edited", async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights"), { target: { value: "Marina Heights" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 12345/2024"), { target: { value: "12345/2024" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Athens"), { target: { value: "Athens" } });
    fireEvent.change(screen.getByPlaceholderText("37.9838"), { target: { value: "37.9838" } });
    fireEvent.change(screen.getByPlaceholderText("23.7275"), { target: { value: "23.7275" } });
    fireEvent.change(screen.getByPlaceholderText("Street, number"), { target: { value: "Metaxa 11" } });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);
    fillRequiredUnit();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 of 5/i);
    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights - new residences in Glyfada"), { target: { value: "Marina Heights A101" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 5 of 5/i);

    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [new File(["photo"], "cover.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("button", { name: /Cover/i });
    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      project: expect.objectContaining({
        address: "Metaxa 11",
        latitude: "",
        longitude: "",
      }),
    })));
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
    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights - new residences in Glyfada"), { target: { value: "Marina Heights A101" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 5 of 5/i);

    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [new File(["photo"], "cover.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("button", { name: /Cover/i });
    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Failed to publish New Build ad. Please try again."));
    expect(navigateMock).not.toHaveBeenCalledWith("/new-build/listing-1");
  });

  it("exercises every wizard field, previous-step navigation, media upload, drag/drop, and cover selection", async () => {
    uploadListingImageMock
      .mockResolvedValueOnce({ id: "img-1", url: "https://cdn.test/drop.jpg" })
      .mockResolvedValueOnce({ id: "img-2", url: "https://cdn.test/click.jpg" });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights"), { target: { value: "Marina Park" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 12345/2024"), { target: { value: "98765/2026" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Athens"), { target: { value: "Thessaloniki" } });
    fireEvent.change(screen.getByPlaceholderText("Company name"), { target: { value: "mAI Dev" } });
    fireEvent.change(screen.getByPlaceholderText("Architect or group"), { target: { value: "Studio North" } });
    fireEvent.change(screen.getByPlaceholderText("Constructor"), { target: { value: "Build North" } });
    fireEvent.change(screen.getByPlaceholderText("Δήμος"), { target: { value: "Kalamaria" } });
    fireEvent.change(screen.getByPlaceholderText("Street, number"), { target: { value: "Seafront 12" } });
    fireEvent.change(screen.getByPlaceholderText("37.9838"), { target: { value: "40.6401" } });
    fireEvent.change(screen.getByPlaceholderText("23.7275"), { target: { value: "22.9444" } });
    fireEvent.change(screen.getByPlaceholderText("Brief description..."), { target: { value: "A full project description" } });
    fireEvent.change(screen.getByPlaceholderText("Neighbourhood, amenities..."), { target: { value: "Walkable seaside neighbourhood" } });
    screen.getAllByDisplayValue("").filter((el) => (el as HTMLInputElement).type === "date").forEach((input, index) => {
      fireEvent.change(input, { target: { value: `2026-0${index + 1}-01` } });
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);

    fireEvent.change(screen.getByPlaceholderText("A101"), { target: { value: "B203" } });
    fireEvent.change(screen.getByPlaceholderText("101"), { target: { value: "203" } });
    fireEvent.change(screen.getByPlaceholderText("85"), { target: { value: "92" } });
    fireEvent.change(screen.getByPlaceholderText("12"), { target: { value: "18" } });
    fireEvent.change(screen.getByPlaceholderText("250000"), { target: { value: "345000" } });
    const twos = screen.getAllByPlaceholderText("2");
    fireEvent.change(twos[0], { target: { value: "3" } });
    fireEvent.change(twos[1], { target: { value: "2" } });
    const ones = screen.getAllByPlaceholderText("1");
    fireEvent.change(ones[0], { target: { value: "4" } });
    fireEvent.change(ones[1], { target: { value: "2" } });
    const zeroes = screen.getAllByPlaceholderText("0");
    zeroes.forEach((input, index) => fireEvent.change(input, { target: { value: String(index + 1) } }));
    const unitSelects = screen.getAllByRole("combobox");
    fireEvent.change(unitSelects[0], { target: { value: "open" } });
    fireEvent.change(unitSelects[1], { target: { value: "A" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. heat pump"), { target: { value: "heat pump" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. AC"), { target: { value: "VRF" } });
    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }

    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    await screen.findByText(/Step 1 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 of 5/i);

    const mediaInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(mediaInputs[0], { target: { files: [new File(["media"], "render.jpg", { type: "image/jpeg" })] } });
    fireEvent.change(mediaInputs[1], { target: { files: [new File(["video"], "tour.mp4", { type: "video/mp4" })] } });
    fireEvent.change(mediaInputs[3], { target: { files: [new File(["pdf"], "brochure.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("render.jpg")).toBeInTheDocument();
    expect(screen.getByText("tour.mp4")).toBeInTheDocument();
    expect(screen.getByText("brochure.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 of 5/i);
    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights - new residences in Glyfada"), { target: { value: "B203 at Marina Park" } });
    fireEvent.change(screen.getByPlaceholderText("Describe the project, available units, finishes, amenities, and delivery plan..."), {
      target: { value: "Detailed listing copy" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 5 of 5/i);

    const dropZone = screen.getByText(/Drop photos/i).closest("div")!;
    const dropFile = new File(["drop"], "drop.jpg", { type: "image/jpeg" });
    fireEvent.dragOver(dropZone);
    fireEvent.drop(dropZone, { dataTransfer: { files: [dropFile] } });
    await waitFor(() => expect(uploadListingImageMock).toHaveBeenCalledWith(dropFile, "u-1"));

    const clickFile = new File(["click"], "click.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [clickFile] },
    });
    await waitFor(() => expect(uploadListingImageMock).toHaveBeenCalledWith(clickFile, "u-1"));

    fireEvent.click(await screen.findByRole("button", { name: /Set as cover/i }));
    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      finalTitle: "B203 at Marina Park",
      additionalImageUrls: expect.arrayContaining(["https://cdn.test/drop.jpg"]),
    })));
  });
});
