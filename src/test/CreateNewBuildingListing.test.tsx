import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAuthMock,
  useSubMock,
  useMyListingsMock,
  getPlanLimitsMock,
  useManageableOrganizationsMock,
  submitMock,
  uploadListingImageMock,
  toastMock,
  navigateMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSubMock: vi.fn(),
  useMyListingsMock: vi.fn(),
  getPlanLimitsMock: vi.fn(),
  useManageableOrganizationsMock: vi.fn(),
  submitMock: vi.fn(),
  uploadListingImageMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn() },
  navigateMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => useSubMock() }));
vi.mock("@/hooks/useListings", () => ({
  useActorOwnedListings: () => useMyListingsMock(),
  useMyListings: () => useMyListingsMock(),
}));
vi.mock("@/hooks/usePlanLimits", () => ({ getPlanLimits: (...args: unknown[]) => getPlanLimitsMock(...args) }));
vi.mock("@/hooks/useCreateBuildingListing", () => ({ useCreateBuildingListing: () => submitMock }));
vi.mock("@/hooks/useManageableOrganizations", () => ({
  useManageableOrganizations: () => useManageableOrganizationsMock(),
}));
vi.mock("@/lib/buildingListingUploads", () => ({
  uploadNewBuildingListingImage: (...args: unknown[]) => uploadListingImageMock(...args),
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/location/LocationAutocompleteInput", () => ({
  LocationAutocompleteInput: ({
    id,
    value,
    onChange,
    onSuggestionSelect,
    placeholder,
  }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    onSuggestionSelect: (selection: Record<string, string>) => void;
    placeholder: string;
  }) => (
    <div>
      <input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      <button
        type="button"
        aria-label={`select ${id}`}
        onClick={() => onSuggestionSelect({
          value: "Kalimnou 27, Agioi Anargyroi",
          addressLine: "Kalimnou 27",
          city: "Agioi Anargyroi",
          municipality: "Agioi Anargyroi-Kamatero",
          region: "Attica",
          latitude: "38.0301",
          longitude: "23.7192",
        })}
      >
        select suggestion
      </button>
    </div>
  ),
}));
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

