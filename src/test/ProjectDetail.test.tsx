import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const {
  useAuthMock,
  participantTypeMock,
  useProjectMock,
  useProjectUnitsMock,
  useProjectMediaMock,
  useProjectLeadsMock,
  useProjectViewsMock,
  useMyListingsMock,
  updateProjectMock,
  createUnitMock,
  updateUnitMock,
  bulkUpdateMock,
  deleteUnitMock,
  addMediaMock,
  deleteMediaMock,
  createLeadMock,
  updateLeadMock,
  deleteLeadMock,
  updateListingMock,
  uploadMock,
  getPublicUrlMock,
  toastMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  participantTypeMock: vi.fn(),
  useProjectMock: vi.fn(),
  useProjectUnitsMock: vi.fn(),
  useProjectMediaMock: vi.fn(),
  useProjectLeadsMock: vi.fn(),
  useProjectViewsMock: vi.fn(),
  useMyListingsMock: vi.fn(),
  updateProjectMock: vi.fn(),
  createUnitMock: vi.fn(),
  updateUnitMock: vi.fn(),
  bulkUpdateMock: vi.fn(),
  deleteUnitMock: vi.fn(),
  addMediaMock: vi.fn(),
  deleteMediaMock: vi.fn(),
  createLeadMock: vi.fn(),
  updateLeadMock: vi.fn(),
  deleteLeadMock: vi.fn(),
  updateListingMock: vi.fn(),
  uploadMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/participantConfig", () => ({ getParticipantTypeFromProfile: () => participantTypeMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useProjects", () => ({
  useProject: (...args: unknown[]) => useProjectMock(...args),
  useUpdateProject: () => ({ mutate: updateProjectMock }),
}));
vi.mock("@/hooks/useProjectUnits", () => ({
  useProjectUnits: (...args: unknown[]) => useProjectUnitsMock(...args),
  useCreateProjectUnit: () => ({ mutate: createUnitMock }),
  useUpdateProjectUnit: () => ({ mutate: updateUnitMock }),
  useBulkUpdateProjectUnitPrices: () => ({ mutate: bulkUpdateMock }),
  useDeleteProjectUnit: () => ({ mutate: deleteUnitMock }),
}));
vi.mock("@/hooks/useProjectMedia", () => ({
  useProjectMedia: (...args: unknown[]) => useProjectMediaMock(...args),
  useAddProjectMedia: () => ({ mutate: addMediaMock }),
  useDeleteProjectMedia: () => ({ mutate: deleteMediaMock }),
}));
vi.mock("@/hooks/useProjectLeads", () => ({
  useProjectLeads: (...args: unknown[]) => useProjectLeadsMock(...args),
  useCreateProjectLead: () => ({ mutate: createLeadMock }),
  useUpdateProjectLead: () => ({ mutate: updateLeadMock }),
  useDeleteProjectLead: () => ({ mutate: deleteLeadMock }),
}));
vi.mock("@/hooks/useProjectViews", () => ({ useProjectViews: (...args: unknown[]) => useProjectViewsMock(...args) }));
vi.mock("@/hooks/useListings", () => ({
  useMyListings: () => useMyListingsMock(),
  useUpdateListing: () => ({ mutate: updateListingMock }),
}));

import ProjectDetail from "@/pages/ProjectDetail";

const project = {
  id: "project-1",
  name: "Marina Heights",
  description: "Premium seaside homes",
  building_permit_number: "BP-1",
  developer_company: "Mai Dev",
  architect_group: "Studio A",
  construction_company: "Build Co",
  address: "Akti 1",
  city: "Piraeus",
  municipality: "Piraeus",
  latitude: 37.94,
  longitude: 23.64,
  area_description: "Harbour",
  permit_approval_date: "2026-01-01",
  construction_start_date: "2026-02-01",
  structural_completion_date: "2026-09-01",
  delivery_date: "2027-01-01",
  status: "active",
  listings: [{ id: "listing-linked", title: "Penthouse", price: 750000, sqm: 120, views_count: 8 }],
};

