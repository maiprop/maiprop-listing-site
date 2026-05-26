import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const {
  useContactsMock,
  useContactTasksMock,
  createContactMock,
  updateContactMock,
  deleteContactMock,
  createTaskMock,
  updateTaskMock,
  toastMock,
} = vi.hoisted(() => ({
  useContactsMock: vi.fn(),
  useContactTasksMock: vi.fn(),
  createContactMock: { mutateAsync: vi.fn() },
  updateContactMock: { mutate: vi.fn(), mutateAsync: vi.fn() },
  deleteContactMock: { mutate: vi.fn() },
  createTaskMock: { mutateAsync: vi.fn() },
  updateTaskMock: { mutate: vi.fn() },
  toastMock: { error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useContacts", () => ({
  useContacts: () => useContactsMock(),
  useCreateContact: () => createContactMock,
  useUpdateContact: () => updateContactMock,
  useDeleteContact: () => deleteContactMock,
  useContactTasks: (...args: unknown[]) => useContactTasksMock(...args),
  useCreateContactTask: () => createTaskMock,
  useUpdateContactTask: () => updateTaskMock,
  DEAL_STAGES: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"],
}));

import ContactsCRM from "@/components/ContactsCRM";

const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const contact = (overrides: Record<string, unknown> = {}) => ({
  id: "contact-1",
  name: "Alex Buyer",
  email: "alex@example.com",
  phone: "phone-redacted",
  source: "portal",
  notes: "Needs sea view",
  deal_stage: "new",
  follow_up_at: `${today}T10:00:00.000Z`,
  listing_id: "listing-1",
  listings: { title: "Sea View Apartment" },
  ...overrides,
});

const renderCrm = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ContactsCRM />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  useContactsMock.mockReturnValue({ data: [], isLoading: false });
  useContactTasksMock.mockReturnValue({ data: [] });
  createContactMock.mutateAsync.mockResolvedValue(undefined);
  updateContactMock.mutateAsync.mockResolvedValue(undefined);
  createTaskMock.mutateAsync.mockResolvedValue(undefined);
});

describe("ContactsCRM", () => {
  it("shows loading and empty states, then opens and cancels the add form", () => {
    useContactsMock.mockReturnValueOnce({ data: [], isLoading: true });
    const { container, rerender } = renderCrm();
    expect(container.querySelector(".animate-spin")).toBeTruthy();

    useContactsMock.mockReturnValue({ data: [], isLoading: false });
    rerender(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ContactsCRM />
      </MemoryRouter>,
    );

    expect(screen.getByText("No contacts yet")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /add contact/i })[0]);
    expect(screen.getByPlaceholderText("Name *")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByPlaceholderText("Name *")).not.toBeInTheDocument();
  });

  it("validates, creates, edits, stage-updates, expands tasks, completes tasks, and deletes from pipeline view", async () => {
    useContactsMock.mockReturnValue({ data: [contact()], isLoading: false });
    useContactTasksMock.mockReturnValue({
      data: [{ id: "task-1", title: "Call back", due_at: `${today}T12:00:00.000Z`, completed_at: null }],
    });

    renderCrm();

    expect(screen.getByText("Follow-ups today (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(toastMock.error).toHaveBeenCalledWith("Name is required");

    fireEvent.change(screen.getByPlaceholderText("Name *"), { target: { value: "New Contact" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Phone"), { target: { value: "+30" } });
    fireEvent.change(screen.getByPlaceholderText("Source"), { target: { value: "referral" } });
    fireEvent.change(screen.getByPlaceholderText("Notes"), { target: { value: "Hot lead" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(createContactMock.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        name: "New Contact",
        email: "new@example.com",
        phone: "+30",
        source: "referral",
        notes: "Hot lead",
      })),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByDisplayValue("Alex Buyer"), { target: { value: "Alex Edited" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(updateContactMock.mutateAsync).toHaveBeenCalledWith({
        id: "contact-1",
        updates: expect.objectContaining({ name: "Alex Edited" }),
      }),
    );

    fireEvent.change(screen.getAllByRole("combobox").find((el) => (el as HTMLSelectElement).value === "new")!, {
      target: { value: "qualified" },
    });
    expect(updateContactMock.mutate).toHaveBeenCalledWith({
      id: "contact-1",
      updates: { deal_stage: "qualified" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Tasks" })[0]);
    fireEvent.change(screen.getByPlaceholderText("New task"), { target: { value: "Send brochure" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(createTaskMock.mutateAsync).toHaveBeenCalledWith({
        contactId: "contact-1",
        title: "Send brochure",
        dueAt: null,
      }),
    );
    fireEvent.click(screen.getByText("Call back").parentElement!.querySelector("button")!);
    expect(updateTaskMock.mutate).toHaveBeenCalledWith({
      id: "task-1",
      updates: expect.objectContaining({ completed_at: expect.any(String) }),
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(deleteContactMock.mutate).toHaveBeenCalledWith("contact-1");
  });

  it("uses list view contact actions and task panel branches", async () => {
    useContactsMock.mockReturnValue({ data: [contact({ id: "contact-2", deal_stage: "contacted" })], isLoading: false });
    useContactTasksMock.mockReturnValue({
      data: [{ id: "task-2", title: "Already done", due_at: null, completed_at: `${today}T08:00:00.000Z` }],
    });

    renderCrm();

    fireEvent.click(screen.getByRole("button", { name: /list/i }));
    expect(screen.getByRole("link", { name: /sea view apartment/i })).toHaveAttribute("href", "/property/listing-1");
    fireEvent.click(screen.getByTitle("Tasks"));
    expect(screen.getByText("Tasks")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(createTaskMock.mutateAsync).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Task title"), { target: { value: "Prepare CMA" } });
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: today } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(createTaskMock.mutateAsync).toHaveBeenCalledWith({
        contactId: "contact-2",
        title: "Prepare CMA",
        dueAt: today,
      }),
    );

    fireEvent.click(screen.getByText("Already done").parentElement!.querySelector("button")!);
    expect(updateTaskMock.mutate).toHaveBeenCalledWith({
      id: "task-2",
      updates: { completed_at: null },
    });
  });
});
