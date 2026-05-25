/**
 * Tests for the four hooks in `@/hooks/useViewings`. Each mutation / query
 * is exercised via `renderHook` + a fresh QueryClient. The supabase chain
 * is mocked with a tiny chainable that supports `.from().select()`,
 * `.insert().select().single()`, `.update().eq().or()`, etc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, waitFor, act, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { useAuthMock, fromMock, toastMock, submitConsultationMock, planLimitMessageMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fromMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  submitConsultationMock: { mutateAsync: vi.fn(), isPending: false },
  planLimitMessageMock: vi.fn<(err: unknown) => string | null>(() => null),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/planLimitErrors", () => ({ getPlanLimitErrorMessage: (err: unknown) => planLimitMessageMock(err) }));
vi.mock("@/hooks/useConsultations", () => ({
  useSubmitConsultation: () => submitConsultationMock,
}));

import {
  useViewings,
  useBookViewing,
  useUpdateViewingStatus,
  useUpdateViewing,
} from "@/hooks/useViewings";
import OnlineViewingModal from "@/components/OnlineViewingModal";
import RequestCallbackModal from "@/components/RequestCallbackModal";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  useAuthMock.mockReset();
  fromMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  planLimitMessageMock.mockReset();
  planLimitMessageMock.mockReturnValue(null);
  submitConsultationMock.mutateAsync.mockReset();
  submitConsultationMock.isPending = false;
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
});

const clickFirstGeneratedDate = () => {
  const dateButton = screen.getAllByRole("button").find((button) => {
    const text = (button.textContent ?? "").replace(/\s+/g, "");
    return /(?:Mon|Tue|Wed|Thu|Fri)\d{1,2}\w{3}/.test(text);
  });
  if (!dateButton) throw new Error("generated date button not found");
  fireEvent.click(dateButton);
};

const renderWithClient = (ui: React.ReactElement) => render(ui, { wrapper: wrapper() });

describe("useViewings (query)", () => {
  it("returns empty array when no user is logged in", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useViewings("requester"), { wrapper: wrapper() });
    // `enabled: !!user` keeps the query idle.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });

  it("queries by requester_id when role is 'requester' and returns the rows", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "v-1" }], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });
    const { result } = renderHook(() => useViewings("requester"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fromMock).toHaveBeenCalledWith("viewings");
    expect(eq).toHaveBeenCalledWith("requester_id", "u-1");
    expect(result.current.data).toEqual([{ id: "v-1" }]);
  });

  it("queries by owner_id when role is 'owner'", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select: () => ({ eq }) });
    const { result } = renderHook(() => useViewings("owner"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq).toHaveBeenCalledWith("owner_id", "u-1");
  });

  it("propagates supabase errors so the query rejects", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });
    const { result } = renderHook(() => useViewings(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/boom/);
  });
});

describe("useBookViewing", () => {
  it("inserts a viewing with the current user as requester and toasts success", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "v-new" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    fromMock.mockReturnValue({ insert });

    const { result } = renderHook(() => useBookViewing(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        listing_id: "l-1",
        owner_id: "owner-1",
        viewing_type: "video",
        scheduled_at: "2026-05-01T10:00:00Z",
        note: "remote",
      });
    });
    expect(insert).toHaveBeenCalledWith({
      listing_id: "l-1",
      owner_id: "owner-1",
      viewing_type: "video",
      scheduled_at: "2026-05-01T10:00:00Z",
      note: "remote",
      requester_id: "u-1",
    });
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/booked/i));
  });

  it("rejects when no user is logged in", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useBookViewing(), { wrapper: wrapper() });
    await expect(
      result.current.mutateAsync({
        listing_id: "l", owner_id: "o", viewing_type: "in_person", scheduled_at: "x",
      }),
    ).rejects.toThrow(/logged in/i);
  });

  it("toasts the error message when supabase returns an error", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: new Error("limit reached") });
    fromMock.mockReturnValue({ insert: () => ({ select: () => ({ single }) }) });
    const { result } = renderHook(() => useBookViewing(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        listing_id: "l", owner_id: "o", viewing_type: "in_person", scheduled_at: "x",
      }).catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith("limit reached");
  });

  it("shows an upgrade CTA when the viewing plan limit is reached", async () => {
    planLimitMessageMock.mockReturnValue("You've used your free viewing this month. Upgrade to Pro to book more viewings.");
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "viewing_limit_reached", code: "P0001" } });
    fromMock.mockReturnValue({ insert: () => ({ select: () => ({ single }) }) });
    const { result } = renderHook(() => useBookViewing(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        listing_id: "l", owner_id: "o", viewing_type: "in_person", scheduled_at: "x",
      }).catch(() => {});
    });

    expect(toastMock.error).toHaveBeenCalledWith(
      "You've used your free viewing this month. Upgrade to Pro to book more viewings.",
      expect.objectContaining({
        action: expect.objectContaining({
          label: "Upgrade to Pro",
          onClick: expect.any(Function),
        }),
      }),
    );
  });

  it("does not show a buyer upgrade CTA when the owner is the capped account", async () => {
    planLimitMessageMock.mockReturnValue("The listing owner has reached their monthly viewing limit. Please contact the owner or try another listing.");
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "viewing_limit_reached", hint: "Listing owner has reached viewing limit." } });
    fromMock.mockReturnValue({ insert: () => ({ select: () => ({ single }) }) });
    const { result } = renderHook(() => useBookViewing(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        listing_id: "l", owner_id: "o", viewing_type: "in_person", scheduled_at: "x",
      }).catch(() => {});
    });

    expect(toastMock.error).toHaveBeenCalledWith("The listing owner has reached their monthly viewing limit. Please contact the owner or try another listing.");
  });
});

describe("useUpdateViewingStatus", () => {
  it("updates the row's status and invalidates the cache", async () => {
    const or = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockReturnValue({ or });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });
    const { result } = renderHook(() => useUpdateViewingStatus(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: "v-1", status: "confirmed" });
    });
    expect(update).toHaveBeenCalledWith({ status: "confirmed" });
    expect(eq).toHaveBeenCalledWith("id", "v-1");
    expect(or).toHaveBeenCalledWith("owner_id.eq.u-1,requester_id.eq.u-1");
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/updated/i));
  });

  it("rejects when no user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUpdateViewingStatus(), { wrapper: wrapper() });
    await expect(
      result.current.mutateAsync({ id: "v", status: "cancelled" }),
    ).rejects.toThrow(/logged in/i);
  });
});

describe("useUpdateViewing", () => {
  it("updates with arbitrary fields and toasts success", async () => {
    const or = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockReturnValue({ or });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });
    const { result } = renderHook(() => useUpdateViewing(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: "v-1", updates: { note: "rescheduled" } });
    });
    expect(update).toHaveBeenCalledWith({ note: "rescheduled" });
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/updated/i));
  });

  it("propagates supabase errors", async () => {
    const or = vi.fn().mockResolvedValue({ error: new Error("denied") });
    fromMock.mockReturnValue({ update: () => ({ eq: () => ({ or }) }) });
    const { result } = renderHook(() => useUpdateViewing(), { wrapper: wrapper() });
    await expect(
      result.current.mutateAsync({ id: "v", updates: {} }),
    ).rejects.toThrow(/denied/);
  });
});

describe("viewing request modals", () => {
  it("books a listing video viewing and renders the confirmation branch", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    const insert = vi.fn().mockReturnValue({
      select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "v-new" }, error: null }) }),
    });
    fromMock.mockReturnValue({ insert });

    renderWithClient(
      <OnlineViewingModal
        open
        onClose={vi.fn()}
        listing={{ id: "l-1", owner_id: "owner-1", title: "Video Flat", city: "Athens" }}
      />,
    );

    clickFirstGeneratedDate();
    fireEvent.click(screen.getByRole("button", { name: "09:00" }));
    fireEvent.change(screen.getByPlaceholderText(/specific areas/i), {
      target: { value: "Show the balcony" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Request Video Viewing/i }));

    await waitFor(() => expect(screen.getByText(/Video request submitted/i)).toBeInTheDocument());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      listing_id: "l-1",
      owner_id: "owner-1",
      requester_id: "u-1",
      viewing_type: "video",
      note: "Show the balcony",
    }));
  });

  it("requires sign-in for listing video requests from guests after a slot is selected", async () => {
    useAuthMock.mockReturnValue({ user: null, profile: null });
    renderWithClient(
      <OnlineViewingModal
        open
        onClose={vi.fn()}
        listing={{ id: "l-1", owner_id: "owner-1", title: "Guest Flat", city: "Athens" }}
      />,
    );

    clickFirstGeneratedDate();
    fireEvent.click(screen.getByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Guest Buyer" } });
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), { target: { value: "guest@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Request Video Viewing/i }));

    expect(toastMock.error).toHaveBeenCalledWith("Please sign in to request a video viewing");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("submits a guest professional video consultation with platform and note", async () => {
    useAuthMock.mockReturnValue({ user: null, profile: null });
    submitConsultationMock.mutateAsync.mockResolvedValue({ id: "consult-1" });

    renderWithClient(
      <OnlineViewingModal
        open
        onClose={vi.fn()}
        professional={{ id: "pro-1", display_name: "Dana Pro", title: "Surveyor" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /WhatsApp Video/i }));
    clickFirstGeneratedDate();
    fireEvent.click(screen.getByRole("button", { name: "11:00" }));
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Guest Buyer" } });
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), { target: { value: "guest@example.com" } });
    fireEvent.change(screen.getByPlaceholderText(/specific areas/i), { target: { value: "Talk financing" } });
    fireEvent.click(screen.getByRole("button", { name: /Request Video Viewing/i }));

    await waitFor(() => expect(screen.getByText(/Video request submitted/i)).toBeInTheDocument());
    expect(submitConsultationMock.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      professional_id: "pro-1",
      requester_name: "Guest Buyer",
      requester_email: "guest@example.com",
      request_type: "consultation",
      message: expect.stringContaining("WhatsApp Video"),
    }));
    expect(submitConsultationMock.mutateAsync.mock.calls[0][0].message).toContain("Talk financing");
  });

  it("surfaces professional video consultation failures", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    submitConsultationMock.mutateAsync.mockRejectedValue(new Error("offline"));

    renderWithClient(
      <OnlineViewingModal
        open
        onClose={vi.fn()}
        professional={{ id: "pro-1", display_name: "Dana Pro", title: "Surveyor" }}
      />,
    );

    clickFirstGeneratedDate();
    fireEvent.click(screen.getByRole("button", { name: "12:00" }));
    fireEvent.click(screen.getByRole("button", { name: /Request Video Viewing/i }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith("Could not submit the request. Please try again.");
    });
  });
});

describe("callback request modal", () => {
  const professional = { id: "pro-1", display_name: "Dana Pro", title: "Surveyor" };

  const clickMorningWindow = () => {
    fireEvent.click(screen.getByText("Morning").closest("button") as HTMLButtonElement);
  };

  it("requires sign-in before a callback request can be submitted", () => {
    useAuthMock.mockReturnValue({ user: null, profile: null });
    render(<RequestCallbackModal open onClose={vi.fn()} professional={professional} />);

    expect(screen.getByText(/Sign in to request a callback/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Sign in$/i })).toHaveAttribute("href", "/login");
    expect(submitConsultationMock.mutateAsync).not.toHaveBeenCalled();
  });

  it("submits callback requests and shows the done state", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "" },
    });
    submitConsultationMock.mutateAsync.mockResolvedValue({ id: "callback-1" });
    render(<RequestCallbackModal open onClose={vi.fn()} professional={professional} />);

    fireEvent.change(screen.getByPlaceholderText("+30 6XX XXX XXXX"), { target: { value: "+30 699 000 0000" } });
    clickFirstGeneratedDate();
    clickMorningWindow();
    fireEvent.change(screen.getByPlaceholderText(/Briefly describe/i), { target: { value: "Need valuation help" } });
    fireEvent.click(screen.getByRole("button", { name: /Request Callback/i }));

    await waitFor(() => expect(screen.getByText(/Callback request sent/i)).toBeInTheDocument());
    expect(submitConsultationMock.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      professional_id: "pro-1",
      requester_name: "Buyer One",
      requester_email: "buyer@example.com",
      requester_phone: "+30 699 000 0000",
      request_type: "callback",
      callback_time: expect.stringContaining("Morning"),
      message: "Need valuation help",
    }));
  });

  it("surfaces callback submission errors", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "+30 211 000 0000" },
    });
    submitConsultationMock.mutateAsync.mockRejectedValue(new Error("offline"));
    render(<RequestCallbackModal open onClose={vi.fn()} professional={professional} />);

    clickMorningWindow();
    fireEvent.click(screen.getByRole("button", { name: /Request Callback/i }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith("Could not submit request. Please try again.");
    });
  });
});
