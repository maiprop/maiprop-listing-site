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
  useOpenHouseCapacityMock,
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
  useOpenHouseCapacityMock: vi.fn(),
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
  useOpenHouseCapacity: (...a: unknown[]) => useOpenHouseCapacityMock(...a),
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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function acceptContactPacket() {
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+306900000000" } });
  screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
}

// skipcq: JS-0067 - Top-level test helper keeps registration-flow setup consistent.
async function advanceToIdStep(props: Partial<React.ComponentProps<typeof OpenHouseRegistrationDialog>> = {}) {
  renderDialog({ hasAssetControl: false, listingPrice: 150000, ...props });
  acceptContactPacket();
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  fireEvent.click(await screen.findByRole("button", { name: /register/i }));
  await screen.findByText(/ID verification/i);
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
  useOpenHouseCapacityMock.mockReturnValue({ data: null });
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
    useOpenHouseCapacityMock.mockReturnValue({
      data: {
        active_total: 1,
        max_total_visitors: 1,
        slot_counts: [{ slot_index: 0, active_count: 1, max_visitors: 2, full: false }],
      },
    });
    renderDialog();

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("button", { name: /fully booked/i })).toBeDisabled();
  });

  it("normalizes non-array timeslot payloads instead of crashing on the timeslot step", async () => {
    useOpenHouseSettingsMock.mockReturnValue({
      data: {
        ...baseSettings,
        timeslots: { slots: [{ start: "12:00", end: "13:00", max_visitors: "2" }] },
      },
    });
    renderDialog();

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("button", { name: /12:00/i })).toBeInTheDocument();
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

  it("keeps contact continuation disabled until details and permissions are complete", () => {
    renderDialog();

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+306900000000" } });
    expect(continueButton).toBeDisabled();

    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
    expect(continueButton).toBeEnabled();
  });

  it("uses server capacity per slot and submits the selected available slot", async () => {
    useOpenHouseCapacityMock.mockReturnValue({
      data: {
        active_total: 2,
        max_total_visitors: 5,
        slot_counts: [
          { slot_index: 0, active_count: 2, max_visitors: 2, full: true },
          { slot_index: 1, active_count: 0, max_visitors: 1, full: false },
        ],
      },
    });
    renderDialog({ listingPrice: 150000 });

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("button", { name: /10:00/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^11:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() =>
      expect(createRegMock.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        listingId: "listing-1",
        timeslotIndex: 1,
      })),
    );
    expect(await screen.findByText(/ID verification/i)).toBeInTheDocument();
  });

  it("continues an existing RSVP without consuming another registration", async () => {
    useOpenHouseRegistrationsMock.mockReturnValue({
      data: [{
        id: "reg-existing",
        requester_id: "user-1",
        status: "approved",
        contact_name: "Existing Buyer",
        contact_email: "existing@example.com",
        contact_phone: "+306911111111",
        contact_permission_at: "2026-07-01T00:00:00.000Z",
        id_verification_consent_at: "2026-07-01T00:00:00.000Z",
        privacy_acknowledged_at: "2026-07-01T00:00:00.000Z",
      }],
      isLoading: false,
    });
    renderDialog({ listingPrice: 150000 });

    expect(await screen.findByDisplayValue("Existing Buyer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /10:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(createRegMock.mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByText(/ID verification/i)).toBeInTheDocument();
  });

  it("does not apply the free monthly RSVP ceiling to Pro buyers", async () => {
    useSubscriptionMock.mockReturnValue({ isPro: true });
    getPlanLimitsMock.mockReturnValue({ openHouseRsvp: null });
    useMyOpenHouseRegistrationsMock.mockReturnValue({
      data: Array.from({ length: 10 }, (_, i) => ({
        id: `pro-${i}`,
        status: "pending",
        created_at: new Date().toISOString(),
      })),
    });
    renderDialog({ listingPrice: 150000 });

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    fireEvent.click(await screen.findByRole("button", { name: /^10:00/i }));
    expect(screen.getByRole("button", { name: /register/i })).toBeEnabled();
    expect(screen.queryByText(/RSVP Limit Reached/i)).not.toBeInTheDocument();
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

  it("keeps rental open house registration out of sale-only buyer qualification", async () => {
    useOpenHouseSettingsMock.mockReturnValue({
      data: {
        ...baseSettings,
        require_proof_of_funds: true,
        require_investor_declaration: true,
      },
    });
    renderDialog({
      listingPrice: 250000,
      openHouseTransactionType: "rent",
    } as Partial<React.ComponentProps<typeof OpenHouseRegistrationDialog>>);

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /10:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByText(/ID verification/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pre-qualification/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Proof of funds/i)).not.toBeInTheDocument();
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

  it("continues high-value non-asset-control registrations to ID and waiver steps", async () => {
    useOpenHouseSettingsMock.mockReturnValue({ data: null });
    renderDialog({ hasAssetControl: false, listingPrice: 250000 });

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /register/i }));

    await screen.findByText(/Pre-qualification/i);
    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.change(screen.getByLabelText("budget range"), { target: { value: "200k_500k" } });
    fireEvent.click(screen.getAllByRole("button", { name: "No" })[1]);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/ID verification/i)).toBeInTheDocument();
    expect(screen.queryByText(/Registration Submitted/i)).not.toBeInTheDocument();
  });

  it("takes a low-value sale directly to identity verification", async () => {
    await advanceToIdStep();

    expect(screen.queryByText(/Pre-qualification/i)).not.toBeInTheDocument();
    expect(createRegMock.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ listingId: "listing-1" }));
  });

  it("rejects oversized identity documents before storage upload", async () => {
    await advanceToIdStep();
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large-id.pdf", {
      type: "application/pdf",
    });
    const idInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(idInput, { target: { files: [oversized] } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(toastMock.error).toHaveBeenCalledWith("ID document must be under 5 MB");
    expect(uploadOpenHouseDocMock).not.toHaveBeenCalled();
  });

  it("keeps identity verification open when document storage fails", async () => {
    uploadOpenHouseDocMock.mockRejectedValueOnce(new Error("Secure storage unavailable"));
    await advanceToIdStep();
    const idInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(idInput, {
      target: { files: [new File(["id"], "id.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Secure storage unavailable"));
    expect(screen.getByText(/ID verification/i)).toBeInTheDocument();
    expect(screen.queryByText(/liability waiver/i)).not.toBeInTheDocument();
  });

  it("records an investor declaration without requiring proof of funds", async () => {
    useOpenHouseSettingsMock.mockReturnValue({
      data: {
        ...baseSettings,
        require_proof_of_funds: false,
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

    await screen.findByText(/ID verification/i);
    const idInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(idInput, { target: { files: [new File(["id"], "id.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText(/liability waiver/i);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /sign/i }));
    await screen.findByText(/qualified investor/i);
    expect(screen.queryByText(/Proof of funds/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() =>
      expect(updateRegMock.mutateAsync).toHaveBeenLastCalledWith({
        id: "reg-new",
        updates: { investor_declaration_signed_at: expect.any(String) },
      }),
    );
    expect(await screen.findByText(/Registration Submitted/i)).toBeInTheDocument();
  });

  it("repairs an existing RSVP contact packet despite capacity and monthly ceilings", async () => {
    useOpenHouseSettingsMock.mockReturnValue({ data: { ...baseSettings, max_total_visitors: 1 } });
    useOpenHouseCapacityMock.mockReturnValue({
      data: {
        active_total: 1,
        max_total_visitors: 1,
        slot_counts: [
          { slot_index: 0, active_count: 2, max_visitors: 2, full: true },
          { slot_index: 1, active_count: 0, max_visitors: 1, full: false },
        ],
      },
    });
    useMyOpenHouseRegistrationsMock.mockReturnValue({
      data: Array.from({ length: 3 }, (_, index) => ({
        id: `monthly-${index}`,
        created_at: new Date().toISOString(),
        status: "pending",
      })),
    });
    useOpenHouseRegistrationsMock.mockReturnValue({
      data: [{
        id: "reg-existing",
        requester_id: "user-1",
        status: "pending",
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        timeslot_index: 0,
      }],
      isLoading: false,
    });
    renderDialog();

    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+306900000001" } });
    fireEvent.change(screen.getByLabelText(/reason for attending/i), { target: { value: "Investment review" } });
    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(updateRegMock.mutateAsync).toHaveBeenCalledWith({
      id: "reg-existing",
      updates: expect.objectContaining({
        contact_name: "Buyer One",
        contact_email: "buyer@example.com",
        contact_phone: "+306900000001",
        visit_purpose: "Investment review",
      }),
    }));
    expect(await screen.findByRole("button", { name: /10:00/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^11:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/ID verification/i)).toBeInTheDocument();
    expect(createRegMock.mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText(/RSVP limit/i)).not.toBeInTheDocument();
  });

  it("keeps contact details open when repairing an existing RSVP fails", async () => {
    useOpenHouseRegistrationsMock.mockReturnValue({
      data: [{ id: "reg-existing", requester_id: "user-1", status: "pending" }],
      isLoading: false,
    });
    updateRegMock.mutateAsync.mockRejectedValueOnce(new Error("contact update failed"));
    renderDialog();

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(updateRegMock.mutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/^Visitor details$/i)).toBeInTheDocument();
    expect(screen.queryByText(/Select a timeslot/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("rechecks authentication when the session expires before RSVP creation", async () => {
    const view = renderDialog();
    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /10:00/i }));

    useAuthMock.mockReturnValue({ user: null, profile: null });
    view.rerender(
      <OpenHouseRegistrationDialog
        open
        onClose={vi.fn()}
        listingId="listing-1"
        listingTitle="Penthouse"
        hasAssetControl
        listingPrice={150000}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(toastMock.error).toHaveBeenCalledWith("Please sign in to register");
    expect(createRegMock.mutateAsync).not.toHaveBeenCalled();
  });

  it("ignores malformed slots and excludes rejected registrations from fallback capacity", async () => {
    useOpenHouseSettingsMock.mockReturnValue({
      data: {
        ...baseSettings,
        max_visitors_per_slot: 2,
        timeslots: [
          null,
          { start: "09:00" },
          { start: "12:00", end: "13:00", max_visitors: "not-a-number" },
          { start: "13:00", end: "14:00", max_visitors: -5 },
        ],
      },
    });
    useOpenHouseRegistrationsMock.mockReturnValue({
      data: [
        { requester_id: "active-1", status: "pending", timeslot_index: 0 },
        { requester_id: "cancelled-1", status: "cancelled", timeslot_index: 0 },
        { requester_id: "rejected-1", status: "rejected", timeslot_index: 0 },
      ],
      isLoading: false,
    });
    renderDialog();

    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("button", { name: /12:00.*1 \/ 2 booked/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /13:00.*0 \/ 2 booked/i })).toBeEnabled();
    expect(screen.queryByText("09:00")).not.toBeInTheDocument();
  });

  it("shows registration loading and recovers from a failed create mutation", async () => {
    useOpenHouseRegistrationsMock.mockReturnValue({ data: [], isLoading: true });
    const loadingView = renderDialog();
    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("button", { name: /loading/i })).toBeDisabled();
    loadingView.unmount();

    useOpenHouseRegistrationsMock.mockReturnValue({ data: [], isLoading: false });
    createRegMock.mutateAsync.mockRejectedValueOnce(new Error("capacity changed"));
    renderDialog();
    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /10:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => expect(createRegMock.mutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /register/i })).toBeEnabled();
    expect(screen.getByText(/Select a timeslot/i)).toBeInTheDocument();
  });

  it("enforces required sale screening before accepting optional documents", async () => {
    renderDialog({ listingPrice: 250000 });
    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /10:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /register/i }));
    await screen.findByText(/Pre-qualification/i);

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();

    const screeningInput = document.querySelector('input[accept="image/*,application/pdf"]') as HTMLInputElement;
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "screening.pdf", { type: "application/pdf" });
    fireEvent.change(screeningInput, { target: { files: [oversized] } });
    expect(toastMock.error).toHaveBeenCalledWith("File must be under 5 MB");
  });

  it("keeps the POF step actionable when proof upload returns a non-Error failure", async () => {
    useOpenHouseSettingsMock.mockReturnValue({ data: { ...baseSettings, require_proof_of_funds: true } });
    uploadOpenHouseDocMock
      .mockResolvedValueOnce("stored/id.pdf")
      .mockRejectedValueOnce("proof storage unavailable");
    await advanceToIdStep({ hasAssetControl: false, listingPrice: 150000 });

    const idInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(idInput, { target: { files: [new File(["id"], "id.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText(/liability waiver/i);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /sign/i }));

    expect(await screen.findByText(/Proof of funds/i)).toBeInTheDocument();
    const proofInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(proofInput, { target: { files: [new File(["proof"], "proof.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Update failed"));
    expect(screen.getByText(/Proof of funds/i)).toBeInTheDocument();
    expect(screen.queryByText(/Registration Submitted/i)).not.toBeInTheDocument();
  });

  it("renders nothing while closed and resets consent state before reopening", async () => {
    const closed = renderDialog({ open: false });
    expect(closed.container).toBeEmptyDOMElement();
    closed.unmount();

    const view = renderDialog();
    acceptContactPacket();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/Select a timeslot/i)).toBeInTheDocument();

    const baseProps = {
      onClose: vi.fn(),
      listingId: "listing-1",
      listingTitle: "Penthouse",
      hasAssetControl: true,
      listingPrice: 150000,
    };
    view.rerender(<OpenHouseRegistrationDialog open={false} {...baseProps} />);
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(<OpenHouseRegistrationDialog open {...baseProps} />);

    expect(await screen.findByText(/^Visitor details$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toHaveValue("");
    expect(screen.getAllByRole("checkbox").every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  it("covers the Greek high-value asset-control workflow without changing limits", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    useOpenHouseSettingsMock.mockReturnValue({
      data: {
        ...baseSettings,
        require_proof_of_funds: true,
        require_investor_declaration: true,
      },
    });
    renderDialog({ listingPrice: 250000 });

    fireEvent.change(document.querySelector("#oh-contact-name") as HTMLInputElement, {
      target: { value: "Buyer One" },
    });
    fireEvent.change(document.querySelector("#oh-contact-email") as HTMLInputElement, {
      target: { value: "buyer@example.com" },
    });
    fireEvent.change(document.querySelector("#oh-contact-phone") as HTMLInputElement, {
      target: { value: "+306900000000" },
    });
    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: /Συνέχεια/i }));

    fireEvent.click(await screen.findByRole("button", { name: /10:00/i }));
    fireEvent.click(screen.getByRole("button", { name: /Εγγραφή/i }));

    await screen.findByLabelText("budget range");
    let buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    fireEvent.change(screen.getByLabelText("budget range"), { target: { value: "200k_500k" } });
    buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[4]);
    fireEvent.click(screen.getByRole("button", { name: /Συνέχεια/i }));

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

    const idInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(idInput, { target: { files: [new File(["id"], "id.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Συνέχεια/i }));

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Υπογραφή/i }));

    await waitFor(() => expect(document.querySelector('input[type="number"]')).not.toBeNull());
    const proofInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(proofInput, { target: { files: [new File(["pof"], "proof.pdf", { type: "application/pdf" })] } });
    fireEvent.change(document.querySelector('input[type="number"]') as HTMLInputElement, {
      target: { value: "300000" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Υποβολή/i }));

    await waitFor(() => expect(uploadOpenHouseDocMock).toHaveBeenCalledTimes(2));
    expect(toastMock.success).toHaveBeenCalled();
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "en";
  });
});
