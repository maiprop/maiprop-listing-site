import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InvitationRequestModal } from "@/components/InvitationRequestModal";

const { insertMock, toastMock, onClose, onSuccess } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  toastMock: { error: vi.fn() },
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertMock })),
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

const renderModal = (user: { id: string; email?: string } | null = { id: "user-1", email: "USER@EXAMPLE.COM" }) =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InvitationRequestModal user={user} onClose={onClose} onSuccess={onSuccess} />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
});

describe("InvitationRequestModal", () => {
  it("closes from backdrop, close icon, and cancel button", () => {
    const { container } = renderModal();

    fireEvent.click(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("validates required name and terms before submitting", () => {
    renderModal({ id: "user-1", email: "investor@example.com" });

    const form = screen.getByRole("button", { name: /submit request/i }).closest("form")!;
    fireEvent.submit(form);
    expect(toastMock.error).toHaveBeenCalledWith("Please enter your full name");

    fireEvent.change(screen.getByPlaceholderText("John Smith"), { target: { value: "Investor One" } });
    fireEvent.submit(form);
    expect(toastMock.error).toHaveBeenCalledWith("Please accept the terms and privacy policy");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("submits the full investor profile and calls success", async () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("John Smith"), { target: { value: "Investor One" } });
    fireEvent.change(screen.getByPlaceholderText("Phone number"), { target: { value: "+302101234567" } });
    fireEvent.change(screen.getByPlaceholderText("https://linkedin.com/in/..."), { target: { value: "https://linkedin.com/in/investor" } });
    fireEvent.change(screen.getByPlaceholderText("Acme Capital Partners"), { target: { value: "Acme Capital" } });
    fireEvent.change(screen.getByPlaceholderText("Managing Partner, Investment Director"), { target: { value: "Partner" } });
    fireEvent.change(screen.getByPlaceholderText("https://..."), { target: { value: "https://acme.example" } });
    fireEvent.change(screen.getByDisplayValue("Select focus"), { target: { value: "distressed" } });
    fireEvent.change(screen.getByDisplayValue("Select range"), { target: { value: "2m-5m" } });
    fireEvent.change(screen.getByDisplayValue("Select vehicle"), { target: { value: "fund" } });
    fireEvent.change(screen.getByDisplayValue("Select"), { target: { value: "6-10" } });
    fireEvent.change(screen.getByDisplayValue("Select (optional)"), { target: { value: "10m-50m" } });
    fireEvent.change(screen.getByDisplayValue("How did you hear about us?"), { target: { value: "referral" } });
    fireEvent.change(screen.getByPlaceholderText(/Athens/i), { target: { value: "Athens, Greece" } });
    fireEvent.change(screen.getByPlaceholderText(/focus on off-market/i), { target: { value: "Need quick-sale pipeline" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() =>
      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        email: "user@example.com",
        full_name: "Investor One",
        company: "Acme Capital",
        investment_focus: "distressed",
        deal_size_range: "2m-5m",
        investment_vehicle: "fund",
        years_experience: "6-10",
        aum_range: "10m-50m",
        source: "referral",
        user_id: "user-1",
        terms_accepted: true,
      })),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("surfaces Supabase insert errors and clears loading", async () => {
    insertMock.mockResolvedValueOnce({ error: new Error("duplicate request") });
    renderModal({ id: "user-1", email: "investor@example.com" });

    fireEvent.change(screen.getByPlaceholderText("John Smith"), { target: { value: "Investor One" } });
    fireEvent.change(screen.getByPlaceholderText("Acme Capital Partners"), { target: { value: "Acme Capital" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("duplicate request"));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /submit request/i })).not.toBeDisabled();
  });
});
