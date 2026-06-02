import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import AdminBroadcastNotifications from "@/components/AdminBroadcastNotifications";
import { renderWithProviders } from "@/test/utils";

const { invokeMock, toastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock("sonner", () => ({ toast: toastMock }));

beforeEach(() => {
  invokeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("AdminBroadcastNotifications", () => {
  it("requires a title and message before calling the broadcast function", () => {
    renderWithProviders(<AdminBroadcastNotifications />);

    fireEvent.click(screen.getByRole("button", { name: /Send Broadcast/i }));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Title and message are required");
  });

  it("sends a trimmed broadcast payload and resets the form on success", async () => {
    invokeMock.mockResolvedValue({ data: { data: 1, error: null }, error: null });
    renderWithProviders(<AdminBroadcastNotifications />);

    fireEvent.change(screen.getByLabelText(/Audience/i), { target: { value: "investors" } });
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "  Market update  " } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: "  New Athens deal live.  " } });
    fireEvent.change(screen.getByLabelText(/Link/i), { target: { value: "  /dashboard  " } });
    fireEvent.click(screen.getByRole("button", { name: /Send Broadcast/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("admin-broadcast-notification", {
        body: {
          segment: "investors",
          title: "Market update",
          body: "New Athens deal live.",
          link: "/dashboard",
        },
      }),
    );
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Broadcast sent to 1 user"));

    expect(screen.getByLabelText(/Audience/i)).toHaveValue("all");
    expect(screen.getByLabelText(/Title/i)).toHaveValue("");
    expect(screen.getByLabelText(/Message/i)).toHaveValue("");
    expect(screen.getByLabelText(/Link/i)).toHaveValue("");
  });

  it("surfaces function failures without clearing the draft message", async () => {
    invokeMock.mockResolvedValue({ data: { data: null, error: "Only admins can broadcast" }, error: null });
    renderWithProviders(<AdminBroadcastNotifications />);

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Maintenance" } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: "Portal update tonight" } });
    fireEvent.click(screen.getByRole("button", { name: /Send Broadcast/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Only admins can broadcast"));
    expect(screen.getByLabelText(/Title/i)).toHaveValue("Maintenance");
    expect(screen.getByLabelText(/Message/i)).toHaveValue("Portal update tonight");
  });
});
