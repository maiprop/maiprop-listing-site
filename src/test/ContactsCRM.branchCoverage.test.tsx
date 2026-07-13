import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useContacts: vi.fn(),
  useContactTasks: vi.fn(),
  createContact: { mutateAsync: vi.fn() },
  updateContact: { mutate: vi.fn(), mutateAsync: vi.fn() },
  deleteContact: { mutate: vi.fn() },
  createTask: { mutateAsync: vi.fn() },
  updateTask: { mutate: vi.fn() },
  toast: { error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useContacts", () => ({
  useContacts: () => mocks.useContacts(),
  useCreateContact: () => mocks.createContact,
  useUpdateContact: () => mocks.updateContact,
  useDeleteContact: () => mocks.deleteContact,
  useContactTasks: (...args: unknown[]) => mocks.useContactTasks(...args),
  useCreateContactTask: () => mocks.createTask,
  useUpdateContactTask: () => mocks.updateTask,
  DEAL_STAGES: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"],
}));

import ContactsCRM from "@/components/ContactsCRM";

const sparseContact = (overrides: Record<string, unknown> = {}) => ({
  id: "contact-sparse",
  name: "Minimal Buyer",
  email: null,
  phone: null,
  source: null,
  notes: null,
  deal_stage: null,
  follow_up_at: null,
  listing_id: null,
  listings: null,
  ...overrides,
});

const renderCrm = () => render(
  <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
    <ContactsCRM />
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useContacts.mockReturnValue({ data: [sparseContact()], isLoading: false });
  mocks.useContactTasks.mockReturnValue({ data: [] });
  mocks.createContact.mutateAsync.mockResolvedValue(undefined);
  mocks.updateContact.mutateAsync.mockResolvedValue(undefined);
  mocks.createTask.mutateAsync.mockResolvedValue(undefined);
});

describe("ContactsCRM lifecycle branches", () => {
  it("creates a minimal lead with explicit nulls instead of leaking blank contact details", async () => {
    renderCrm();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    fireEvent.change(screen.getByPlaceholderText("Name *"), { target: { value: "Referral Lead" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mocks.createContact.mutateAsync).toHaveBeenCalledWith({
      name: "Referral Lead",
      email: null,
      phone: null,
      source: null,
      notes: null,
      deal_stage: "new",
      follow_up_at: null,
    }));
    expect(screen.queryByPlaceholderText("Name *")).not.toBeInTheDocument();
  });

  it("places contacts without a stage in New and edits missing optional data as blank fields", async () => {
    renderCrm();

    const stageSelect = screen.getAllByRole("combobox").find((element) => (element as HTMLSelectElement).value === "new");
    expect(stageSelect).toBeInTheDocument();
    expect(screen.queryByText(/follow-ups today/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByPlaceholderText("Email")).toHaveValue("");
    expect(screen.getByPlaceholderText("Phone")).toHaveValue("");
    expect(screen.getByPlaceholderText("Source")).toHaveValue("");
    expect(screen.getByPlaceholderText("Notes")).toHaveValue("");
    expect(document.querySelector('input[type="datetime-local"]')).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mocks.updateContact.mutateAsync).toHaveBeenCalledWith({
      id: "contact-sparse",
      updates: expect.objectContaining({
        email: null,
        phone: null,
        source: null,
        notes: null,
        deal_stage: "new",
        follow_up_at: null,
      }),
    }));
  });

  it("expands and collapses pipeline tasks while preserving completed-task visibility", () => {
    mocks.useContactTasks.mockReturnValue({
      data: [{ id: "task-complete", title: "Archived call", due_at: null, completed_at: "2026-07-12T09:00:00.000Z" }],
    });
    renderCrm();

    const taskButton = screen.getByRole("button", { name: "Tasks" });
    fireEvent.click(taskButton);
    const task = screen.getByText("Archived call");
    expect(task).toHaveClass("line-through");
    fireEvent.click(task.parentElement!.querySelector("button")!);
    expect(mocks.updateTask.mutate).toHaveBeenCalledWith({
      id: "task-complete",
      updates: { completed_at: expect.any(String) },
    });

    fireEvent.click(taskButton);
    expect(screen.queryByText("Archived call")).not.toBeInTheDocument();
  });

  it("shows the list task empty state and closes it when the same contact is toggled", () => {
    renderCrm();
    fireEvent.click(screen.getByRole("button", { name: /list/i }));
    expect(screen.queryByRole("link", { name: /minimal buyer/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="mailto:"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="tel:"]')).not.toBeInTheDocument();

    const taskButton = screen.getByTitle("Tasks");
    fireEvent.click(taskButton);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    fireEvent.click(taskButton);
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("toggles an incomplete dated list task to completed", () => {
    const due = "2026-07-14T12:00:00.000Z";
    mocks.useContactTasks.mockReturnValue({
      data: [{ id: "task-open", title: "Call conveyancer", due_at: due, completed_at: null }],
    });
    renderCrm();
    fireEvent.click(screen.getByRole("button", { name: /list/i }));
    fireEvent.click(screen.getByTitle("Tasks"));

    const taskRow = screen.getByText("Call conveyancer").parentElement as HTMLElement;
    expect(taskRow).toHaveTextContent(new Date(due).toLocaleDateString());
    fireEvent.click(within(taskRow).getByRole("button"));
    expect(mocks.updateTask.mutate).toHaveBeenCalledWith({
      id: "task-open",
      updates: { completed_at: expect.any(String) },
    });
  });

  it("uses list-view defaults when editing a contact without optional fields", () => {
    renderCrm();
    fireEvent.click(screen.getByRole("button", { name: /list/i }));
    const editButton = document.querySelector(".lucide-pen")?.closest("button") as HTMLButtonElement;
    fireEvent.click(editButton);

    expect(screen.getByText("Edit Contact")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toHaveValue("");
    expect(screen.getByPlaceholderText("Phone")).toHaveValue("");
    expect(screen.getByPlaceholderText("Source")).toHaveValue("");
    expect(screen.getByPlaceholderText("Notes")).toHaveValue("");
    expect(screen.getByRole("combobox")).toHaveValue("new");
  });

  it("cancels contact deletion without mutating the CRM", async () => {
    renderCrm();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete contact?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Delete contact?")).not.toBeInTheDocument());
    expect(mocks.deleteContact.mutate).not.toHaveBeenCalled();
  });
});
