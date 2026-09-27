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
  rpcMock,
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
  rpcMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/participantConfig", () => ({ getParticipantTypeFromProfile: () => participantTypeMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
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
        aria-label={`select-${id}`}
        onClick={() => onSuggestionSelect({
          value: "11 Metaxa, Glyfada",
          addressLine: "Metaxa 11",
          city: "Glyfada",
          municipality: "Glyfada",
          region: "Attica",
          latitude: "37.88",
          longitude: "23.75",
        })}
      >
        select location
      </button>
      {id === "project-edit-address" && (
        <button
          type="button"
          aria-label="select-project-edit-address-invalid"
          onClick={() => onSuggestionSelect({
            value: "Unresolved place",
            addressLine: "Unresolved place",
            city: "",
            municipality: "",
            region: "",
            latitude: "not-a-number",
            longitude: "",
          })}
        >
          select invalid location
        </button>
      )}
    </div>
  ),
}));
vi.mock("@/hooks/useProjects", () => ({
  useProject: (...args: unknown[]) => useProjectMock(...args),
  useUpdateProject: () => ({ mutate: updateProjectMock }),
  useUpdateProjectListingCover: () => ({ mutate: updateListingMock }),
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
  listings: [{
    id: "listing-linked",
    title: "Penthouse",
    price: 750000,
    sqm: 120,
    views_count: 8,
    listing_type: "new_build",
    cover_image_url: "https://cdn/current-cover.jpg",
  }],
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
    rpcMock,
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
  rpcMock.mockResolvedValue({ data: null, error: null });
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

  it.each(["video/mp4", "application/pdf", "image/gif"])("uploads bucket-supported %s at exactly 20 MiB", async (type) => {
    renderPage();
    const file = new File(["x"], "accepted.file", { type });
    Object.defineProperty(file, "size", { value: 20 * 1024 * 1024 });
    fireEvent.change(document.querySelectorAll('input[type="file"]')[type === "application/pdf" ? 3 : 0], { target: { files: [file] } });
    await waitFor(() => expect(uploadMock).toHaveBeenCalled());
    expect(rpcMock).toHaveBeenCalledWith("register_new_building_storage_upload", expect.any(Object));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it.each([
    ["video/mp4", 20 * 1024 * 1024 + 1, /20 MB/],
    ["image/heic", 10, /Unsupported/],
    ["video/quicktime", 10, /Unsupported/],
  ])("rejects project media %s (%i bytes) before registration", async (type, size, message) => {
    renderPage();
    const file = new File(["x"], "media.file", { type });
    Object.defineProperty(file, "size", { value: size });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(message)));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(addMediaMock).not.toHaveBeenCalled();
  });

  it("uploads and deletes project media", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /delete rendering/i }));
    expect(deleteMediaMock).toHaveBeenCalledWith({ id: "media-1", projectId: "project-1" });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "render.jpg", { type: "image/jpeg" })] } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalled());
    expect(rpcMock).toHaveBeenCalledWith(
      "register_new_building_storage_upload",
      expect.objectContaining({
        p_project_id: "project-1",
        p_bucket: "project-media",
        p_object_path: expect.stringMatching(/^user-1\/project-1\/media\/rendering-[^/]+\.jpg$/),
        p_object_url: "https://cdn/uploaded.jpg",
      }),
    );
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

  it("shows the public New Build ad without legacy attach or unlink controls", () => {
    renderPage();

    expect(screen.getByText("Public New Build ad")).toBeInTheDocument();
    expect(screen.getByText(/project details, units, pricing, phases, and media/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Penthouse/i })).toHaveAttribute("href", "/new-build/listing-linked");
    expect(screen.getByRole("link", { name: /View ad/i })).toHaveAttribute("href", "/new-build/listing-linked");
    expect(screen.queryByRole("button", { name: /unlink/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^\+ / })).not.toBeInTheDocument();
    expect(updateListingMock).not.toHaveBeenCalled();
  });

  it("replaces the public New Build ad cover image from the project editor", async () => {
    renderPage();

    const file = new File(["new cover"], "new-cover.webp", { type: "image/webp" });
    fireEvent.change(screen.getByLabelText(/replace public ad cover image/i), {
      target: { files: [file] },
    });

    await waitFor(() => expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/project-1\/create\/[^/]+\.webp$/),
      file,
      { upsert: false },
    ));
    expect(rpcMock).toHaveBeenCalledWith(
      "register_new_building_storage_upload",
      expect.objectContaining({
        p_project_id: "project-1",
        p_bucket: "listing-images",
        p_object_path: expect.stringMatching(/^user-1\/project-1\/create\/[^/]+\.webp$/),
        p_object_url: "https://cdn/uploaded.jpg",
      }),
    );
    expect(getPublicUrlMock).toHaveBeenCalledWith(expect.stringMatching(/^user-1\/project-1\/create\/[^/]+\.webp$/));
    expect(updateListingMock).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        listingId: "listing-linked",
        coverImageUrl: "https://cdn/uploaded.jpg",
      },
      expect.any(Object),
    );
  });

  it("hydrates nullable project fields, exposes honest empty states, and collapses sections", () => {
    useProjectMock.mockReturnValue({
      data: {
        id: "project-1",
        name: null,
        description: null,
        building_permit_number: null,
        developer_company: null,
        architect_group: null,
        construction_company: null,
        address: null,
        city: null,
        municipality: null,
        latitude: null,
        longitude: null,
        area_description: null,
        permit_approval_date: null,
        construction_start_date: null,
        structural_completion_date: null,
        delivery_date: null,
        status: null,
      },
      isLoading: false,
    });
    useProjectUnitsMock.mockReturnValue({ data: [] });
    useProjectMediaMock.mockReturnValue({ data: [] });
    useProjectLeadsMock.mockReturnValue({ data: [] });
    useProjectViewsMock.mockReturnValue({ data: undefined });

    renderPage();

    expect(screen.getByRole("heading", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByText("No leads yet.")).toBeInTheDocument();
    expect(screen.getByText("No public ad has been published for this project yet.")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(4);

    fireEvent.click(screen.getByRole("button", { name: /Dashboard/i }));
    expect(screen.queryByText("Sales tracking and project analytics.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/i }));
    expect(screen.getByText("Sales tracking and project analytics.")).toBeInTheDocument();
  });

  it("applies a precise address selection and retains coordinates for an unresolved selection", async () => {
    updateProjectMock.mockImplementation((_payload, options) => options.onSettled());
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "select-project-edit-address" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          address: "Metaxa 11",
          city: "Glyfada",
          municipality: "Glyfada",
          latitude: 37.88,
          longitude: 23.75,
        }),
      }),
      expect.any(Object),
    ));

    fireEvent.click(screen.getByRole("button", { name: "select-project-edit-address-invalid" }));
    await waitFor(() => expect(screen.getByDisplayValue("Unresolved place")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(updateProjectMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          address: "Unresolved place",
          latitude: 37.88,
          longitude: 23.75,
        }),
      }),
      expect.any(Object),
    ));
  });

  it("handles PDF media uploads and surfaces storage failures", async () => {
    renderPage();
    const pdfInput = document.querySelector('input[accept=".pdf"]') as HTMLInputElement;
    fireEvent.change(pdfInput, {
      target: { files: [new File(["pdf"], "brochure.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => expect(addMediaMock).toHaveBeenCalledWith({
      project_id: "project-1",
      media_type: "brochure_pdf",
      url: "https://cdn/uploaded.jpg",
    }));
    expect(rpcMock).toHaveBeenCalledWith(
      "register_new_building_storage_upload",
      expect.objectContaining({
        p_project_id: "project-1",
        p_bucket: "project-media",
        p_object_path: expect.stringMatching(/^user-1\/project-1\/media\/brochure_pdf-[^/]+\.pdf$/),
      }),
    );

    uploadMock.mockResolvedValueOnce({ error: new Error("storage unavailable") });
    const imageInput = document.querySelector('input[accept="image/*,video/*"]') as HTMLInputElement;
    fireEvent.change(imageInput, {
      target: { files: [new File(["image"], "render.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("storage unavailable"));
  });

  it("reports the number of units changed after a successful bulk price update", async () => {
    bulkUpdateMock.mockImplementation((_payload, options) => options.onSuccess({ updatedCount: 1 }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /bulk price update/i }));
    fireEvent.change(screen.getByPlaceholderText(/5 for \+5/i), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: /apply to available/i }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^apply$/i }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Updated 1 unit(s)"));
  });
});
