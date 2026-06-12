import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const {
  navigateMock,
  useAuthMock,
  useProjectsMock,
  useMyListingsMock,
  createProjectMock,
  updateProjectMock,
  deleteProjectMock,
  updateListingMock,
  toastMock,
  participantTypeMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useAuthMock: vi.fn(),
  useProjectsMock: vi.fn(),
  useMyListingsMock: vi.fn(),
  createProjectMock: vi.fn(),
  updateProjectMock: vi.fn(),
  deleteProjectMock: vi.fn(),
  updateListingMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn() },
  participantTypeMock: vi.fn(),
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/gates/ProGate", () => ({ ProGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/location/LocationAutocompleteInput", () => ({
  LocationAutocompleteInput: ({
    mode,
    value,
    onChange,
    onSuggestionSelect,
    placeholder,
    inputClassName,
  }: {
    mode?: "city" | "address";
    value: string;
    onChange: (value: string) => void;
    onSuggestionSelect?: (selection: {
      value: string;
      addressLine?: string;
      city?: string;
      latitude?: string;
      longitude?: string;
    }) => void;
    placeholder?: string;
    inputClassName?: string;
  }) => (
    <div>
      <input
        value={value}
        placeholder={placeholder}
        className={inputClassName}
        onChange={(event) => onChange(event.target.value)}
      />
      {onSuggestionSelect && (
        <button
          type="button"
          onClick={() =>
            onSuggestionSelect({
              value: "Selected Address",
              addressLine: "Selected Address",
              city: "Athens",
              latitude: "37.9",
              longitude: "23.7",
            })
          }
        >
          Select {mode} suggestion
        </button>
      )}
    </div>
  ),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/participantConfig", () => ({ getParticipantTypeFromProfile: () => participantTypeMock() }));
vi.mock("@/hooks/useProjects", () => ({
  useProjects: (...args: unknown[]) => useProjectsMock(...args),
  useCreateProject: () => ({ mutate: createProjectMock, isPending: false }),
  useUpdateProject: () => ({ mutate: updateProjectMock }),
  useDeleteProject: () => ({ mutate: deleteProjectMock }),
}));
vi.mock("@/hooks/useListings", () => ({
  useMyListings: () => useMyListingsMock(),
  useUpdateListing: () => ({ mutate: updateListingMock }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("sonner", () => ({ toast: toastMock }));

import Projects from "@/pages/Projects";

const renderPage = () =>
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Projects />
    </MemoryRouter>,
  );

beforeEach(() => {
  navigateMock.mockReset();
  useAuthMock.mockReset();
  useProjectsMock.mockReset();
  useMyListingsMock.mockReset();
  createProjectMock.mockReset();
  updateProjectMock.mockReset();
  deleteProjectMock.mockReset();
  updateListingMock.mockReset();
  toastMock.error.mockReset();
  toastMock.success.mockReset();
  participantTypeMock.mockReset();

  useAuthMock.mockReturnValue({ user: { id: "owner-1" }, profile: { participant_type: "developer" } });
  participantTypeMock.mockReturnValue("developer");
  useProjectsMock.mockReturnValue({ data: [], isLoading: false });
  useMyListingsMock.mockReturnValue({ data: [] });
});

describe("Projects page", () => {
  it("prompts signed-out visitors to sign in", () => {
    useAuthMock.mockReturnValue({ user: null, profile: null });

    renderPage();

    expect(screen.getByText("Sign in to manage projects")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("shows developer-only new building entry point", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /new building listing/i })).toHaveAttribute("href", "/listings/new-building");
  });

  it("hides the new building entry point for non-developers", () => {
    participantTypeMock.mockReturnValue("agent");

    renderPage();

    expect(screen.queryByRole("link", { name: /new building listing/i })).not.toBeInTheDocument();
  });

  it("shows a loading spinner while projects load", () => {
    useProjectsMock.mockReturnValue({ data: [], isLoading: true });

    const { container } = renderPage();

    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("guards project creation when the name is blank", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(toastMock.error).toHaveBeenCalledWith("Project name is required");
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it("creates a project with trimmed optional fields and navigates on success", () => {
    createProjectMock.mockImplementation((_payload, opts) => opts.onSuccess?.({ id: "project-new" }));

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText(/Marina Heights/i), { target: { value: "  Coastline  " } });
    fireEvent.change(screen.getByPlaceholderText(/Brief description/i), { target: { value: "  Sea view  " } });
    fireEvent.change(screen.getByPlaceholderText(/Athens/i), { target: { value: "  Piraeus  " } });
    fireEvent.change(screen.getByPlaceholderText(/Street, number/i), { target: { value: "  Akti 1  " } });
    fireEvent.change(screen.getByPlaceholderText(/12345\/2024/i), { target: { value: "  BP-1  " } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createProjectMock).toHaveBeenCalledWith(
      {
        name: "Coastline",
        description: "Sea view",
        city: "Piraeus",
        address: "Akti 1",
        building_permit_number: "BP-1",
      },
      expect.any(Object),
    );
    expect(navigateMock).toHaveBeenCalledWith("/projects/project-new");
  });

  it("clears selected project coordinates when the address is manually edited before create", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText(/Marina Heights/i), { target: { value: "Coastline" } });
    fireEvent.click(screen.getByRole("button", { name: /select address suggestion/i }));
    fireEvent.change(screen.getByPlaceholderText(/Street, number/i), { target: { value: "Manual override" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createProjectMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        latitude: expect.any(Number),
        longitude: expect.any(Number),
      }),
      expect.any(Object),
    );
  });

  it("quick-edits, links, unlinks, and deletes an existing project", async () => {
    useProjectsMock.mockReturnValue({
      data: [
        {
          id: "project-1",
          name: "Marina Heights",
          description: "Old description",
          city: "Athens",
          status: "active",
          building_permit_number: "PERMIT-1",
          listings: [{ id: "linked-1", title: "Linked unit", price: 350000 }],
        },
      ],
      isLoading: false,
    });
    useMyListingsMock.mockReturnValue({
      data: [
        { id: "linked-1", project_id: "project-1", title: "Linked unit", listing_type: "new_build" },
        { id: "loose-1", project_id: null, title: "Loose listing with a long display name", listing_type: "new_build" },
        { id: "sale-1", project_id: null, title: "Ordinary sale listing", listing_type: "sale" },
      ],
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /quick edit/i }));
    fireEvent.blur(screen.getByLabelText("Project name"), { target: { value: "Marina Bay" } });
    fireEvent.blur(screen.getByLabelText("Project description"), { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ Loose listing with a long/i }));
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    fireEvent.click(screen.getByRole("button", { name: /delete project/i }));

    await waitFor(() => expect(screen.getByText("Delete project")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(updateProjectMock).toHaveBeenCalledWith({ id: "project-1", updates: { name: "Marina Bay" } }, expect.any(Object));
    expect(updateProjectMock).toHaveBeenCalledWith({ id: "project-1", updates: { description: "Updated" } }, expect.any(Object));
    expect(updateListingMock).toHaveBeenCalledWith({
      id: "loose-1",
      updates: {
        project_id: "project-1",
        listing_type: "new_build",
        is_pre_sale: false,
        construction_status: "planning",
      },
    });
    expect(screen.queryByRole("button", { name: /\+ Ordinary sale listing/i })).not.toBeInTheDocument();
    expect(updateListingMock).toHaveBeenCalledWith({
      id: "linked-1",
      updates: {
        project_id: null,
        listing_type: "sale",
        is_pre_sale: false,
      },
    });
    expect(deleteProjectMock).toHaveBeenCalledWith("project-1");
  });
});
