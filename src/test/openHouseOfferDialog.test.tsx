import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const {
  useAuthMock,
  useOpenHouseSettingsMock,
  useOpenHouseOffersMock,
  useSubmitOpenHouseOfferMock,
  submitOfferMock,
  toastMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useOpenHouseSettingsMock: vi.fn(),
  useOpenHouseOffersMock: vi.fn(),
  useSubmitOpenHouseOfferMock: vi.fn(),
  submitOfferMock: { mutateAsync: vi.fn(), isPending: false },
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useOpenHouseAssetControl", () => ({
  useOpenHouseSettings: (...a: unknown[]) => useOpenHouseSettingsMock(...a),
  useOpenHouseOffers: (...a: unknown[]) => useOpenHouseOffersMock(...a),
  useSubmitOpenHouseOffer: () => useSubmitOpenHouseOfferMock(),
}));

import OpenHouseOfferDialog from "@/components/OpenHouseOfferDialog";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function renderDialog(props: Partial<React.ComponentProps<typeof OpenHouseOfferDialog>> = {}) {
  const onClose = vi.fn();
  render(
    <OpenHouseOfferDialog
      open
      onClose={onClose}
      listingId="listing-1"
      listingTitle="Open House Villa"
      listingPrice={250000}
      {...props}
    />,
  );
  return onClose;
}

beforeEach(() => {
  useAuthMock.mockReturnValue({ user: { id: "buyer-1" } });
  useOpenHouseSettingsMock.mockReturnValue({
    data: { offer_deadline: new Date(Date.now() + 86_400_000).toISOString() },
  });
  useOpenHouseOffersMock.mockReturnValue({ data: [] });
  submitOfferMock.mutateAsync.mockReset();
  submitOfferMock.mutateAsync.mockResolvedValue({ id: "offer-1" });
  useSubmitOpenHouseOfferMock.mockReturnValue(submitOfferMock);
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("OpenHouseOfferDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <OpenHouseOfferDialog
        open={false}
        onClose={vi.fn()}
        listingId="listing-1"
        listingTitle="Open House Villa"
        listingPrice={250000}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("blocks submit for users who are not eligible to offer", () => {
    renderDialog({ canSubmit: false, offerBlockedReason: "Attend first" });

    expect(screen.getByText("Attend first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit sealed offer/i })).toBeDisabled();
    expect(screen.getByPlaceholderText("250000")).toBeDisabled();
  });

  it("blocks submit after the offer deadline", () => {
    useOpenHouseSettingsMock.mockReturnValue({
      data: { offer_deadline: new Date(Date.now() - 60_000).toISOString() },
    });
    renderDialog();

    expect(screen.getByText(/Deadline passed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit sealed offer/i })).toBeDisabled();
  });

  it("shows the visitor's existing sealed offer instead of the form", () => {
    useOpenHouseOffersMock.mockReturnValue({
      data: [{ id: "offer-existing", bidder_id: "buyer-1", amount: 275000, status: "submitted" }],
    });
    renderDialog();

    expect(screen.getByText(/Your offer:/i)).toBeInTheDocument();
    expect(screen.getByText(/Status: submitted/i)).toBeInTheDocument();
    expect(screen.getByText(/Sealed until reveal/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit sealed offer/i })).not.toBeInTheDocument();
  });

  it("validates auth and positive amount before submitting", () => {
    useAuthMock.mockReturnValue({ user: null });
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /submit sealed offer/i }));
    expect(toastMock.error).toHaveBeenCalledWith("Sign in to submit an offer");

    useAuthMock.mockReturnValue({ user: { id: "buyer-1" } });
  });

  it("validates amount entry", () => {
    renderDialog();

    fireEvent.change(screen.getByPlaceholderText("250000"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /submit sealed offer/i }));

    expect(toastMock.error).toHaveBeenCalledWith("Enter a valid amount");
    expect(submitOfferMock.mutateAsync).not.toHaveBeenCalled();
  });

  it("submits a valid sealed offer and closes the dialog", async () => {
    const onClose = renderDialog();

    fireEvent.change(screen.getByPlaceholderText("250000"), { target: { value: "305000" } });
    fireEvent.change(screen.getByPlaceholderText(/conditions or notes/i), { target: { value: "Cash buyer" } });
    fireEvent.click(screen.getByRole("button", { name: /submit sealed offer/i }));

    await waitFor(() =>
      expect(submitOfferMock.mutateAsync).toHaveBeenCalledWith({
        listingId: "listing-1",
        amount: 305000,
        message: "Cash buyer",
      }),
    );
    expect(toastMock.success).toHaveBeenCalledWith("Offer submitted successfully");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves the dialog open when the submit mutation rejects", async () => {
    submitOfferMock.mutateAsync.mockRejectedValueOnce(new Error("rls"));
    const onClose = renderDialog();

    fireEvent.change(screen.getByPlaceholderText("250000"), { target: { value: "305000" } });
    fireEvent.click(screen.getByRole("button", { name: /submit sealed offer/i }));

    await waitFor(() => expect(submitOfferMock.mutateAsync).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
