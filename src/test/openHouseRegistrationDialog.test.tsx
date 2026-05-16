/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const {
  useAuthMock,
  useSubscriptionMock,
  getPlanLimitsMock,
  useOpenHouseSettingsMock,
  useOpenHouseRegistrationsMock,
  useMyOpenHouseRegistrationsMock,
  useCreateOpenHouseRegistrationMock,
  useUpdateOpenHouseRegistrationMock,
  uploadOpenHouseDocMock,
  toastMock,
  createRegMock,
  updateRegMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  getPlanLimitsMock: vi.fn(),
  useOpenHouseSettingsMock: vi.fn(),
  useOpenHouseRegistrationsMock: vi.fn(),
  useMyOpenHouseRegistrationsMock: vi.fn(),
  useCreateOpenHouseRegistrationMock: vi.fn(),
  useUpdateOpenHouseRegistrationMock: vi.fn(),
  uploadOpenHouseDocMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  createRegMock: { mutateAsync: vi.fn() },
  updateRegMock: { mutateAsync: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => useSubscriptionMock() }));
vi.mock("@/hooks/usePlanLimits", () => ({ getPlanLimits: (...a: unknown[]) => getPlanLimitsMock(...a) }));
vi.mock("@/lib/participantConfig", () => ({
  getParticipantTypeFromProfile: (profile: { participant_type?: string } | null) => profile?.participant_type ?? "buyer",
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select aria-label="budget range" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));
vi.mock("@/hooks/useOpenHouseAssetControl", () => ({
  useOpenHouseSettings: (...a: unknown[]) => useOpenHouseSettingsMock(...a),
  useOpenHouseRegistrations: (...a: unknown[]) => useOpenHouseRegistrationsMock(...a),
  useMyOpenHouseRegistrations: () => useMyOpenHouseRegistrationsMock(),
  useCreateOpenHouseRegistration: () => useCreateOpenHouseRegistrationMock(),
  useUpdateOpenHouseRegistration: () => useUpdateOpenHouseRegistrationMock(),
  uploadOpenHouseDoc: (...a: unknown[]) => uploadOpenHouseDocMock(...a),
}));

import OpenHouseRegistrationDialog from "@/components/OpenHouseRegistrationDialog";

const baseSettings = {
  timeslots: [
    { start: "10:00", end: "11:00", max_visitors: 2 },
    { start: "11:00", end: "12:00", max_visitors: 1 },
  ],
  max_total_visitors: null,
  require_proof_of_funds: false,
  require_investor_declaration: false,
};

function renderDialog(props: Partial<React.ComponentProps<typeof OpenHouseRegistrationDialog>> = {}) {
  return render(
    <OpenHouseRegistrationDialog
      open
      onClose={vi.fn()}
      listingId="listing-1"
      listingTitle="Penthouse"
      hasAssetControl
      listingPrice={150000}
      {...props}
    />,
  );
}

function acceptContactPacket() {
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+306900000000" } });
  screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });
  useAuthMock.mockReturnValue({
    user: { id: "user-1", email: "buyer@example.com" },
    profile: { display_name: "Buyer One", participant_type: "buyer" },
  });
  useSubscriptionMock.mockReturnValue({ isPro: false });
  getPlanLimitsMock.mockReturnValue({ openHouseRsvp: 3 });
  useOpenHouseSettingsMock.mockReturnValue({ data: baseSettings });
  useOpenHouseRegistrationsMock.mockReturnValue({ data: [], isLoading: false });
  useMyOpenHouseRegistrationsMock.mockReturnValue({ data: [] });
  createRegMock.mutateAsync.mockReset();
  createRegMock.mutateAsync.mockResolvedValue({ id: "reg-new" });
  updateRegMock.mutateAsync.mockReset();
  updateRegMock.mutateAsync.mockResolvedValue({ id: "reg-new" });
  useCreateOpenHouseRegistrationMock.mockReturnValue(createRegMock);
  useUpdateOpenHouseRegistrationMock.mockReturnValue(updateRegMock);
  uploadOpenHouseDocMock.mockReset();
  uploadOpenHouseDocMock.mockResolvedValue("stored/doc.pdf");
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.warning.mockReset();
});

