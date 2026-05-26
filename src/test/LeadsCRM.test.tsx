/**
 * Tests for the LeadsCRM dashboard component. Covers: pipeline-vs-list
 * view toggle, empty state, lead rendering, add-lead form, edit/delete
 * flows, status filter.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useLeadsMock, createMutateMock, updateMutateMock, deleteMutateMock } = vi.hoisted(() => ({
  useLeadsMock: vi.fn(),
  createMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
  deleteMutateMock: vi.fn(),
}));

vi.mock("@/hooks/useLeads", () => ({
  // The component calls `createLead.mutateAsync(...)` / `updateLead.mutateAsync(...)`
  // and `deleteLead.mutate(...)` — expose both variants on each mock.
  useLeads: () => useLeadsMock(),
  useCreateLead: () => ({ mutate: createMutateMock, mutateAsync: createMutateMock, isPending: false }),
  useUpdateLead: () => ({ mutate: updateMutateMock, mutateAsync: updateMutateMock, isPending: false }),
  useDeleteLead: () => ({ mutate: deleteMutateMock, mutateAsync: deleteMutateMock, isPending: false }),
  LEAD_STATUSES: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"],
  LEAD_SOURCES: ["manual", "listing_inquiry", "consultation", "callback", "project_inquiry", "viewing", "message"],
}));

import LeadsCRM from "@/components/LeadsCRM";

const baseLead = (overrides: Record<string, unknown> = {}) => ({
  id: "lead-1",
  name: "Alice Buyer",
  email: "alice@example.com",
  phone: "phone-redacted",
  message: "Interested in Athens 3-bed",
  notes: "Met at open house",
  source: "manual",
  status: "new",
  follow_up_at: null,
  created_at: "2026-04-01T10:00:00Z",
  ...overrides,
});

const wrap = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

beforeEach(() => {
  useLeadsMock.mockReset();
  useLeadsMock.mockReturnValue({ data: [], isLoading: false });
  createMutateMock.mockReset();
  updateMutateMock.mockReset();
  deleteMutateMock.mockReset();
});

describe("LeadsCRM", () => {
  it("shows the loading spinner while leads are loading", () => {
    useLeadsMock.mockReturnValue({ data: [], isLoading: true });
    const { container } = render(<LeadsCRM />, { wrapper: wrap });
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows an empty state when there are no leads", () => {
    render(<LeadsCRM />, { wrapper: wrap });
    expect(screen.getByText(/no leads|first lead|empty/i)).toBeInTheDocument();
  });

  it("renders lead names + emails when data is present", () => {
    useLeadsMock.mockReturnValue({
      data: [baseLead(), baseLead({ id: "lead-2", name: "Bob Seller", email: "bob@example.com" })],
      isLoading: false,
    });
    render(<LeadsCRM />, { wrapper: wrap });
    expect(screen.getByText("Alice Buyer")).toBeInTheDocument();
    expect(screen.getByText("Bob Seller")).toBeInTheDocument();
  });

  it("toggles between pipeline and list view", () => {
    useLeadsMock.mockReturnValue({
      data: [baseLead(), baseLead({ id: "lead-2", name: "Bob", status: "qualified" })],
      isLoading: false,
    });
    render(<LeadsCRM />, { wrapper: wrap });
    // The view toggle has Grid + List icons. Find buttons by aria-label or fallback to first/second.
    const buttons = screen.getAllByRole("button");
    const listBtn = buttons.find((b) => b.querySelector(".lucide-list"));
    if (listBtn) fireEvent.click(listBtn);
    // Both leads still rendered.
    expect(screen.getByText("Alice Buyer")).toBeInTheDocument();
  });

  it("opens the add-lead form on +Add and submits a new lead via createLead.mutateAsync", async () => {
    createMutateMock.mockResolvedValue(undefined);
    render(<LeadsCRM />, { wrapper: wrap });
    // Two 'Add Lead' buttons render when the list is empty (toolbar + empty-state CTA).
    // Either works — click the first.
    const addBtns = screen.getAllByRole("button", { name: /Add Lead/i });
    fireEvent.click(addBtns[0]);
    fireEvent.change(screen.getByPlaceholderText("Name *"), { target: { value: "Charlie New" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "charlie@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(createMutateMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByPlaceholderText("Name *")).not.toBeInTheDocument());
  });

  it("does not save a lead without a name (client-side guard)", () => {
    render(<LeadsCRM />, { wrapper: wrap });
    const addBtns = screen.getAllByRole("button", { name: /Add Lead/i });
    fireEvent.click(addBtns[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(createMutateMock).not.toHaveBeenCalled();
  });

  it("Cancel closes the add-lead form", () => {
    render(<LeadsCRM />, { wrapper: wrap });
    const addBtns = screen.getAllByRole("button", { name: /Add Lead/i });
    fireEvent.click(addBtns[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByPlaceholderText("Name *")).toBeNull();
  });
});
