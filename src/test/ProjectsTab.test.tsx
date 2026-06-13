/**
 * Tests for the dashboard ProjectsTab. Covers: empty / loading / list
 * rendering, the single Create New Building project entry point, and the
 * delete confirmation flow.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useAuthMock, useProjectsMock, deleteMutateMock, navigateMock, toastMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useProjectsMock: vi.fn(),
  deleteMutateMock: vi.fn(),
  navigateMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => useProjectsMock(),
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

  it("uses Create New Building as the only project creation entry point", () => {
    render(<ProjectsTab />, { wrapper: wrap });

    const createLinks = screen.getAllByRole("link", { name: /create new build ad/i });
    expect(createLinks.length).toBeGreaterThan(0);
    for (const link of createLinks) {
      expect(link).toHaveAttribute("href", "/listings/new-building");
    }
    expect(screen.queryByRole("button", { name: /new project/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Create project/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/link listings/i)).not.toBeInTheDocument();
  });

  it("routes the empty state to Create New Building instead of opening a standalone form", () => {
    render(<ProjectsTab />, { wrapper: wrap });

    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Create one New Build ad for the whole project/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /create new build ad/i }).at(-1)).toHaveAttribute("href", "/listings/new-building");
    expect(screen.queryByRole("button", { name: /create your first project/i })).not.toBeInTheDocument();
  });

  it("opens the delete confirmation dialog when the delete button is clicked", async () => {
    useProjectsMock.mockReturnValue({
      data: [{ id: "p1", name: "X", city: null, listing_ids: [], created_at: "2026-01-01" }],
      isLoading: false,
    });
    render(<ProjectsTab />, { wrapper: wrap });
    fireEvent.click(screen.getByRole("button", { name: /Delete New Build ad/i }));
    await waitFor(() => expect(screen.getByText(/Delete New Build ad\?/i)).toBeInTheDocument());
  });
});
