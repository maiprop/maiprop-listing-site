import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import AdminBroadcastNotifications from "@/components/AdminBroadcastNotifications";
import { renderWithProviders } from "@/test/utils";

const { rpcMock, toastMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("sonner", () => ({ toast: toastMock }));

beforeEach(() => {
  rpcMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("AdminBroadcastNotifications", () => {
  it("requires a title and message before calling the broadcast RPC", () => {
    renderWithProviders(<AdminBroadcastNotifications />);

    fireEvent.click(screen.getByRole("button", { name: /Send Broadcast/i }));

    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Title and message are required");
  });

  it("sends a trimmed broadcast payload and resets the form on success", async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    renderWithProviders(<AdminBroadcastNotifications />);

    fireEvent.change(screen.getByLabelText(/Audience/i), { target: { value: "investors" } });
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "  Market update  " } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: "  New Athens deal live.  " } });
    fireEvent.change(screen.getByLabelText(/Link/i), { target: { value: "  /dashboard  " } });
    fireEvent.click(screen.getByRole("button", { name: /Send Broadcast/i }));

    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith("admin_broadcast_notification", {
        p_segment: "investors",
        p_title: "Market update",
        p_body: "New Athens deal live.",
        p_type: "admin_broadcast",
        p_link: "/dashboard",
      }),
    );
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Broadcast sent to 1 user"));

    expect(screen.getByLabelText(/Audience/i)).toHaveValue("all");
    expect(screen.getByLabelText(/Title/i)).toHaveValue("");
    expect(screen.getByLabelText(/Message/i)).toHaveValue("");
    expect(screen.getByLabelText(/Link/i)).toHaveValue("");
  });

  it("surfaces RPC failures without clearing the draft message", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("Only admins can broadcast") });
    renderWithProviders(<AdminBroadcastNotifications />);

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Maintenance" } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: "Portal update tonight" } });
    fireEvent.click(screen.getByRole("button", { name: /Send Broadcast/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Only admins can broadcast"));
    expect(screen.getByLabelText(/Title/i)).toHaveValue("Maintenance");
    expect(screen.getByLabelText(/Message/i)).toHaveValue("Portal update tonight");
  });
});
