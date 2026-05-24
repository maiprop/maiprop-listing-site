import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AIServiceMatchModal } from "@/components/AIServiceMatchModal";
import SendMessageModal from "@/components/SendMessageModal";
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import ViewingDialog from "@/components/ViewingDialog";
import type { Property } from "@/components/PropertyCard";

const mocks = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  fromMock: vi.fn(),
  navigateMock: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  authState: {
    user: null as null | { id: string; email?: string },
    profile: null as null | { display_name?: string; first_name?: string; phone?: string },
  },
  startConversation: { isPending: false, mutateAsync: vi.fn() },
  sendMessage: { isPending: false, mutateAsync: vi.fn() },
  submitConsultation: { isPending: false, mutateAsync: vi.fn() },
  bookViewing: { isPending: false, mutateAsync: vi.fn() },
  createAuctionAlert: { isPending: false, mutate: vi.fn() },
  updateAuctionAlert: { isPending: false, mutate: vi.fn() },
  logger: { warn: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invokeMock },
    from: mocks.fromMock,
  },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigateMock };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/hooks/useMessages", () => ({
  useStartConversation: () => mocks.startConversation,
  useSendMessage: () => mocks.sendMessage,
}));
vi.mock("@/hooks/useConsultations", () => ({ useSubmitConsultation: () => mocks.submitConsultation }));
vi.mock("@/hooks/useViewings", () => ({ useBookViewing: () => mocks.bookViewing }));
vi.mock("@/hooks/useAuctionAlerts", () => ({
  useCreateAuctionAlert: () => mocks.createAuctionAlert,
  useUpdateAuctionAlert: () => mocks.updateAuctionAlert,
}));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key.split(".").at(-1) ?? key }) }));

const property = {
  id: "listing-1",
  title: "Sea view flat",
  city: "Athens",
  images: ["https://example.com/flat.jpg"],
} as Property;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = null;
  mocks.authState.profile = null;
  mocks.startConversation.isPending = false;
  mocks.sendMessage.isPending = false;
  mocks.submitConsultation.isPending = false;
  mocks.createAuctionAlert.isPending = false;
  mocks.updateAuctionAlert.isPending = false;
  mocks.startConversation.mutateAsync.mockResolvedValue("conv-1");
  mocks.sendMessage.mutateAsync.mockResolvedValue(undefined);
  mocks.submitConsultation.mutateAsync.mockResolvedValue(undefined);
  mocks.bookViewing.isPending = false;
  mocks.bookViewing.mutateAsync.mockResolvedValue({ id: "viewing-1" });
  mocks.createAuctionAlert.mutate.mockImplementation((_payload, options) => options?.onSuccess?.());
  mocks.updateAuctionAlert.mutate.mockImplementation((_payload, options) => options?.onSuccess?.());
  mocks.fromMock.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) });
});

