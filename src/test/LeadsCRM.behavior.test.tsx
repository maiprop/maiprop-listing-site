import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LeadsCRM from "@/components/LeadsCRM";

const mocks = vi.hoisted(() => ({
  useLeads: vi.fn(),
  createLead: { mutateAsync: vi.fn() },
  updateLead: { mutate: vi.fn(), mutateAsync: vi.fn() },
  deleteLead: { mutate: vi.fn() },
}));

vi.mock("@/hooks/useLeads", () => ({
  LEAD_STATUSES: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"],
  LEAD_SOURCES: ["manual", "listing_inquiry", "consultation", "callback", "project_inquiry", "viewing", "message"],
  useLeads: () => mocks.useLeads(),
  useCreateLead: () => mocks.createLead,
  useUpdateLead: () => mocks.updateLead,
  useDeleteLead: () => mocks.deleteLead,
}));

const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const lead = (overrides: Record<string, unknown> = {}) => ({
  id: "lead-1",
  name: "Maya Buyer",
  email: "maya@example.com",
  phone: "+302100000001",
  message: "Interested in the listing",
  notes: "Prefers sea view",
  source: "listing_inquiry",
  status: "new",
  follow_up_at: `${today}T10:30:00.000Z`,
  listing_id: "listing-1",
  listings: { title: "Coastal Loft" },
  ...overrides,
});

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function renderLeads() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <LeadsCRM />
    </MemoryRouter>,
  );
}

describe("LeadsCRM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useLeads.mockReturnValue({ data: [], isLoading: false });
    mocks.createLead.mutateAsync.mockResolvedValue(undefined);
    mocks.updateLead.mutateAsync.mockResolvedValue(undefined);
  });

  it("covers loading, empty, add, cancel, and ignored blank save branches", async () => {
    mocks.useLeads.mockReturnValueOnce({ data: [], isLoading: true });
    const { container, rerender } = renderLeads();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    mocks.useLeads.mockReturnValue({ data: [], isLoading: false });
    rerender(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <LeadsCRM />
      </MemoryRouter>,
    );
    expect(screen.getByText("No leads yet")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Add Lead/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(mocks.createLead.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByPlaceholderText("Name *")).not.toBeInTheDocument();
  });

  it("creates, edits, changes status, links listings, and deletes leads from pipeline view", async () => {
    mocks.useLeads.mockReturnValue({ data: [lead()], isLoading: false });
    renderLeads();

    expect(screen.getByText("Follow-ups today (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add Lead/i }));
    fireEvent.change(screen.getByPlaceholderText("Name *"), { target: { value: "New Lead" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Phone"), { target: { value: "+30" } });
    fireEvent.change(screen.getByDisplayValue("Manual"), { target: { value: "consultation" } });
    fireEvent.change(screen.getByDisplayValue("New"), { target: { value: "qualified" } });
    fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: `${today}T14:30` } });
    fireEvent.change(screen.getByPlaceholderText("Message / Notes"), { target: { value: "Warm intro" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(mocks.createLead.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      name: "New Lead",
      email: "new@example.com",
      phone: "+30",
      source: "consultation",
      status: "qualified",
      message: "Warm intro",
      notes: "Warm intro",
      follow_up_at: `${today}T14:30`,
    })));

    const getMayaLeadRow = () => {
      const leadTitle = screen.getAllByText("Maya Buyer").find((element) =>
        element.closest(".glass-card")?.textContent?.includes("Coastal Loft"),
      );
      expect(leadTitle).toBeTruthy();
      return leadTitle!.closest(".glass-card") as HTMLElement;
    };

    const leadRow = getMayaLeadRow();
    fireEvent.click(Array.from(leadRow.querySelectorAll("button"))[0]);
    fireEvent.change(screen.getByDisplayValue("Maya Buyer"), { target: { value: "Maya Edited" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(mocks.updateLead.mutateAsync).toHaveBeenCalledWith({
      id: "lead-1",
      updates: expect.objectContaining({ name: "Maya Edited" }),
    }));

    fireEvent.click(screen.getByRole("button", { name: "Qualified" }));
    expect(mocks.updateLead.mutate).toHaveBeenCalledWith({ id: "lead-1", updates: { status: "qualified" } });

    expect(screen.getByRole("link", { name: /Coastal Loft/i })).toHaveAttribute("href", "/property/listing-1");
    const editedRow = getMayaLeadRow();
    fireEvent.click(Array.from(editedRow.querySelectorAll("button"))[1]);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(mocks.deleteLead.mutate).toHaveBeenCalledWith("lead-1");
  });

  it("uses list mode contact affordances and nullable lead fields", () => {
    mocks.useLeads.mockReturnValue({
      data: [
        lead({
          id: "lead-2",
          name: "No Contact",
          email: null,
          phone: null,
          message: null,
          notes: "List-only note",
          source: "callback",
          status: "won",
          follow_up_at: null,
          listing_id: null,
          listings: null,
        }),
      ],
      isLoading: false,
    });
    renderLeads();

    fireEvent.click(screen.getByRole("button", { name: /List/i }));
    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.getByText("Callback")).toBeInTheDocument();
    expect(screen.getByText("List-only note")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Coastal Loft/i })).not.toBeInTheDocument();
    const row = screen.getByText("No Contact").closest(".glass-card") as HTMLElement;
    fireEvent.click(Array.from(row.querySelectorAll("button"))[0]);
    expect(screen.getByText("Edit Lead")).toBeInTheDocument();
  });
});