const renderPage = (initialEntry = "/projects/project-1") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  [
    useAuthMock,
    participantTypeMock,
    useProjectMock,
    useProjectUnitsMock,
    useProjectMediaMock,
    useProjectLeadsMock,
    useProjectViewsMock,
    useMyListingsMock,
    updateProjectMock,
    createUnitMock,
    updateUnitMock,
    bulkUpdateMock,
    deleteUnitMock,
    addMediaMock,
    deleteMediaMock,
    createLeadMock,
    updateLeadMock,
    deleteLeadMock,
    updateListingMock,
    uploadMock,
    getPublicUrlMock,
    toastMock.error,
    toastMock.success,
  ].forEach((mock) => mock.mockReset());

  useAuthMock.mockReturnValue({ user: { id: "user-1" }, profile: { participant_type: "developer" } });
  participantTypeMock.mockReturnValue("developer");
  useProjectMock.mockReturnValue({ data: project, isLoading: false });
  useProjectUnitsMock.mockReturnValue({
    data: [
      { id: "unit-1", project_id: "project-1", unit_id: "A101", availability_status: "available", price: 250000, internal_sqm: 80, floor: 1, unit_number: "101", sea_view: false, city_view: false, mountain_view: false, vat_included: true },
      { id: "unit-2", project_id: "project-1", unit_id: "A102", availability_status: "reserved", price: 260000, internal_sqm: 82, floor: 1, unit_number: "102", sea_view: false, city_view: false, mountain_view: false, vat_included: true },
      { id: "unit-3", project_id: "project-1", unit_id: "A103", availability_status: "sold", price: 270000, internal_sqm: 84, floor: 1, unit_number: "103", sea_view: false, city_view: false, mountain_view: false, vat_included: true },
    ],
  });
  useProjectMediaMock.mockReturnValue({
    data: [{ id: "media-1", project_id: "project-1", media_type: "rendering", url: "https://cdn/render.jpg" }],
  });
  useProjectLeadsMock.mockReturnValue({
    data: [{ id: "lead-1", project_id: "project-1", name: "Alex Buyer", email: "alex@example.com", unit_id: "A101", status: "new" }],
  });
  useProjectViewsMock.mockReturnValue({ data: { count: 5 } });
  useMyListingsMock.mockReturnValue({ data: [{ id: "listing-free", title: "Loose unit", listing_type: "new_build" }] });
  getPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://cdn/uploaded.jpg" } });
  uploadMock.mockResolvedValue({ error: null });
});

