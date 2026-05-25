import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminContactSubmissions from "@/components/AdminContactSubmissions";

const { fromMock, toastMock, useAuthMock, updateMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  useAuthMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

function queryBuilder(data: unknown[]) {
  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error: null })),
    update: updateMock,
  };
  return builder;
}

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {ui}
    </QueryClientProvider>,
  );
}

const submission = {
  id: "sub-1",
  type: "contact",
  name: "Buyer One",
  email: "buyer@example.com",
  company: "Buyer Co",
  message: "I need help with a property.",
  document_type: null,
  listing_title: null,
  share_to_email: null,
  status: "new",
  handled_at: null,
  handled_by: null,
  admin_notes: null,
  created_at: "2026-05-25T07:00:00Z",
};

describe("AdminContactSubmissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: "admin-user" } });
    updateMock.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    fromMock.mockImplementation(() => queryBuilder([submission]));
  });

  it("surfaces platform contact submissions and lets admins mark them handled", async () => {
    renderWithQuery(<AdminContactSubmissions />);

    expect(await screen.findByText("Buyer One")).toBeInTheDocument();
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText("I need help with a property.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mark handled/i }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "handled",
      handled_by: "admin-user",
    })));
    expect(toastMock.success).toHaveBeenCalledWith("Submission updated");
  });

  it("filters submissions by search text", async () => {
    renderWithQuery(<AdminContactSubmissions />);

    expect(await screen.findByText("Buyer One")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search submissions/i), { target: { value: "missing" } });

    expect(screen.queryByText("Buyer One")).not.toBeInTheDocument();
    expect(screen.getByText("No submissions yet.")).toBeInTheDocument();
  });
});
