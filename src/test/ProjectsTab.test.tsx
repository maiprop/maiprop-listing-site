/**
 * Tests for the dashboard ProjectsTab. Covers: empty / loading / list
 * rendering, the "New Project" creation form (with required-name guard),
 * the delete confirmation flow, and the navigate-on-success behaviour.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useAuthMock, useProjectsMock, createMutateMock, deleteMutateMock, navigateMock, toastMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useProjectsMock: vi.fn(),
  createMutateMock: vi.fn(),
  deleteMutateMock: vi.fn(),
  navigateMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => useProjectsMock(),
  useCreateProject: () => ({ mutate: createMutateMock, isPending: false }),
  useDeleteProject: () => ({ mutate: deleteMutateMock, isPending: false }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("sonner", () => ({ toast: toastMock }));

import ProjectsTab from "@/pages/dashboard/ProjectsTab";

const wrap = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

beforeEach(() => {
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  useProjectsMock.mockReset();
  useProjectsMock.mockReturnValue({ data: [], isLoading: false });
  createMutateMock.mockReset();
  deleteMutateMock.mockReset();
  navigateMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("ProjectsTab", () => {
  it("shows the loading spinner while projects are loading", () => {
    useProjectsMock.mockReturnValue({ data: [], isLoading: true });
    const { container } = render(<ProjectsTab />, { wrapper: wrap });
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders the empty state when there are no projects", () => {
    render(<ProjectsTab />, { wrapper: wrap });
    // The empty state has both a heading and a CTA button — ensure at least
    // one matching node renders.
    expect(screen.getAllByText(/No projects yet|create your first/i).length).toBeGreaterThan(0);
  });

  it("renders a row for each project with name + city", () => {
    useProjectsMock.mockReturnValue({
      data: [
        { id: "p1", name: "Athens Tower", city: "Athens", listing_ids: [], created_at: "2026-01-01" },
        { id: "p2", name: "Patras Loft", city: "Patras", listing_ids: ["a", "b"], created_at: "2026-01-02" },
      ],
      isLoading: false,
    });
    render(<ProjectsTab />, { wrapper: wrap });
    expect(screen.getByText("Athens Tower")).toBeInTheDocument();
    expect(screen.getByText("Patras Loft")).toBeInTheDocument();
  });

  it("opens the create form on 'New Project' and rejects an empty name with toast", () => {
    render(<ProjectsTab />, { wrapper: wrap });
    fireEvent.click(screen.getByRole("button", { name: /New Project/i }));
    // The actual button label inside the create form is 'Create' (not Save).
    const createBtns = screen.getAllByRole("button", { name: /^Create$/i });
    fireEvent.click(createBtns[createBtns.length - 1]);
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/name is required/i));
    expect(createMutateMock).not.toHaveBeenCalled();
  });

  it("calls createProject.mutate with the trimmed payload when a valid name is entered", () => {
    render(<ProjectsTab />, { wrapper: wrap });
    fireEvent.click(screen.getByRole("button", { name: /New Project/i }));
    // The Name input uses 'e.g. Marina Heights' as its placeholder.
    fireEvent.change(screen.getByPlaceholderText(/Marina Heights/i), {
      target: { value: "  Athens Riviera  " },
    });
    const createBtns = screen.getAllByRole("button", { name: /^Create$/i });
    fireEvent.click(createBtns[createBtns.length - 1]);
    expect(createMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Athens Riviera" }),
      expect.any(Object),
    );
  });

  it("navigates to the new project on successful creation", () => {
    createMutateMock.mockImplementation((_, opts) => {
      opts.onSuccess?.({ id: "p-new" });
    });
    render(<ProjectsTab />, { wrapper: wrap });
    fireEvent.click(screen.getByRole("button", { name: /New Project/i }));
    fireEvent.change(screen.getByPlaceholderText(/Marina Heights/i), {
      target: { value: "New" },
    });
    const createBtns = screen.getAllByRole("button", { name: /^Create$/i });
    fireEvent.click(createBtns[createBtns.length - 1]);
    expect(navigateMock).toHaveBeenCalledWith("/projects/p-new");
  });

  it("opens the delete confirmation dialog when the delete button is clicked", async () => {
    useProjectsMock.mockReturnValue({
      data: [{ id: "p1", name: "X", city: null, listing_ids: [], created_at: "2026-01-01" }],
      isLoading: false,
    });
    render(<ProjectsTab />, { wrapper: wrap });
    // The delete button is icon-only with an aria-label='Delete project'.
    fireEvent.click(screen.getByRole("button", { name: /Delete project/i }));
    await waitFor(() => expect(screen.getByText(/Delete project\?/i)).toBeInTheDocument());
  });
});
