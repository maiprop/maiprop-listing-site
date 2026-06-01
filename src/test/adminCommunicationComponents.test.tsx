import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  useAuth: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    functions: {
      invoke: (...args: unknown[]) => mocks.invoke(...args),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import AdminBroadcastNotifications from "@/components/AdminBroadcastNotifications";
import AdminContactSubmissions from "@/components/AdminContactSubmissions";

const submissions = [
  {
    id: "sub-1",
    type: "contact",
    name: "Jane Buyer",
    email: "jane@example.com",
    company: "Acme Homes",
    message: "I want to book a viewing.",
    document_type: null,
    listing_title: null,
    share_to_email: null,
    status: "new",
    handled_at: null,
    handled_by: null,
    admin_notes: null,
    created_at: "2026-05-01T10:00:00Z",
  },
  {
    id: "sub-2",
    type: "document_share",
    name: null,
    email: "agent@example.com",
    company: "MaiProp Partners",
    message: "Please review this file.",
    document_type: "Agency agreement",
    listing_title: "Athens Loft",
    share_to_email: "buyer@example.com",
    status: "in_review",
    handled_at: null,
    handled_by: null,
    admin_notes: "Waiting for compliance",
    created_at: "2026-05-02T10:00:00Z",
  },
] as const;

function mockContactSubmissionQuery() {
  const order = vi.fn().mockResolvedValue({ data: submissions, error: null });
  const select = vi.fn().mockReturnValue({ order });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });

  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe("contact_submissions");
    return { select, update };
  });

  return { select, order, update, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: { id: "admin-1" } });
  mocks.rpc.mockResolvedValue({ data: 2, error: null });
  mocks.invoke.mockResolvedValue({ data: { data: 2, error: null }, error: null });
  mockContactSubmissionQuery();
});

describe("AdminBroadcastNotifications", () => {
  it("requires a title and message before calling the broadcast RPC", () => {
    renderWithProviders(<AdminBroadcastNotifications />);

    fireEvent.click(screen.getByRole("button", { name: /send broadcast/i }));

    expect(mocks.toast.error).toHaveBeenCalledWith("Title and message are required");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("sends a trimmed broadcast payload and resets the form on success", async () => {
    const { container } = renderWithProviders(<AdminBroadcastNotifications />);

    fireEvent.change(screen.getByDisplayValue("All active users"), { target: { value: "agents" } });
    fireEvent.change(screen.getByPlaceholderText(/short notification title/i), {
      target: { value: "  Listing update  " },
    });
    fireEvent.change(screen.getByPlaceholderText(/message users will see/i), {
      target: { value: "  New open-house material is available.  " },
    });
    fireEvent.change(screen.getByPlaceholderText(/\/dashboard/i), {
      target: { value: "  /dashboard?tab=open-houses  " },
    });

    fireEvent.click(screen.getByRole("button", { name: /send broadcast/i }));

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("admin-broadcast-notification", {
        body: {
          segment: "agents",
          title: "Listing update",
          body: "New open-house material is available.",
          link: "/dashboard?tab=open-houses",
        },
      }),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith("Broadcast sent to 2 users");
    expect(screen.getByPlaceholderText(/short notification title/i)).toHaveValue("");
    expect(screen.getByPlaceholderText(/message users will see/i)).toHaveValue("");
    expect(container.querySelector("select")).toHaveValue("all");
  });

  it("surfaces broadcast Edge Function failures", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { data: null, error: "Edge denied" }, error: null });

    renderWithProviders(<AdminBroadcastNotifications />);
    fireEvent.change(screen.getByPlaceholderText(/short notification title/i), { target: { value: "Heads up" } });
    fireEvent.change(screen.getByPlaceholderText(/message users will see/i), { target: { value: "Message body" } });
    fireEvent.click(screen.getByRole("button", { name: /send broadcast/i }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Edge denied"));
  });
});

describe("AdminContactSubmissions", () => {
  it("renders contact and document-share submissions with counts and searchable rows", async () => {
    const query = mockContactSubmissionQuery();

    renderWithProviders(<AdminContactSubmissions />);

    expect(await screen.findByText("Jane Buyer")).toBeInTheDocument();
    expect(screen.getByText("Agency agreement - Athens Loft - buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Waiting for compliance")).toBeInTheDocument();
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("admin_notes"));
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });

    fireEvent.change(screen.getByPlaceholderText(/search submissions/i), { target: { value: "buyer@example.com" } });

    expect(screen.queryByText("Jane Buyer")).not.toBeInTheDocument();
    expect(screen.getByText("Agency agreement - Athens Loft - buyer@example.com")).toBeInTheDocument();
  });

  it("saves admin notes and stamps handled submissions with the admin user", async () => {
    const query = mockContactSubmissionQuery();

    renderWithProviders(<AdminContactSubmissions />);
    expect(await screen.findByText("Jane Buyer")).toBeInTheDocument();

    const notesButtons = screen.getAllByRole("button", { name: /notes/i });
    fireEvent.click(notesButtons[0]);
    fireEvent.change(screen.getByPlaceholderText(/admin notes/i), {
      target: { value: "  Follow up after legal review  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save notes/i }));

    await waitFor(() =>
      expect(query.update).toHaveBeenCalledWith({
        admin_notes: "Follow up after legal review",
      }),
    );
    expect(query.eq).toHaveBeenCalledWith("id", "sub-1");
    expect(mocks.toast.success).toHaveBeenCalledWith("Submission updated");

    query.update.mockClear();
    query.eq.mockClear();
    fireEvent.click(screen.getAllByRole("button", { name: /mark handled/i })[0]);

    await waitFor(() =>
      expect(query.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "handled",
          handled_by: "admin-1",
          handled_at: expect.any(String),
        }),
      ),
    );
    expect(query.eq).toHaveBeenCalledWith("id", "sub-1");
  });
});