describe("high-coverage interaction modals", () => {
  it("matches professional services, handles retry, navigation, backdrop close, and provider errors", async () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        category: "lawyer",
        services: ["Title search", "Contract review"],
        explanation: "A lawyer should review ownership and contract risk.",
        urgency: "high",
        follow_up_question: "Do you already have the KAEK?",
      },
      error: null,
    });
    const { container } = render(<AIServiceMatchModal onClose={onClose} onNavigate={onNavigate} />);

    expect(screen.getByRole("button", { name: /find my professional/i })).toBeDisabled();
    fireEvent.click(screen.getByText(/clear title/i));
    fireEvent.keyDown(screen.getByPlaceholderText(/lawyer in athens/i), { key: "Enter", shiftKey: false });

    expect(await screen.findByText("Lawyer")).toBeInTheDocument();
    expect(screen.getByText("Title search")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.queryByText("Lawyer")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/lawyer in athens/i), { target: { value: "Need a contract lawyer" } });
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        category: "lawyer",
        services: ["Contract review"],
        explanation: "A lawyer should review contract risk.",
        urgency: "medium",
      },
      error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /find my professional/i }));
    expect(await screen.findByRole("button", { name: /find lawyer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /find lawyer/i }));
    expect(onNavigate).toHaveBeenCalledWith("lawyer");
    expect(onClose).toHaveBeenCalled();

    mocks.invokeMock.mockResolvedValueOnce({ data: null, error: { message: "quota exceeded" } });
    render(<AIServiceMatchModal onClose={onClose} onNavigate={onNavigate} />);
    fireEvent.change(screen.getAllByPlaceholderText(/lawyer in athens/i).at(-1)!, { target: { value: "Need a notary" } });
    fireEvent.click(screen.getAllByRole("button", { name: /find my professional/i }).at(-1)!);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("quota exceeded"));

    fireEvent.click(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("sends messages for signed-in users, gates guests, and opens messages", async () => {
    const onClose = vi.fn();
    mocks.authState.user = { id: "user-1", email: "buyer@example.com" };
    mocks.authState.profile = { display_name: "Buyer One" };
    const professional = { id: "pro-1", user_id: "pro-user", display_name: "Maria Lawyer", title: "Real Estate Lawyer" };
    const { unmount } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SendMessageModal open onClose={onClose} professional={professional} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/hi maria/i), { target: { value: "Can you review a title?" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(mocks.startConversation.mutateAsync).toHaveBeenCalledWith({ other_user_id: "pro-user" }));
    expect(mocks.sendMessage.mutateAsync).toHaveBeenCalledWith({ conversation_id: "conv-1", content: "Can you review a title?" });
    expect(await screen.findByText("Message Sent!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view messages/i }));
    expect(mocks.navigateMock).toHaveBeenCalledWith("/messages");

    unmount();
    mocks.authState.user = null;
    mocks.authState.profile = null;
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SendMessageModal open onClose={onClose} professional={professional} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Sign in to send an inquiry")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.queryByPlaceholderText(/hi maria/i)).not.toBeInTheDocument();
    expect(mocks.submitConsultation.mutateAsync).not.toHaveBeenCalled();
  });

  it("creates and edits auction alerts with typed filters and email notification toggles", () => {
    const onClose = vi.fn();
    const { unmount } = render(<AuctionAlertModal open onClose={onClose} />);

    const [citySelect, typeSelect] = screen.getAllByRole("combobox");
    fireEvent.change(citySelect, { target: { value: "Αθήνα" } });
    fireEvent.change(screen.getByPlaceholderText(/ειρηνοδικείο/i), { target: { value: "Athens Court" } });
    fireEvent.change(typeSelect, { target: { value: "villa" } });
    fireEvent.change(screen.getByPlaceholderText("Min"), { target: { value: "100000" } });
    fireEvent.change(screen.getByPlaceholderText("Max"), { target: { value: "450000" } });
    const emailToggle = screen.getAllByText(/email notifications/i).find((node) => node.tagName === "SPAN");
    expect(emailToggle).toBeDefined();
    fireEvent.click((emailToggle as HTMLElement).previousElementSibling!);
    fireEvent.click(screen.getByRole("button", { name: /create alert/i }));

    expect(mocks.createAuctionAlert.mutate).toHaveBeenCalledWith(expect.objectContaining({
      city: "Αθήνα",
      court_name: "Athens Court",
      property_type: "villa",
      min_price: 100000,
      max_price: 450000,
      email_notify: false,
    }), expect.any(Object));
    expect(onClose).toHaveBeenCalled();

    unmount();
    render(
      <AuctionAlertModal
        open
        onClose={onClose}
        editAlert={{ id: "alert-1", user_id: "user-1", city: "Αθήνα", court_name: null, property_type: "house", min_price: null, max_price: 200000, email_notify: true, active: true, created_at: "" }}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Max"), { target: { value: "300000" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(mocks.updateAuctionAlert.mutate).toHaveBeenCalledWith(expect.objectContaining({
      id: "alert-1",
      updates: expect.objectContaining({ property_type: "house", max_price: 300000 }),
    }), expect.any(Object));
  });

  it("books viewings through the shared booking hook and handles validation failures", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<ViewingDialog open onClose={onClose} property={property} ownerId="owner-1" canVideoView={false} />);

    expect(screen.getByRole("button", { name: /video.*pro or buyers/i })).toBeDisabled();
    fireEvent.click(screen.getAllByText(/mon|tue|wed|thu|fri|sat|sun/i)[0]);
    fireEvent.click(screen.getByText("09:00"));
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
    expect(mocks.toast.error).toHaveBeenCalledWith("Please sign in to request a viewing");

    mocks.authState.user = { id: "user-1", email: "buyer@example.com" };
    mocks.authState.profile = { first_name: "Buyer", phone: "+30210" };
    rerender(<ViewingDialog open onClose={onClose} property={property} ownerId="" />);
    fireEvent.click(screen.getAllByText(/mon|tue|wed|thu|fri|sat|sun/i)[0]);
    fireEvent.click(screen.getByText("09:00"));
    fireEvent.click(screen.getAllByRole("button", { name: /confirm booking/i }).at(-1)!);
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not determine property owner.");

    rerender(<ViewingDialog open onClose={onClose} property={property} ownerId="owner-1" canVideoView />);
    fireEvent.click(screen.getByRole("button", { name: /^video$/i }));
    fireEvent.click(screen.getAllByText(/mon|tue|wed|thu|fri|sat|sun/i)[0]);
    fireEvent.click(screen.getByText("10:00"));
    fireEvent.change(screen.getByPlaceholderText(/requirements/i), { target: { value: "Need remote tour" } });
    fireEvent.click(screen.getAllByRole("button", { name: /confirm booking/i }).at(-1)!);

    await waitFor(() => expect(mocks.bookViewing.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      listing_id: "listing-1",
      owner_id: "owner-1",
      viewing_type: "video",
      note: "Need remote tour",
    })));
    expect(await screen.findByText("successTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