describe("ProjectDetail", () => {
  it("requires sign-in before project management", () => {
    useAuthMock.mockReturnValue({ user: null, profile: null });

    renderPage();

    expect(screen.getByText("Sign in to manage projects")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("shows the loading state when the project has not resolved", () => {
    useProjectMock.mockReturnValue({ data: null, isLoading: true });

    const { container } = renderPage();

    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders dashboard counts and saves edited project fields", async () => {
    renderPage();

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Reserved")).toBeInTheDocument();
    expect(screen.getByText("Sold")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("Marina Heights"), { target: { value: "Marina Bay" } });
    fireEvent.change(screen.getByDisplayValue("BP-1"), { target: { value: "BP-2" } });
    fireEvent.change(screen.getByDisplayValue("Mai Dev"), { target: { value: "Mai Urban Dev" } });
    fireEvent.change(screen.getByDisplayValue("Studio A"), { target: { value: "Studio B" } });
    fireEvent.change(screen.getByDisplayValue("Build Co"), { target: { value: "Build Partners" } });
    fireEvent.change(screen.getByDisplayValue("Premium seaside homes"), { target: { value: "Premium city homes" } });
    fireEvent.change(screen.getByDisplayValue("Akti 1"), { target: { value: "Akti 2" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Athens"), { target: { value: "Athens" } });
    fireEvent.change(screen.getByPlaceholderText("Municipality"), { target: { value: "Athens" } });
    fireEvent.change(screen.getByDisplayValue("Harbour"), { target: { value: "Metro-side neighbourhood" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 37.9838"), { target: { value: "37.98" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 23.7275"), { target: { value: "23.73" } });
    const dateInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    ["2026-03-01", "2026-04-01", "2026-10-01", "2027-02-01"].forEach((value, index) => {
      fireEvent.change(dateInputs[index], { target: { value } });
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(updateProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "project-1",
          updates: expect.objectContaining({
            name: "Marina Bay",
            building_permit_number: "BP-2",
            developer_company: "Mai Urban Dev",
            architect_group: "Studio B",
            construction_company: "Build Partners",
            description: "Premium city homes",
            address: "Akti 2",
            city: "Athens",
            municipality: "Athens",
            area_description: "Metro-side neighbourhood",
            latitude: 37.98,
            longitude: 23.73,
            permit_approval_date: "2026-03-01",
            construction_start_date: "2026-04-01",
            structural_completion_date: "2026-10-01",
            delivery_date: "2027-02-01",
          }),
        }),
        expect.any(Object),
      ),
    );
  });

  it("clears stored coordinates when the address is manually changed", async () => {
    renderPage();

    fireEvent.change(screen.getByDisplayValue("Akti 1"), { target: { value: "Metaxa 11" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(updateProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "project-1",
          updates: expect.objectContaining({
            address: "Metaxa 11",
            latitude: null,
            longitude: null,
          }),
        }),
        expect.any(Object),
      ),
    );
  });

  it("uploads and deletes project media", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /delete rendering/i }));
    expect(deleteMediaMock).toHaveBeenCalledWith({ id: "media-1", projectId: "project-1" });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "render.jpg", { type: "image/jpeg" })] } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalled());
    expect(addMediaMock).toHaveBeenCalledWith({
      project_id: "project-1",
      media_type: "rendering",
      url: "https://cdn/uploaded.jpg",
    });
  });

  it("creates, edits, bulk-updates, and deletes units", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /add unit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole("button", { name: /add unit/i }));
    fireEvent.change(screen.getByPlaceholderText("A101"), { target: { value: "B201" } });
    fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: "2" } });
    fireEvent.change(screen.getByPlaceholderText("101"), { target: { value: "201" } });
    const [statusSelect, kitchenSelect, energySelect] = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
    fireEvent.change(statusSelect, { target: { value: "reserved" } });
    fireEvent.change(screen.getByPlaceholderText("85"), { target: { value: "100" } });
    fireEvent.change(screen.getByPlaceholderText("12"), { target: { value: "16" } });
    fireEvent.change(screen.getByPlaceholderText("250000"), { target: { value: "500000" } });
    screen.getAllByPlaceholderText("2").forEach((input, index) => {
      fireEvent.change(input, { target: { value: String(index + 2) } });
    });
    fireEvent.change(kitchenSelect, { target: { value: "open" } });
    fireEvent.change(energySelect, { target: { value: "A+" } });
    screen.getAllByRole("checkbox").forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(createUnitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project-1",
        unit_id: "B201",
        floor: 2,
        unit_number: "201",
        availability_status: "reserved",
        internal_sqm: 100,
        balcony_sqm: 16,
        price: 500000,
        price_per_sqm: 5000,
        bedrooms: 2,
        bathrooms: 3,
        kitchen_type: "open",
        energy_class: "A+",
        sea_view: true,
        city_view: true,
        mountain_view: true,
      }),
      expect.any(Object),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /edit unit/i })[0]);
    fireEvent.change(screen.getByDisplayValue("A101"), { target: { value: "A101R" } });
    fireEvent.change(screen.getByDisplayValue("80"), { target: { value: "88" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^save$/i }).at(-1)!);
    expect(updateUnitMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "unit-1", projectId: "project-1", updates: expect.objectContaining({ unit_id: "A101R", internal_sqm: 88 }) }),
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole("button", { name: /bulk price update/i }));
    fireEvent.change(screen.getByPlaceholderText(/5 for \+5/i), { target: { value: "7.5" } });
    fireEvent.click(screen.getByRole("button", { name: /apply to available/i }));
    await waitFor(() => expect(screen.getByText("Apply bulk price change")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply to available/i }));
    await waitFor(() => expect(screen.getByText("Apply bulk price change")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));

    expect(bulkUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        percentage: 7.5,
        units: [expect.objectContaining({ id: "unit-1" })],
      }),
      expect.any(Object),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /delete unit/i })[0]);
    const cancelUnitDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(cancelUnitDialog).getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /delete unit/i })[0]);
    const confirmUnitDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmUnitDialog).getByRole("button", { name: /^remove$/i }));
    expect(deleteUnitMock).toHaveBeenCalledWith({ id: "unit-2", projectId: "project-1" });
  }, 15000);

  it("shows a bulk price error when no available priced units exist", () => {
    useProjectUnitsMock.mockReturnValue({
      data: [{ id: "unit-empty", project_id: "project-1", availability_status: "reserved", price: 100000 }],
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /bulk price update/i }));
    fireEvent.change(screen.getByPlaceholderText(/5 for \+5/i), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /apply to available/i }));

    expect(toastMock.error).toHaveBeenCalledWith("No available units with price to update");
  });

  it("creates, updates, and deletes leads", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /add lead/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole("button", { name: /add lead/i }));
    fireEvent.change(screen.getByPlaceholderText("Name *"), { target: { value: "  Maria Lead  " } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Phone"), { target: { value: "+306900000000" } });
    fireEvent.change(screen.getByPlaceholderText("Source"), { target: { value: "Portal" } });
    fireEvent.change(screen.getByPlaceholderText("Unit of interest"), { target: { value: "A102" } });
    fireEvent.change(screen.getByPlaceholderText("Notes"), { target: { value: "Needs a second viewing" } });
    fireEvent.click(screen.getByRole("button", { name: /^add lead$/i }));
    expect(createLeadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project-1",
        name: "Maria Lead",
        email: "maria@example.com",
        phone: "+306900000000",
        source: "Portal",
        unit_id: "A102",
        notes: "Needs a second viewing",
      }),
      expect.any(Object),
    );

    fireEvent.change(screen.getAllByRole("combobox").at(-1)!, { target: { value: "qualified" } });
    expect(updateLeadMock).toHaveBeenCalledWith({
      id: "lead-1",
      projectId: "project-1",
      updates: { status: "qualified" },
    });

    fireEvent.click(screen.getByRole("button", { name: /delete lead Alex Buyer/i }));
    const cancelDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(cancelDialog).getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /delete lead Alex Buyer/i }));
    const confirmDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: /^remove$/i }));
    expect(deleteLeadMock).toHaveBeenCalledWith({ id: "lead-1", projectId: "project-1" });
  });

  it("links and unlinks listings, including the developer new-building empty branch", () => {
    useMyListingsMock.mockReturnValue({
      data: [
        { id: "listing-free", title: "Loose unit", listing_type: "new_build" },
        { id: "listing-sale", title: "Ordinary resale", listing_type: "sale" },
      ],
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /\+ Loose unit/i }));
    fireEvent.click(screen.getByRole("button", { name: /unlink/i }));

    expect(updateListingMock).toHaveBeenCalledWith({
      id: "listing-free",
      updates: {
        project_id: "project-1",
        listing_type: "new_build",
        is_pre_sale: false,
        construction_status: "shell_complete",
        year_built: 2027,
      },
    });
    expect(screen.queryByRole("button", { name: /\+ Ordinary resale/i })).not.toBeInTheDocument();
    expect(updateListingMock).toHaveBeenCalledWith({
      id: "listing-linked",
      updates: {
        project_id: null,
        listing_type: "sale",
        is_pre_sale: false,
      },
    });

    useMyListingsMock.mockReturnValue({ data: [{ id: "listing-linked", listing_type: "new_build" }] });
    renderPage();

    expect(screen.getByRole("link", { name: /new building/i })).toHaveAttribute("href", "/listings/new-building");
  });
});