const seedDraft = (overrides: Record<string, unknown>) => {
  localStorage.setItem("maiprop:new-building-listing-draft:v1:u-1", JSON.stringify({
    version: 1,
    step: "building",
    projectKind: "new_build",
    project: {},
    units: [],
    listing: {},
    images: [],
    coverImageId: null,
    projectId: "draft-project-id",
    organizationId: null,
    ...overrides,
  }));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAuthMock.mockReturnValue({
    user: { id: "u-1" },
    profile: { role: "developer", participant_type: "developer" },
  });
  useSubMock.mockReturnValue({ hasDeveloperPro: false });
  useMyListingsMock.mockReturnValue({ data: [] });
  getPlanLimitsMock.mockReturnValue({ listings: 5 });
  useManageableOrganizationsMock.mockReturnValue({ data: [] });
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

  it("allows platform admins and unlimited Developer Pro plans to use the project wizard", () => {
    useAuthMock.mockReturnValue({
      user: { id: "admin-1" },
      profile: { role: "admin", participant_type: "admin" },
    });
    useSubMock.mockReturnValue({ hasDeveloperPro: true });
    useMyListingsMock.mockReturnValue({ data: Array.from({ length: 20 }, (_, index) => ({ id: index, status: "active" })) });
    getPlanLimitsMock.mockReturnValue({ listings: null });

    renderPage();

    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
    expect(screen.queryByText(/Listing Limit Reached/i)).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith("/dashboard/settings", expect.anything());
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

  it("surfaces multi-unit inventory from the first step for new-build and renovation projects", async () => {
    renderPage();

    expect(screen.getByText(/Multi-unit inventory/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add unit/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Renovation$/i }));
    expect(screen.getByText(/Multi-unit inventory/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add unit/i })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. Marina Heights"), { target: { value: "Renovation Heights" } });
    fireEvent.change(screen.getByPlaceholderText("1982"), { target: { value: "1982" } });
    fireEvent.change(screen.getByPlaceholderText("2026"), { target: { value: "2026" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Athens"), { target: { value: "Athens" } });
    fireEvent.click(screen.getByRole("button", { name: /Add unit/i }));

    expect(await screen.findByText(/Step 2 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Project Inventory/i })).toBeInTheDocument();
  });

  it("requires both construction and renovation years for renovation projects", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^Renovation$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    expect(await screen.findByText("Project name is required")).toBeInTheDocument();
    expect(screen.getByText("Construction year is required")).toBeInTheDocument();
    expect(screen.getByText("Renovation year is required")).toBeInTheDocument();
    expect(screen.getByText("City is required")).toBeInTheDocument();
    expect(screen.queryByText("Building permit number is required")).not.toBeInTheDocument();
  });

  it("applies structured address selections with city, municipality, and coordinates", async () => {
    renderPage();

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /select new-building-address/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);
    fillRequiredUnit();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 5 of 5/i);
    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [new File(["photo"], "cover.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("button", { name: /Cover/i });
    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      project: expect.objectContaining({
        address: "Kalimnou 27",
        city: "Agioi Anargyroi",
        municipality: "Agioi Anargyroi-Kamatero",
        latitude: "38.0301",
        longitude: "23.7192",
      }),
    })));
  });

  it("presents the wizard as one New Build project ad, not a project plus linked listings", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /Create New Build Ad/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Project/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inventory/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ad$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Create a regular listing/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage New Build Ads/i })).toHaveAttribute("href", "/projects");

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 2 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Project Inventory/i })).toBeInTheDocument();
    expect(screen.getByText(/Add the available units, prices, and specs/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add unit/i })).toBeInTheDocument();
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
    expect(await screen.findByText("Every unit needs size, price, bedrooms, and bathrooms")).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenLastCalledWith("Every unit needs size, price, bedrooms, and bathrooms");

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

  it("restores the in-progress new-build draft after a refresh", async () => {
    const { unmount } = renderPage();

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 2 of 5/i)).toBeInTheDocument();
    fillRequiredUnit();

    await waitFor(() => {
      const savedDraft = Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index);
        return key ? localStorage.getItem(key) : null;
      }).filter(Boolean).join("\n");
      expect(savedDraft).toContain("Marina Heights");
      expect(savedDraft).toContain("250000");
    });

    unmount();
    renderPage();

    expect(await screen.findByText(/Step 2 of 5/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("85")).toBeInTheDocument();
    expect(screen.getByDisplayValue("250000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Project/i }));
    expect(await screen.findByText(/Step 1 of 5/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Marina Heights")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12345/2024")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Athens")).toBeInTheDocument();
  });

  it("restores legacy single-unit drafts while filtering transient blob images", async () => {
    seedDraft({
      step: "unit",
      project: { name: "Legacy Heights", building_permit_number: "P-1", city: "Athens" },
      units: undefined,
      unit: { internal_sqm: "74", price: "240000", bedrooms: "2", bathrooms: "1" },
      images: [
        { id: "saved", url: "https://cdn.test/saved.jpg" },
        { id: "transient", url: "blob:temporary" },
        { id: 42, url: "https://cdn.test/invalid.jpg" },
      ],
      coverImageId: "saved",
    });

    renderPage();

    expect(await screen.findByText(/Step 2 of 5/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("74")).toBeInTheDocument();
    expect(screen.getByDisplayValue("240000")).toBeInTheDocument();
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem("maiprop:new-building-listing-draft:v1:u-1") ?? "{}");
      expect(persisted.images).toEqual([{ id: "saved", url: "https://cdn.test/saved.jpg" }]);
    });
  });

  it.each([
    "not-json",
    JSON.stringify({ version: 2, step: "unit" }),
    JSON.stringify({ version: 1, step: "unknown" }),
  ])("ignores corrupt or incompatible drafts: %s", async (rawDraft) => {
    localStorage.setItem("maiprop:new-building-listing-draft:v1:u-1", rawDraft);

    renderPage();

    expect(await screen.findByText(/Step 1 of 5/i)).toBeInTheDocument();
    expect(screen.queryByText(/Step 2 of 5/i)).not.toBeInTheDocument();
  });

  it("requires a restored photo to have an explicit valid cover before publish", async () => {
    seedDraft({
      step: "photos",
      project: { name: "Cover Heights", building_permit_number: "P-2", city: "Athens" },
      units: [{ internal_sqm: "80", price: "250000", bedrooms: "2", bathrooms: "1" }],
      images: [{ id: "saved", url: "https://cdn.test/saved.jpg" }],
      coverImageId: null,
    });

    renderPage();
    expect(await screen.findByText(/Step 5 of 5/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));

    expect(toastMock.error).toHaveBeenCalledWith("Set a cover photo");
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("adds and removes inventory units without allowing the last unit to be deleted", async () => {
    renderPage();
    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);

    fireEvent.click(screen.getByRole("button", { name: /Add unit/i }));
    expect(screen.getByRole("button", { name: /Unit 2/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));

    expect(screen.queryByRole("button", { name: /Unit 2/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
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

    await waitFor(() => expect(uploadListingImageMock).toHaveBeenCalledWith(file, "u-1", "uuid-1"));
    await screen.findByRole("button", { name: /Cover/i });

    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u-1",
      projectId: "uuid-1",
      organizationId: null,
      finalTitle: "Marina Heights A101",
      coverImageUrl: "https://cdn.test/cover.jpg",
      additionalImageUrls: [],
    })));
    expect(toastMock.success).toHaveBeenCalledWith("New Build ad published!");
    expect(navigateMock).toHaveBeenCalledWith("/new-build/listing-1");
  });

  it("accepts a studio unit with zero bedrooms", async () => {
    renderPage();

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 2 of 5/i)).toBeInTheDocument();

    fillRequiredUnit();
    fireEvent.change(screen.getByLabelText(/Bedrooms/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    expect(await screen.findByText(/Step 3 of 5/i)).toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalledWith(
      "Every unit needs size, price, bedrooms, and bathrooms",
    );
  });

  it("persists and submits the selected organization ownership scope", async () => {
    useManageableOrganizationsMock.mockReturnValue({
      data: [{ id: "org-1", name: "MaiProp Development" }],
    });
    seedDraft({
      step: "photos",
      projectId: "project-stable",
      organizationId: "org-1",
      project: { name: "Org Heights", building_permit_number: "P-9", city: "Athens" },
      units: [{ internal_sqm: "80", price: "250000", bedrooms: "2", bathrooms: "1" }],
      images: [{ id: "saved", url: "https://cdn.test/saved.jpg" }],
      coverImageId: "saved",
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-stable",
      organizationId: "org-1",
    })));
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

  it("keeps a failed photo visible for correction and uses the first successful upload as cover", async () => {
    Object.defineProperty(globalThis, "crypto", {
      writable: true,
      value: {
        ...(globalThis.crypto ?? {}),
        randomUUID: vi.fn().mockReturnValueOnce("bad-id").mockReturnValueOnce("good-id"),
      },
    });
    uploadListingImageMock
      .mockRejectedValueOnce("provider unavailable")
      .mockResolvedValueOnce({ id: "img-ok", url: "https://cdn.test/ok.jpg" });
    renderPage();

    fillRequiredProject();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 of 5/i);
    fillRequiredUnit();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 of 5/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 5 of 5/i);

    const failed = new File(["bad"], "bad.jpg", { type: "image/jpeg" });
    const good = new File(["good"], "good.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [failed, good] },
    });

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Cover/i })).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining("bad.jpg"));
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
    await waitFor(() => expect(uploadListingImageMock).toHaveBeenCalledWith(dropFile, "u-1", "uuid-1"));

    const clickFile = new File(["click"], "click.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector("#nb-photo-input") as HTMLInputElement, {
      target: { files: [clickFile] },
    });
    await waitFor(() => expect(uploadListingImageMock).toHaveBeenCalledWith(clickFile, "u-1", "uuid-1"));

    fireEvent.click(await screen.findByRole("button", { name: /Set as cover/i }));
    fireEvent.click(screen.getByRole("button", { name: /Publish New Build Ad/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      finalTitle: "B203 at Marina Park",
      additionalImageUrls: expect.arrayContaining(["https://cdn.test/drop.jpg"]),
    })));
  });
});