describe("OpenHouseRegistrationDialog", () => {
  it("blocks contact continuation for anonymous visitors", () => {
    useAuthMock.mockReturnValue({ user: null, profile: null });
    renderDialog();

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Buyer One" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "buyer@example.com" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+306900000000" } });
    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(toastMock.error).toHaveBeenCalledWith("Please sign in to register");
  });

  it("shows fully-booked capacity messaging and disables registration", async () => {
    useOpenHouseSettingsMock.mockReturnValue({ data: { ...baseSettings, max_total_visitors: 1 } });
    useOpenHouseRegistrationsMock.mockReturnValue({
      isLoading: false,
      data: [{ id: "reg-other", requester_id: "someone-else", status: "approved", timeslot_index: 0 }],
    });
    renderDialog();

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("button", { name: /fully booked/i })).toBeDisabled();
  });

  it("shows monthly RSVP limit messaging for free buyers", async () => {
    const thisMonth = new Date();
    useMyOpenHouseRegistrationsMock.mockReturnValue({
      data: Array.from({ length: 3 }).map((_, i) => ({
        id: `mine-${i}`,
        status: "pending",
        created_at: thisMonth.toISOString(),
      })),
    });
    renderDialog();

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText(/RSVP Limit Reached/i);

    expect(screen.getByRole("button", { name: /RSVP Limit Reached/i })).toBeDisabled();
  });

  it("walks a high-value registration through screening, ID, waiver, and qualification", async () => {
    useOpenHouseSettingsMock.mockReturnValue({
      data: {
        ...baseSettings,
        require_proof_of_funds: true,
        require_investor_declaration: true,
      },
    });
    renderDialog({ listingPrice: 250000 });

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /10:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await screen.findByText(/Pre-qualification/i);
    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.change(screen.getByLabelText("budget range"), { target: { value: "200k_500k" } });
    fireEvent.click(screen.getAllByRole("button", { name: "No" })[1]);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(updateRegMock.mutateAsync).toHaveBeenCalledWith({
        id: "reg-new",
        updates: expect.objectContaining({
          mortgage_status: "yes",
          budget_range: "200k_500k",
          working_with_agent: "no",
        }),
      }),
    );

    await screen.findByText(/ID verification/i);
    const idInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(idInput, { target: { files: [new File(["id"], "id.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/liability waiver/i);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /sign/i }));

    await screen.findByText(/Proof of funds/i);
    const proofInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(proofInput, { target: { files: [new File(["pof"], "proof.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByPlaceholderText(/Amount/i), { target: { value: "300000" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await screen.findByText(/Registration Submitted/i);
    expect(uploadOpenHouseDocMock).toHaveBeenCalledTimes(2);
    expect(toastMock.success).toHaveBeenCalledWith("Registration complete. Awaiting approval from asset manager.");
  });

  it("warns but continues when optional screening document upload fails", async () => {
    useOpenHouseSettingsMock.mockReturnValue({ data: baseSettings });
    uploadOpenHouseDocMock.mockRejectedValueOnce(new Error("storage down"));
    renderDialog({ listingPrice: 250000 });

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /10:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await screen.findByText(/Pre-qualification/i);
    const screeningInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(screeningInput, { target: { files: [new File(["x"], "screen.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.change(screen.getByLabelText("budget range"), { target: { value: "200k_500k" } });
    fireEvent.click(screen.getAllByRole("button", { name: "No" })[1]);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith(expect.stringMatching(/upload failed/i)));
    expect(updateRegMock.mutateAsync).toHaveBeenCalledWith({
      id: "reg-new",
      updates: expect.not.objectContaining({ screening_doc_url: expect.anything() }),
    });
  });
});
