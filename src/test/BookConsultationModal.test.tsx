import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import BookConsultationModal from "@/components/BookConsultationModal";

const {
  authState,
  servicesState,
  availabilityState,
  submitConsultation,
  toastMock,
  onClose,
} = vi.hoisted(() => ({
  authState: { current: { user: null, profile: null } as unknown },
  servicesState: { current: [] as unknown[] },
  availabilityState: { current: [] as unknown[] },
  submitConsultation: { mutateAsync: vi.fn(), isPending: false },
  toastMock: { error: vi.fn(), info: vi.fn() },
  onClose: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState.current,
}));

vi.mock("@/hooks/useConsultations", () => ({
  useSubmitConsultation: () => submitConsultation,
}));

vi.mock("@/hooks/useProfessionalServices", () => ({
  useProfessionalServices: () => ({ data: servicesState.current }),
  useProfessionalAvailability: () => ({ data: availabilityState.current }),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const professional = {
  id: "pro-1",
  user_id: "owner-1",
  display_name: "Maria Lawyer",
  title: "Real Estate Lawyer",
  category: "lawyer",
  hourly_rate: 150,
  video_link: null,
};

const remoteService = {
  id: "svc-1",
  professional_id: "pro-1",
  service_key: "title_search",
  service_name: "Remote Review",
  description: "Review documents over a call.",
  category: "lawyer",
  pricing_model: "hourly",
  rate_amount: 150,
  currency: "EUR",
  estimated_hours: null,
  video_enabled: true,
  is_premium: true,
  is_active: true,
};

beforeEach(() => {
  authState.current = { user: null, profile: null };
  servicesState.current = [];
  availabilityState.current = [];
  submitConsultation.mutateAsync.mockReset().mockResolvedValue(undefined);
  submitConsultation.isPending = false;
  toastMock.error.mockReset();
  toastMock.info.mockReset();
  onClose.mockReset();
  vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });
  URL.createObjectURL = vi.fn(() => "blob:ics");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BookConsultationModal", () => {
  it("books a video consultation and renders calendar export options", async () => {
    servicesState.current = [remoteService];
    availabilityState.current = [
      { id: "a-1", professional_id: "pro-1", day_of_week: 0, start_time: "09:30", end_time: "11:00", is_active: true },
    ];

    renderWithProviders(
      <BookConsultationModal open onClose={onClose} allowVideoCall professional={professional} />,
    );

    fireEvent.click(screen.getByText("Remote Review"));
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Video Request/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    fireEvent.click(screen.getAllByText("Sun")[0].closest("button") as HTMLElement);
    fireEvent.click(screen.getByText("09:30"));
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Alex Buyer" } });
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByPlaceholderText(/specific questions/i), { target: { value: "Can we review the title?" } });
    fireEvent.click(screen.getByRole("button", { name: /Send Request/i }));

    await waitFor(() => expect(submitConsultation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      professional_id: "pro-1",
      requester_name: "Alex Buyer",
      requester_email: "alex@example.com",
      service: "Remote Review",
      preferred_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      preferred_time: "09:30",
      message: expect.stringContaining("Video consultation requested via maiProp room"),
    })));
    expect(await screen.findByText(/Consultation request received/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Google Calendar/i })).toHaveAttribute("href", expect.stringContaining("calendar.google.com"));
    expect(screen.getByRole("link", { name: /Outlook/i })).toHaveAttribute("href", expect.stringContaining("outlook.live.com"));

    fireEvent.click(screen.getByRole("button", { name: /Download \.ics/i }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("keeps video unavailable for services that do not support it", () => {
    servicesState.current = [{ ...remoteService, id: "svc-2", service_name: "Site Visit", video_enabled: false }];
    renderWithProviders(
      <BookConsultationModal open onClose={onClose} allowVideoCall professional={professional} />,
    );

    fireEvent.click(screen.getByText("Site Visit"));
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Video Request/i }));

    expect(toastMock.info).toHaveBeenCalledWith("This service is not available via video");
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("supports general requests without availability and shows submit errors", async () => {
    submitConsultation.mutateAsync.mockRejectedValue(new Error("network"));
    renderWithProviders(
      <BookConsultationModal open onClose={onClose} allowVideoCall professional={{ ...professional, video_link: "https://meet.example/pro" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Continue as General Consultation/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    expect(screen.getByText(/No availability has been set yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));

    const send = screen.getByRole("button", { name: /Send Request/i });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Guest Buyer" } });
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), { target: { value: "guest@example.com" } });
    fireEvent.click(send);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Could not book consultation. Please try again."));
  });
});
